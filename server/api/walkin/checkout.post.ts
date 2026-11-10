import { requireStaff } from '~/server/utils/auth'
import { isValidPassCodeFormat, normalizePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'
import { PLAN_RATES } from '~/types/walkin'

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

  const { data: activeSession } = await supabase
    .from('client_sessions')
    .select('id, sessions_used, total_sessions')
    .eq('client_phone', data.phone)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let sessionsRemaining: number | null = null

  if (activeSession && activeSession.sessions_used < activeSession.total_sessions) {
    const newUsed = activeSession.sessions_used + 1
    const newStatus = newUsed >= activeSession.total_sessions ? 'completed' : 'active'
    const { error: sessionError } = await supabase
      .from('client_sessions')
      .update({ sessions_used: newUsed, status: newStatus })
      .eq('id', activeSession.id)

    if (sessionError) {
      console.error('[Walkin] Failed to consume session:', sessionError.message)
    } else {
      sessionsRemaining = activeSession.total_sessions - newUsed
    }
  }

  return {
    pass: serializePass(updated),
    sessionsRemaining,
    message: sessionsRemaining != null
      ? `Guest checked out successfully. ${sessionsRemaining} session(s) remaining on their plan.`
      : 'Guest checked out successfully.',
  }
})
