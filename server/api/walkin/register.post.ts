import { generatePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, resolvePassStatus, serializePass, validateWalkinPayload } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  const payload = validateWalkinPayload(await readBody(event))
  const supabase = useSupabaseAdmin()
  const visitDate = getVisitDateManila()

  const { data: existing } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('phone', payload.phone)
    .eq('visit_date', visitDate)
    .maybeSingle()

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
      passCode = generatePassCode()
      continue
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message ?? 'Failed to create day pass.',
    })
  }

  if (!inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass.' })
  }

  const pass = serializePass(inserted)

  return {
    ...pass,
    qrPayload: pass.passCode,
    message: 'Day pass registered. Show your QR code or pass code at the front desk.',
  }
})
