import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'

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

  const serialized = (passes ?? []).map(serializePass)

  const totalVisits = serialized.length
  const checkedIn = serialized.filter((p) => p.status === 'checked_in').length
  const totalRevenue = serialized
    .filter((p) => p.status === 'checked_in')
    .reduce((sum, p) => sum + (p.paymentAmount ?? 0), 0)
  const uniquePhones = new Set(serialized.map((p) => p.phone)).size

  const dailyBreakdown: Record<string, { visits: number; checkedIn: number; revenue: number }> = {}
  for (const p of serialized) {
    if (!dailyBreakdown[p.visitDate]) {
      dailyBreakdown[p.visitDate] = { visits: 0, checkedIn: 0, revenue: 0 }
    }
    dailyBreakdown[p.visitDate].visits++
    if (p.status === 'checked_in') {
      dailyBreakdown[p.visitDate].checkedIn++
      dailyBreakdown[p.visitDate].revenue += p.paymentAmount ?? 0
    }
  }

  const chartData = Object.entries(dailyBreakdown)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      visits: d.visits,
      checkedIn: d.checkedIn,
      revenue: d.revenue,
    }))

  return {
    visits: serialized,
    summary: {
      totalVisits,
      checkedIn,
      totalRevenue,
      uniqueMembers: uniquePhones,
      dateFrom,
      dateTo,
      period,
    },
    chartData,
  }
})
