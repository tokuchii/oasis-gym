import { generatePassCode } from '~/server/utils/pass-code'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { checkRateLimit, getVisitDateManila, serializePass, validateWalkinPayload } from '~/server/utils/walkin'

function likeEscape(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1')
}

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateError = checkRateLimit(`walkin-register:${ip}`, 10, 300000)
  if (rateError) throw createError({ statusCode: 429, statusMessage: rateError })

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
    console.error('[Walkin] Register lookup error:', existingError)
    throw createError({ statusCode: 500, statusMessage: 'Registration failed. Please try again.' })
  }

  if (existing && !existing.removed) {
    return { duplicate: true, message: 'This phone number is already registered.' }
  }

  if (payload.email) {
    const { data: emailExisting, error: emailError } = await supabase
      .from('walkin_passes')
      .select('id')
      .ilike('email', likeEscape(payload.email))
      .eq('removed', false)
      .limit(1)
      .maybeSingle()

    if (emailError) {
      console.error('[Walkin] Register email lookup error:', emailError)
      throw createError({ statusCode: 500, statusMessage: 'Registration failed. Please try again.' })
    }
    if (emailExisting) {
      throw createError({ statusCode: 409, statusMessage: 'This email is already registered to another walk-in.' })
    }
  }

  const { data: nameExisting, error: nameError } = await supabase
    .from('walkin_passes')
    .select('id')
    .ilike('full_name', likeEscape(payload.fullName))
    .eq('removed', false)
    .limit(1)
    .maybeSingle()

  if (nameError) {
    console.error('[Walkin] Register name lookup error:', nameError)
    throw createError({ statusCode: 500, statusMessage: 'Registration failed. Please try again.' })
  }
  if (nameExisting) {
    throw createError({ statusCode: 409, statusMessage: 'This full name is already registered to another walk-in.' })
  }

  if (existing) {
    const { data: restored, error: restoreError } = await supabase
      .from('walkin_passes')
      .update({
        full_name: payload.fullName,
        email: payload.email,
        emergency_contact: payload.emergencyContact,
        member_status: payload.memberStatus,
        customer_type: payload.customerType,
        removed: false,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (restoreError || !restored) {
      console.error('[Walkin] Register restore error:', restoreError)
      throw createError({ statusCode: 500, statusMessage: 'Registration failed. Please try again.' })
    }

    return {
      ...serializePass(restored),
      restored: true,
      message: 'Returning member restored. Their original pass code still works.',
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
        member_status: payload.memberStatus,
        customer_type: payload.customerType,
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
          return { duplicate: true, message: 'This phone number is already registered.' }
        }
      }
      passCode = generatePassCode()
      continue
    }

    console.error('[Walkin] Register insert error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass. Please try again.' })
  }

  if (!inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass.' })
  }

  const pass = serializePass(inserted)

  return {
    ...pass,
    message: 'Walk-in account created. Show your pass code at every visit.',
  }
})
