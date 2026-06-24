import type { WalkinPass } from '~/types/walkin'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila } from '~/server/utils/walkin'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
    const firstOfYear = new Date(now.getFullYear(), 0, 1)
    const lastOfYear = new Date(now.getFullYear(), 11, 31)
    dateFrom = getVisitDateManila(firstOfYear)
    dateTo = getVisitDateManila(lastOfYear)
  }

  const [{ data: passes, error: passError }, { data: payments, error: payError }] = await Promise.all([
    supabase
      .from('walkin_passes')
      .select('id, pass_code, full_name, phone, email, visit_date, status, payment_amount, created_at, checked_in_at')
      .gte('visit_date', dateFrom)
      .lte('visit_date', dateTo)
      .order('checked_in_at', { ascending: false, nullsFirst: false }),
    supabase
      .from('membership_payments')
      .select('id, full_name, email, phone, plan, amount, paid_amount, status, created_at')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at', { ascending: false }),
  ])

  if (passError) {
    throw createError({ statusCode: 500, statusMessage: passError.message })
  }
  if (payError) {
    console.error('[Reports] Membership payment error:', payError)
  }

  const serialized = ((passes ?? []) as WalkinPass[]).map((p) => ({
    id: p.id,
    passCode: p.pass_code,
    fullName: p.full_name,
    phone: p.phone,
    email: p.email,
    visitDate: p.visit_date,
    status: p.status,
    paymentAmount: p.payment_amount && p.payment_amount > 0 ? p.payment_amount : null,
    createdAt: p.created_at,
    checkedInAt: p.checked_in_at,
  }))

  const membershipPayments = ((payments ?? []) as { id: string; full_name: string; email: string; phone: string; plan: string; amount: number; paid_amount: number | null; status: string; created_at: string }[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    plan: r.plan,
    amount: r.amount,
    paidAmount: r.paid_amount ?? r.amount,
    status: r.status,
    createdAt: r.created_at,
  }))

  const totalVisits = serialized.length
  const checkedOut = serialized.filter((p) => p.status === 'checked_in').length
  const walkinRevenue = serialized.filter((p) => p.status === 'checked_in').reduce((sum, p) => sum + (p.paymentAmount ?? 0), 0)
  const membershipRevenue = membershipPayments
    .filter((p) => p.status === 'approved' || p.status === 'partial')
    .reduce((sum, p) => sum + (p.paidAmount ?? p.amount), 0)
  const totalRevenue = walkinRevenue + membershipRevenue
  const uniquePhones = new Set(serialized.map((p) => p.phone)).size

  const dailyWalkinRevenue: Record<string, number> = {}
  const dailyMembershipRevenue: Record<string, number> = {}
  const dailyBreakdown: Record<string, { visits: number; checkedOut: number; revenue: number }> = {}

  for (const p of serialized) {
    if (!dailyBreakdown[p.visitDate]) {
      dailyBreakdown[p.visitDate] = { visits: 0, checkedOut: 0, revenue: 0 }
    }
    dailyBreakdown[p.visitDate].visits++
    if (p.status === 'checked_in') {
      dailyBreakdown[p.visitDate].checkedOut++
      dailyBreakdown[p.visitDate].revenue += p.paymentAmount ?? 0
    }
  }

  for (const p of membershipPayments) {
    if (p.status !== 'approved' && p.status !== 'partial') continue
    const dateKey = p.createdAt.slice(0, 10)
    dailyMembershipRevenue[dateKey] = (dailyMembershipRevenue[dateKey] ?? 0) + (p.paidAmount ?? p.amount)
  }

  let chartData: { date: string; label: string; visits: number; checkedOut: number; revenue: number; walkinRevenue: number; membershipRevenue: number }[] = []

  if (period === 'day') {
    const d = dailyBreakdown[today]
    chartData = [{
      date: today,
      label: 'Today',
      visits: d?.visits ?? 0,
      checkedOut: d?.checkedOut ?? 0,
      revenue: d?.revenue ?? 0,
      walkinRevenue: d?.revenue ?? 0,
      membershipRevenue: dailyMembershipRevenue[today] ?? 0,
    }]
    chartData[0].revenue = chartData[0].walkinRevenue + chartData[0].membershipRevenue
  } else if (period === 'week') {
    const dayOfWeek = now.getDay()
    const mondayDate = new Date(now)
    mondayDate.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate)
      d.setDate(mondayDate.getDate() + i)
      const dateStr = getVisitDateManila(d)
      const data = dailyBreakdown[dateStr]
      const wRev = data?.revenue ?? 0
      const mRev = dailyMembershipRevenue[dateStr] ?? 0
      chartData.push({
        date: dateStr,
        label: DAY_NAMES[i],
        visits: data?.visits ?? 0,
        checkedOut: data?.checkedOut ?? 0,
        walkinRevenue: wRev,
        membershipRevenue: mRev,
        revenue: wRev + mRev,
      })
    }
  } else if (period === 'month') {
    const year = now.getFullYear()

    for (let m = 0; m < 12; m++) {
      const monthStart = `${year}-${padZero(m + 1)}-01`
      const lastDay = new Date(year, m + 1, 0).getDate()
      const monthEnd = `${year}-${padZero(m + 1)}-${padZero(lastDay)}`

      let monthVisits = 0
      let monthCheckedOut = 0
      let monthWalkinRevenue = 0
      let monthMembershipRevenue = 0

      for (const [dateStr, data] of Object.entries(dailyBreakdown)) {
        if (dateStr >= monthStart && dateStr <= monthEnd) {
          monthVisits += data.visits
          monthCheckedOut += data.checkedOut
          monthWalkinRevenue += data.revenue
        }
      }

      for (const [dateStr, rev] of Object.entries(dailyMembershipRevenue)) {
        if (dateStr >= monthStart && dateStr <= monthEnd) {
          monthMembershipRevenue += rev
        }
      }

      chartData.push({
        date: monthStart,
        label: MONTH_NAMES[m],
        visits: monthVisits,
        checkedOut: monthCheckedOut,
        walkinRevenue: monthWalkinRevenue,
        membershipRevenue: monthMembershipRevenue,
        revenue: monthWalkinRevenue + monthMembershipRevenue,
      })
    }
  }

  return {
    visits: serialized,
    summary: {
      totalVisits,
      checkedOut,
      totalRevenue,
      walkinRevenue,
      membershipRevenue,
      uniqueMembers: uniquePhones,
      dateFrom,
      dateTo,
      period,
    },
    chartData,
  }
})
