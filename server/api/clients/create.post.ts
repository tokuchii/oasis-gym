import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)

  const clientName = String(body?.clientName ?? '').trim()
  const clientEmail = String(body?.clientEmail ?? '').trim()
  const clientPhone = String(body?.clientPhone ?? '').trim()
  const coachName = String(body?.coachName ?? '').trim() || null
  const plan = String(body?.plan ?? '')

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

  const totalSessions = plan === 'weekly' ? 4 : 13

  const now = new Date()
  const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
  const endDate = new Date(now.getTime() + (plan === 'weekly' ? 7 : 30) * 24 * 60 * 60 * 1000)
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
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    client: data,
    message: `Client added. ${totalSessions} sessions for ${plan} plan.`,
  }
})
