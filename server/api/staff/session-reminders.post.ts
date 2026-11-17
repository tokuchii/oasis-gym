import { getPlanSessions, type ClientSession } from '~/types/walkin'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendSessionLowReminder } from '~/server/utils/email'
import { getVisitDateManila } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const supabase = useSupabaseAdmin()
  const today = getVisitDateManila()

  const { data, error } = await supabase
    .from('client_sessions')
    .select('*')
    .eq('removed', false)
    .eq('low_session_reminder_sent', false)
    .limit(5000)

  if (error) {
    console.error('[Session Reminders] Query error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load plan sessions.' })
  }

  const candidates = ((data ?? []) as ClientSession[]).filter((session) => {
    if (session.plan === 'daily') return false
    if (session.status !== 'active' || session.end_date < today) return false
    const remaining = getPlanSessions(session.plan) - session.sessions_used
    return remaining > 0 && remaining <= 2 && Boolean(session.client_email?.trim())
  })

  let sent = 0
  let failed = 0
  const errors: { email: string; error: string }[] = []

  for (const session of candidates) {
    try {
      await sendSessionLowReminder({
        to: session.client_email,
        fullName: session.client_name,
        plan: session.plan,
        remaining: getPlanSessions(session.plan) - session.sessions_used,
        expiryDate: session.end_date,
      })

      await supabase
        .from('client_sessions')
        .update({ low_session_reminder_sent: true })
        .eq('id', session.id)

      sent++
    } catch (err) {
      failed++
      const errMsg = err instanceof Error ? err.message : String(err)
      errors.push({ email: session.client_email, error: errMsg })
      console.error(`[Session Reminders] Failed to send to ${session.client_email}:`, errMsg)
    }
  }

  return {
    message: candidates.length === 0
      ? 'No low-session reminders to send.'
      : `Sent ${sent} session reminder(s).${failed > 0 ? ` ${failed} failed.` : ''}`,
    sent,
    failed,
    total: candidates.length,
    errors,
  }
})
