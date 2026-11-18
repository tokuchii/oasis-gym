import { generatePassCode } from '~/server/utils/pass-code'
import { logActivity } from '~/server/utils/activity'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { saveMembershipPayment } from '~/server/utils/membership-payments'
import { addPlanDays, ensureRegistrationSession } from '~/server/utils/sessions'
import { checkRateLimit, getVisitDateManila, serializePass, validateWalkinPayload } from '~/server/utils/walkin'
import { getPlanDays, getPlanRate, type CustomerType, type MembershipPlanId } from '~/types/walkin'

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

  async function startPlanSession(pass: { full_name: string; email: string; phone: string; member_status: string; customer_type: string }) {
    if (pass.member_status !== 'weekly' && pass.member_status !== 'monthly') return
    await ensureRegistrationSession(supabase, {
      clientName: pass.full_name,
      clientEmail: pass.email,
      clientPhone: pass.phone,
      plan: pass.member_status as MembershipPlanId,
      customerType: (pass.customer_type ?? 'member') as CustomerType,
      note: `Created from registration (${pass.member_status} plan)`,
    })
  }

  async function recordRegistrationPayment(pass: { full_name: string; email: string; phone: string; member_status: string; customer_type: string }) {
    const plan: MembershipPlanId = pass.member_status === 'weekly' || pass.member_status === 'monthly'
      ? pass.member_status
      : 'daily'
    const customerType = (pass.customer_type ?? 'non_member') as CustomerType
    const amount = getPlanRate(plan, customerType)
    if (!amount || amount <= 0) return

    try {
      await saveMembershipPayment(supabase, {
        full_name: pass.full_name,
        email: pass.email,
        phone: pass.phone,
        plan,
        customer_type: customerType,
        plan_price: amount,
        membership_fee: 0,
        instructor_fee: 0,
        coach: null,
        payment_method: 'cash',
        reference_no: null,
        amount,
        receipt_url: null,
        status: 'approved',
        expiry_date: plan === 'daily' ? visitDate : addPlanDays(visitDate, getPlanDays(plan)),
        note: `Recorded at registration (${pass.member_status} plan)`,
        paid_amount: amount,
        reminder_sent: true,
      })
    } catch (err) {
      console.error('[Walkin] Failed to record registration payment:', err)
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('phone', payload.phone)
    .ilike('full_name', likeEscape(payload.fullName))
    .ilike('email', likeEscape(payload.email))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    console.error('[Walkin] Register lookup error:', existingError)
    throw createError({ statusCode: 500, statusMessage: 'Registration failed. Please try again.' })
  }

  if (existing && !existing.removed) {
    return { duplicate: true, message: 'This client is already registered with the same name, phone number, and email.' }
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

    await startPlanSession(restored)

    await logActivity(supabase, {
      category: 'register',
      action: 'member_restored',
      title: 'Returning member restored',
      description: `${restored.full_name} restored · ${restored.member_status} plan`,
      clientName: restored.full_name,
      clientPhone: restored.phone,
      clientEmail: restored.email,
      reference: restored.pass_code,
      metadata: { memberStatus: restored.member_status, customerType: restored.customer_type },
    })

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
      passCode = generatePassCode()
      continue
    }

    console.error('[Walkin] Register insert error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass. Please try again.' })
  }

  if (!inserted) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create day pass.' })
  }

  await startPlanSession(inserted)
  await recordRegistrationPayment(inserted)

  await logActivity(supabase, {
    category: 'register',
    action: 'member_registered',
    title: 'New member registered',
    description: `${inserted.full_name} · ${inserted.member_status} plan`,
    clientName: inserted.full_name,
    clientPhone: inserted.phone,
    clientEmail: inserted.email,
    reference: inserted.pass_code,
    metadata: { memberStatus: inserted.member_status, customerType: inserted.customer_type },
  })

  const pass = serializePass(inserted)

  return {
    ...pass,
    message: 'Walk-in account created. Show your pass code at every visit.',
  }
})
