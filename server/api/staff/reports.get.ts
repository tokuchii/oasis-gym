import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila } from '~/server/utils/walkin'

const WALKIN_FEE = 65

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const period = String(query.period ?? 'day')

  const supabase = useSupabaseAdmin()
  const now = new Date()
  const today = getVisitDateManila()

  let dateFrom = today
  let dateTo = today

  if (period === 'week') {
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    dateFrom = getVisitDateManila(monday)
    dateTo = getVisitDateManila(sunday)
  } else if (period === 'month') {
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    dateFrom = getVisitDateManila(firstOfMonth)
    dateTo = getVisitDateManila(lastOfMonth)
  }

  const { data: passes, error: passError } = await supabase
    .from('walkin_passes')
    .select('*')
    .gte('visit_date', dateFrom)
    .lte('visit_date', dateTo)
    .order('visit_date', { ascending: true })

  if (passError) {
    throw createError({ statusCode: 500, statusMessage: passError.message })
  }

  const serialized = (passes ?? []).map((p) => ({
    id: p.id,
    passCode: p.pass_code,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    visitDate: p.visit_date,
    status: p.status,
    paymentAmount: p.payment_amount && p.payment_amount > 0 ? p.payment_amount : WALKIN_FEE,
    createdAt: p.created_at,
    checkedInAt: p.checked_in_at,
  }))

  const totalVisits = serialized.length
  const checkedOut = serialized.filter((p) => p.status === 'checked_in').length
  const totalRevenue = checkedOut * WALKIN_FEE
  const uniquePhones = new Set(serialized.map((p) => p.phone)).size

  const dailyBreakdown: Record<string, { visits: number; checkedOut: number; revenue: number }> = {}
  for (const p of serialized) {
    if (!dailyBreakdown[p.visitDate]) {
      dailyBreakdown[p.visitDate] = { visits: 0, checkedOut: 0, revenue: 0 }
    }
    dailyBreakdown[p.visitDate].visits++
    if (p.status === 'checked_in') {
      dailyBreakdown[p.visitDate].checkedOut++
      dailyBreakdown[p.visitDate].revenue += WALKIN_FEE
    }
  }

  let chartData: { date: string; label: string; visits: number; checkedOut: number; revenue: number }[] = []

  if (period === 'day') {
    const d = dailyBreakdown[today]
    chartData = [{
      date: today,
      label: 'Today',
      visits: d?.visits ?? 0,
      checkedOut: d?.checkedOut ?? 0,
      revenue: d?.revenue ?? 0,
    }]
  } else if (period === 'week') {
    const dayOfWeek = now.getDay()
    const mondayDate = new Date(now)
    mondayDate.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate)
      d.setDate(mondayDate.getDate() + i)
      const dateStr = getVisitDateManila(d)
      const data = dailyBreakdown[dateStr]
      chartData.push({
        date: dateStr,
        label: DAY_NAMES[i],
        visits: data?.visits ?? 0,
        checkedOut: data?.checkedOut ?? 0,
        revenue: data?.revenue ?? 0,
      })
    }
  } else if (period === 'month') {
    const year = now.getFullYear()
    const month = now.getMonth()
    const daysInMonth = getDaysInMonth(year, month)

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${padZero(month + 1)}-${padZero(day)}`
      const data = dailyBreakdown[dateStr]
      chartData.push({
        date: dateStr,
        label: String(day),
        visits: data?.visits ?? 0,
        checkedOut: data?.checkedOut ?? 0,
        revenue: data?.revenue ?? 0,
      })
    }
  }

  return {
    visits: serialized,
    summary: {
      totalVisits,
      checkedOut,
      totalRevenue,
      uniqueMembers: uniquePhones,
      dateFrom,
      dateTo,
      period,
    },
    chartData,
  }
})
