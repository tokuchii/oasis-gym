import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila } from '~/server/utils/walkin'

const WALKIN_FEE = 65

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const period = String(query.period ?? 'day')
  const startDate = String(query.startDate ?? '')
  const endDate = String(query.endDate ?? '')

  const supabase = useSupabaseAdmin()
  const today = getVisitDateManila()

  let dateFrom = startDate || today
  let dateTo = endDate || today

  if (!startDate && !endDate) {
    const now = new Date()
    if (period === 'week') {
      const dayOfWeek = now.getDay()
      const monday = new Date(now)
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
      dateFrom = getVisitDateManila(monday)
    } else if (period === 'month') {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      dateFrom = getVisitDateManila(firstOfMonth)
    }
  }

  const { data: passes, error: passError } = await supabase
    .from('walkin_passes')
    .select('*')
    .gte('visit_date', dateFrom)
    .lte('visit_date', dateTo)
    .order('visit_date', { ascending: false })

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

  const chartData = Object.entries(dailyBreakdown)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      visits: d.visits,
      checkedOut: d.checkedOut,
      revenue: d.revenue,
    }))

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
