import { generatePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, resolvePassStatus, serializePass, validateWalkinPayload, checkRateLimit } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateError = checkRateLimit(`register:${ip}`, 5, 60000)
  if (rateError) throw createError({ statusCode: 429, statusMessage: rateError })

  const payload = validateWalkinPayload(await readBody(event))
  const supabase = useSupabaseAdmin()
  const visitDate = getVisitDateManila()

  const { data: existing, error: existingError } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('phone', payload.phone)
    .eq('visit_date', visitDate)
    .maybeSingle()

  if (existingError) {
    console.error('[Register] Lookup error:', existingError)
    throw createError({
      statusCode: 500,
      statusMessage: 'An error occurred. Please try again.',
    })
  }

  if (existing) {
    const status = resolvePassStatus(existing)
    if (status === 'registered' || status === 'checked_in') {
      throw createError({
        statusCode: 409,
        statusMessage: 'A day pass for this phone number is already registered today.',
      })
    }
  }

  let passCode = generatePassCode()
  let inserted = null

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from('walkin_passes')
      .insert({
        pass_code: passCode,
        full_name: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        emergency_contact: payload.emergencyContact,
        visit_date: visitDate,
        status: 'registered',
      })
      .select('*')
      .single()

    if (!error && data) {
      inserted = data
      break
    }

    if (error?.code === '23505') {
      if (error.message?.includes('phone')) {
        throw createError({
          statusCode: 409,
          statusMessage: 'A day pass for this phone number is already registered today.',
        })
      }
      passCode = generatePassCode()
      continue
    }

    console.error('[Register] Insert error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to create day pass. Please try again.',
    })
  }

  if (!inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass.' })
  }

  const pass = serializePass(inserted)

  return {
    ...pass,
    qrPayload: pass.passCode,
    message: 'Walk-in account created. Your QR code is permanent — show it at every visit.',
  }
})
