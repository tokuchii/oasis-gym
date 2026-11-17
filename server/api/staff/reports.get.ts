import { getPlanSessions, type ClientSession, type SessionUsage, type WalkinPass } from '~/types/walkin'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { clientIdentityKey } from '~/server/utils/sessions'
import { getVisitDateManila } from '~/server/utils/walkin'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function padZero(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  let period = String(query.period ?? 'day')
  const requestedDate = String(query.date ?? '').trim()
  const hasRequestedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
  const requestedFrom = String(query.from ?? '').trim()
  const requestedTo = String(query.to ?? '').trim()
  const hasRequestedRange = /^\d{4}-\d{2}-\d{2}$/.test(requestedFrom)
    && /^\d{4}-\d{2}-\d{2}$/.test(requestedTo)
    && requestedFrom <= requestedTo

  const supabase = useSupabaseAdmin()
  const now = new Date()
  const today = getVisitDateManila()

  let dateFrom = hasRequestedDate ? requestedDate : hasRequestedRange ? requestedFrom : today
  let dateTo = hasRequestedDate ? requestedDate : hasRequestedRange ? requestedTo : today

  if (hasRequestedDate) {
    period = 'day'
  } else if (hasRequestedRange) {
    period = 'range'
  } else if (period === 'week') {
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
  } else if (period === 'year') {
    const firstOfYear = new Date(now.getFullYear(), 0, 1)
    const lastOfYear = new Date(now.getFullYear(), 11, 31)
    dateFrom = getVisitDateManila(firstOfYear)
    dateTo = getVisitDateManila(lastOfYear)
  }

  const [
    { data: passes, error: passError },
    { data: payments, error: payError },
    { data: allPassDates },
    { data: allPaymentDates },
    { data: sessionRows },
    { data: usageRows },
  ] = await Promise.all([
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
    supabase.from('walkin_passes').select('visit_date').limit(5000),
    supabase.from('membership_payments').select('created_at').limit(5000),
    supabase.from('client_sessions').select('*').eq('removed', false).limit(5000),
    supabase
      .from('client_session_usage')
      .select('*')
      .gte('used_date', dateFrom)
      .lte('used_date', dateTo)
      .limit(5000),
  ])

  if (passError) {
    console.error('[Reports] Pass query error:', passError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load reports. Please try again.' })
  }
  if (payError) {
    console.error('[Reports] Membership payment error:', payError)
  }

  const planSessionRows = ((sessionRows ?? []) as ClientSession[]).filter(
    (session) => session.plan === 'weekly' || session.plan === 'monthly',
  )
  const sessionTotalFor = (session: ClientSession) => getPlanSessions(session.plan)
  const sessionUsable = (session: ClientSession) => session.end_date >= today
    && session.sessions_used < sessionTotalFor(session)
    && (session.status === 'active' || session.status === 'completed')

  const sessionByIdentity = new Map<string, ClientSession>()
  for (const session of planSessionRows) {
    const key = clientIdentityKey(session.client_name, session.client_phone, session.client_email)
    const current = sessionByIdentity.get(key)
    if (!current || (!sessionUsable(current) && sessionUsable(session))) {
      sessionByIdentity.set(key, session)
    }
  }

  const serialized = ((passes ?? []) as WalkinPass[]).map((p) => {
    const session = sessionByIdentity.get(clientIdentityKey(p.full_name, p.phone, p.email))
    const totalSessions = session ? sessionTotalFor(session) : 0
    return {
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
      session: session
        ? {
            plan: session.plan,
            totalSessions,
            sessionsUsed: session.sessions_used,
            sessionsRemaining: Math.max(0, totalSessions - session.sessions_used),
          }
        : null,
    }
  })

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

  const sessions = planSessionRows
  const usage = ((usageRows ?? []) as SessionUsage[]).filter((row) => row.plan !== 'daily')
  const totalFor = (session: ClientSession) => getPlanSessions(session.plan)
  const activeSessions = sessions.filter(
    (s) => s.end_date >= today
      && s.sessions_used < totalFor(s)
      && (s.status === 'active' || s.status === 'completed'),
  )
  const completedSessions = sessions.filter((s) => s.status === 'completed' && s.sessions_used >= totalFor(s))
  const expiredSessions = sessions.filter((s) => s.status === 'expired' || (s.end_date < today && s.status !== 'completed'))
  const sessionsRemaining = activeSessions.reduce(
    (sum, s) => sum + Math.max(0, totalFor(s) - s.sessions_used),
    0,
  )

  const sessionAlerts: {
    id: string
    fullName: string
    email: string
    phone: string
    plan: string
    sessionsUsed: number
    totalSessions: number
    sessionsRemaining: number
    endDate: string
    type: 'low' | 'expired'
  }[] = []

  for (const session of sessions) {
    const expectedTotal = totalFor(session)
    if (session.sessions_used >= expectedTotal) continue
    const remaining = Math.max(0, expectedTotal - session.sessions_used)
    const expired = session.status === 'expired' || session.end_date < today
    if (!expired && remaining > 2) continue
    sessionAlerts.push({
      id: session.id,
      fullName: session.client_name,
      email: session.client_email,
      phone: session.client_phone,
      plan: session.plan,
      sessionsUsed: session.sessions_used,
      totalSessions: expectedTotal,
      sessionsRemaining: remaining,
      endDate: session.end_date,
      type: expired ? 'expired' : 'low',
    })
  }

  sessionAlerts.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'expired' ? -1 : 1
    return a.sessionsRemaining - b.sessionsRemaining
  })

  sessionAlerts.splice(50)

  const planSessions = sessions.map((session) => {
    const totalSessions = totalFor(session)
    const sessionsRemaining = Math.max(0, totalSessions - session.sessions_used)
    const expired = session.status === 'expired' || (session.end_date < today && session.status !== 'completed')
    const status: 'active' | 'completed' | 'expired' = session.status === 'completed'
      ? 'completed'
      : expired ? 'expired' : 'active'

    return {
      id: session.id,
      fullName: session.client_name,
      email: session.client_email,
      phone: session.client_phone,
      plan: session.plan,
      customerType: session.customer_type,
      sessionsUsed: session.sessions_used,
      totalSessions,
      sessionsRemaining,
      startDate: session.start_date,
      endDate: session.end_date,
      status,
    }
  }).sort((a, b) => {
    const rank = { active: 0, expired: 1, completed: 2 }
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    if (a.status === 'active') {
      return a.sessionsRemaining - b.sessionsRemaining || a.endDate.localeCompare(b.endDate)
    }
    return b.endDate.localeCompare(a.endDate)
  })

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
    const chartDate = dateFrom
    const d = dailyBreakdown[chartDate]
    chartData = [{
      date: chartDate,
      label: chartDate === today ? 'Today' : chartDate,
      visits: d?.visits ?? 0,
      checkedOut: d?.checkedOut ?? 0,
      revenue: d?.revenue ?? 0,
      walkinRevenue: d?.revenue ?? 0,
      membershipRevenue: dailyMembershipRevenue[chartDate] ?? 0,
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
  } else if (period === 'month' || period === 'year') {
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

  const availableDates = Array.from(new Set([
    ...(allPassDates ?? []).map((r) => String(r.visit_date ?? '')),
    ...(allPaymentDates ?? []).map((r) => String(r.created_at ?? '').slice(0, 10)),
  ])).filter(Boolean).sort((a, b) => b.localeCompare(a))

  return {
    visits: serialized,
    availableDates,
    planSessions,
    sessionAlerts,
    summary: {
      totalVisits,
      checkedOut,
      totalRevenue,
      walkinRevenue,
      membershipRevenue,
      uniqueMembers: uniquePhones,
      sessionsUsedInPeriod: usage.length,
      activePlans: activeSessions.length,
      sessionsRemaining,
      completedPlans: completedSessions.length,
      expiredPlans: expiredSessions.length,
      dateFrom,
      dateTo,
      period,
    },
    chartData,
  }
})
