import { requireStaff } from '~/server/utils/auth'
import { isValidPassCodeFormat, normalizePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const passCode = normalizePassCode(String(body?.passCode ?? ''))
  const paymentAmount = Number(body?.paymentAmount ?? 65)

  if (!isValidPassCodeFormat(passCode)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pass code.' })
  }

  if (isNaN(paymentAmount) || paymentAmount < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payment amount.' })
  }

  const supabase = useSupabaseAdmin()
  const { data, error } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('pass_code', passCode)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Pass not found.' })
  }

  const today = getVisitDateManila()

  if (data.visit_date < today) {
    throw createError({ statusCode: 410, statusMessage: 'This pass has expired.' })
  }

  if (data.status === 'checked_in') {
    throw createError({ statusCode: 409, statusMessage: 'This pass has already been checked in.' })
  }

  if (data.status !== 'registered') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pass status.' })
  }

  const { data: updated, error: updateError } = await supabase
    .from('walkin_passes')
    .update({
      status: 'checked_in',
      payment_amount: paymentAmount,
      checked_in_at: new Date().toISOString(),
      checked_in_by: 'staff',
    })
    .eq('pass_code', passCode)
    .eq('status', 'registered')
    .select('*')
    .single()

  if (updateError || !updated) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Pass could not be checked in. It may already be used.',
    })
  }

  return {
    pass: serializePass(updated),
    message: 'Guest checked in successfully.',
  }
})
