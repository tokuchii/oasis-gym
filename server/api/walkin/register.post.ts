import { generatePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, resolvePassStatus, serializePass, validateWalkinPayload } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  const payload = validateWalkinPayload(await readBody(event))
  const supabase = useSupabaseAdmin()
  const visitDate = getVisitDateManila()

  const { data: existing, error: existingError } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('phone', payload.phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw createError({
      statusCode: 500,
      statusMessage: `Lookup failed [${existingError.code}]: ${existingError.message}`,
    })
  }

  if (existing) {
    const pass = serializePass(existing)
    return {
      ...pass,
      qrPayload: pass.passCode,
      message: 'This phone number is already registered. Here is your existing pass.',
      duplicate: true,
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
        const { data: existingAgain } = await supabase
          .from('walkin_passes')
          .select('*')
          .eq('phone', payload.phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existingAgain) {
          const pass = serializePass(existingAgain)
          return {
            ...pass,
            qrPayload: pass.passCode,
            message: 'This phone number is already registered. Here is your existing pass.',
            duplicate: true,
          }
        }
      }
      passCode = generatePassCode()
      continue
    }

    throw createError({
      statusCode: 500,
      statusMessage: `Supabase error [${error?.code}]: ${error?.message}`,
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
