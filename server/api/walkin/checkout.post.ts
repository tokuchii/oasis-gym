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
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Pass not found. This QR code is not registered.' })
  }

  const today = getVisitDateManila()

  if (data.visit_date < today) {
    throw createError({ statusCode: 410, statusMessage: 'This pass has expired. Register a new walk-in for today.' })
  }

  if (data.status === 'checked_in') {
    throw createError({ statusCode: 409, statusMessage: 'This pass was already checked out today.' })
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
    .eq('visit_date', today)
    .select('*')
    .single()

  if (updateError || !updated) {
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to check out. ${updateError?.message ?? 'Unknown error'}`,
    })
  }

  return {
    pass: serializePass(updated),
    message: 'Guest checked out successfully.',
  }
})
