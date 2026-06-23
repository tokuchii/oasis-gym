import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

const SESSION_LIMITS: Record<string, number> = { weekly: 4, monthly: 13 }
const PLAN_PRICES: Record<string, number> = { weekly: 599, monthly: 1499 }

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)

  const clientName = String(body?.clientName ?? '').trim()
  const clientEmail = String(body?.clientEmail ?? '').trim()
  const clientPhone = String(body?.clientPhone ?? '').trim()
  const coachName = String(body?.coachName ?? '').trim() || null
  const plan = String(body?.plan ?? '')
  const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : null
  const note = String(body?.note ?? '').trim() || null

  if (!clientName) {
    throw createError({ statusCode: 400, statusMessage: 'Client name is required.' })
  }
  if (!clientEmail) {
    throw createError({ statusCode: 400, statusMessage: 'Client email is required.' })
  }
  if (!clientPhone) {
    throw createError({ statusCode: 400, statusMessage: 'Client phone is required.' })
  }
  if (plan !== 'weekly' && plan !== 'monthly') {
    throw createError({ statusCode: 400, statusMessage: 'Plan must be weekly or monthly.' })
  }

  const totalSessions = SESSION_LIMITS[plan] ?? 4
  const totalAmount = PLAN_PRICES[plan] ?? 599

  const now = new Date()
  const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
  const endDate = new Date(now)
  endDate.setFullYear(endDate.getFullYear() + 1)
  const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(endDate)

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('client_sessions')
    .insert({
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      coach_name: coachName,
      plan,
      total_sessions: totalSessions,
      sessions_used: 0,
      start_date: startDate,
      end_date: endDateStr,
      status: 'active',
      paid_amount: paidAmount != null && !isNaN(paidAmount) ? paidAmount : null,
      note: note ?? (paidAmount != null && !isNaN(paidAmount) ? `Paid ₱${paidAmount} of ₱${totalAmount}` : null),
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Clients] Create error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create client.' })
  }

  const isFullyPaid = paidAmount != null && paidAmount >= totalAmount

  return {
    client: data,
    message: `Client added. ${totalSessions} sessions for ${plan} plan.${isFullyPaid ? ' Fully paid.' : paidAmount != null ? ` ₱${paidAmount} of ₱${totalAmount} paid.` : ' Payment pending.'}`,
  }
})
