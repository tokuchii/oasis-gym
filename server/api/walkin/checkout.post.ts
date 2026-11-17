import type { ClientSession, CustomerType, MembershipPlanId } from '~/types/walkin'
import { logActivity } from '~/server/utils/activity'
import { requireStaff } from '~/server/utils/auth'
import { isValidPassCodeFormat, normalizePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { ensureRegistrationSession, getClientSessions, logSessionUsage } from '~/server/utils/sessions'
import { sendSessionCompletedEmail, sendSessionLowReminder } from '~/server/utils/email'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'
import { getPlanSessions, PLAN_RATES } from '~/types/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const passCode = normalizePassCode(String(body?.passCode ?? ''))
  const paymentAmount = Number(body?.paymentAmount ?? PLAN_RATES.non_member.daily)

  if (!isValidPassCodeFormat(passCode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pass code.' })
  }

  if (isNaN(paymentAmount) || paymentAmount < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payment amount.' })
  }

  const supabase = useSupabaseAdmin()
  const today = getVisitDateManila()

  const { data, error } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('pass_code', passCode)
    .maybeSingle()

  if (error) {
    console.error('[Walkin] Checkout lookup error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to look up pass. Please try again.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Pass not found. This pass code is not registered.' })
  }

  if (data.status === 'checked_in' && data.checked_in_at) {
    const lastCheckout = new Date(data.checked_in_at)
    const lastCheckoutDate = getVisitDateManila(lastCheckout)

    if (lastCheckoutDate >= today) {
      throw createError({ statusCode: 409, statusMessage: 'Already checked out today. Come back tomorrow for another session.' })
    }
  }

  const memberStatus = data.member_status ?? 'walkin'
  const isPlanMember = memberStatus === 'weekly' || memberStatus === 'monthly'
  const plan: MembershipPlanId = memberStatus === 'monthly' ? 'monthly' : memberStatus === 'weekly' ? 'weekly' : 'daily'

  let session: ClientSession | null = null

  if (isPlanMember) {
    let rows: ClientSession[]
    try {
      rows = await getClientSessions(supabase, {
        name: data.full_name,
        email: data.email ?? '',
        phone: data.phone,
      })
    } catch (err) {
      console.error('[Walkin] Session lookup error:', err)
      throw createError({ statusCode: 500, statusMessage: 'Failed to check plan sessions. Please try again.' })
    }
    const usable = rows.find(
      (row) => row.end_date >= today
        && row.sessions_used < getPlanSessions(row.plan)
        && (row.status === 'active' || row.status === 'completed'),
    )

    if (usable) {
      session = usable
    } else if (rows.length === 0) {
      session = await ensureRegistrationSession(supabase, {
        clientName: data.full_name,
        clientEmail: data.email ?? '',
        clientPhone: data.phone,
        plan,
        customerType: (data.customer_type ?? 'member') as CustomerType,
        note: 'Auto-created on first check-out',
      })

      if (!session) {
        throw createError({ statusCode: 500, statusMessage: 'Failed to start a session plan. Please try again.' })
      }
    } else {
      const latest = rows[0]
      const expired = latest.status === 'expired' || latest.end_date < today
      throw createError({
        statusCode: 409,
        statusMessage: expired
          ? `Their ${memberStatus} plan expired on ${latest.end_date}. Please renew them in the Payment tab.`
          : `No sessions remaining on their ${memberStatus} plan. Please renew them in the Payment tab.`,
      })
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('walkin_passes')
    .update({
      status: 'checked_in',
      visit_date: today,
      payment_amount: paymentAmount,
      checked_in_at: new Date().toISOString(),
      checked_in_by: 'staff',
      points: (data.points ?? 0) + 2.5,
    })
    .eq('pass_code', passCode)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('[Walkin] Checkout update error:', updateError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to check out. Please try again.' })
  }

  let sessionsRemaining: number | null = null
  let sessionsUsed: number | null = null
  let totalSessions: number | null = null

  if (session) {
    const expectedTotal = getPlanSessions(session.plan)
    const newUsed = session.sessions_used + 1
    const isComplete = newUsed >= expectedTotal

    const { data: updatedSession, error: sessionError } = await supabase
      .from('client_sessions')
      .update({
        sessions_used: newUsed,
        total_sessions: expectedTotal,
        status: isComplete ? 'completed' : 'active',
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .eq('id', session.id)
      .select('*')
      .single()

    if (sessionError) {
      console.error('[Walkin] Failed to consume session:', sessionError.message)
    } else {
      sessionsRemaining = expectedTotal - newUsed
      sessionsUsed = newUsed
      totalSessions = expectedTotal

      await logSessionUsage(supabase, updatedSession as ClientSession, passCode)

      const email = String(updatedSession.client_email ?? '').trim()
      if (email) {
        try {
          if (isComplete && !updatedSession.completion_notified) {
            await sendSessionCompletedEmail({
              to: email,
              fullName: updatedSession.client_name,
              plan: updatedSession.plan,
            })
            await supabase
              .from('client_sessions')
              .update({ completion_notified: true })
              .eq('id', updatedSession.id)
          } else if (sessionsRemaining > 0 && sessionsRemaining <= 2 && !updatedSession.low_session_reminder_sent) {
            await sendSessionLowReminder({
              to: email,
              fullName: updatedSession.client_name,
              plan: updatedSession.plan,
              remaining: sessionsRemaining,
              expiryDate: updatedSession.end_date,
            })
            await supabase
              .from('client_sessions')
              .update({ low_session_reminder_sent: true })
              .eq('id', updatedSession.id)
          }
        } catch (err) {
          console.error('[Walkin] Session notification failed:', err)
        }
      }
    }
  }

  let message = 'Guest checked out successfully.'

  if (sessionsRemaining != null) {
    message = sessionsRemaining > 0
      ? `Guest checked out successfully. ${sessionsRemaining} session(s) remaining on their ${memberStatus} plan.`
      : `Guest checked out successfully. This completes their ${memberStatus} plan — renewal needed.`
  }

  const sessionSummary = sessionsUsed != null && totalSessions != null
    ? ` · ${sessionsUsed}/${totalSessions} sessions${sessionsRemaining != null ? ` (${sessionsRemaining} left)` : ''}`
    : ''

  await logActivity(supabase, {
    category: 'checkout',
    action: 'session_checkout',
    title: 'Session checked out',
    description: `${updated.full_name} checked out${sessionSummary}`,
    clientName: updated.full_name,
    clientPhone: updated.phone,
    clientEmail: updated.email,
    amount: paymentAmount,
    reference: passCode,
    metadata: sessionsUsed != null && totalSessions != null
      ? {
          plan: session?.plan ?? plan,
          memberStatus,
          sessionsUsed,
          totalSessions,
          sessionsRemaining: sessionsRemaining ?? 0,
        }
      : { memberStatus },
  })

  return {
    pass: serializePass(updated),
    sessionsRemaining,
    sessionsUsed,
    totalSessions,
    message,
  }
})
