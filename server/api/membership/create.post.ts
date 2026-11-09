import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, normalizePhone, sanitizeText, validateEmail, validatePhone } from '~/server/utils/walkin'

const PLAN_TERMS: Record<string, { days: number; sessions: number }> = {
  weekly: { days: 7, sessions: 4 },
  monthly: { days: 30, sessions: 13 },
  yearly: { days: 365, sessions: 156 },
}

const PAYMENT_METHODS = ['cash', 'gcash', 'bank']

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const memberId = String(body?.memberId ?? '').trim()
  const fullName = sanitizeText(String(body?.fullName ?? ''))
  const emailRaw = String(body?.email ?? '').trim().toLowerCase()
  const phoneRaw = String(body?.phone ?? '').trim()
  const plan = String(body?.plan ?? '').toLowerCase()
  const paymentMethod = String(body?.paymentMethod ?? '').toLowerCase()
  const referenceNo = sanitizeText(String(body?.referenceNo ?? ''))
  const coach = sanitizeText(String(body?.coach ?? ''))
  const note = sanitizeText(String(body?.note ?? ''))
  const amount = Number(body?.amount)
  const paidAmountRaw = body?.paidAmount

  const errors: string[] = []

  if (!fullName || fullName.length < 2) errors.push('Member name is required.')
  if (fullName.length > 100) errors.push('Member name is too long.')
  if (emailRaw) {
    const emailErr = validateEmail(emailRaw)
    if (emailErr) errors.push(emailErr)
  }
  const phoneErr = validatePhone(phoneRaw)
  if (phoneErr) errors.push(phoneErr)
  if (!PLAN_TERMS[plan]) errors.push('Plan must be weekly, monthly, or yearly.')
  if (!PAYMENT_METHODS.includes(paymentMethod)) errors.push('Payment method must be cash, GCash, or bank transfer.')
  if (isNaN(amount) || amount <= 0 || amount > 500000) errors.push('Amount must be between ₱1 and ₱500,000.')
  if (referenceNo.length > 40) errors.push('Reference number is too long.')
  if (note.length > 200) errors.push('Note is too long (max 200 characters).')

  const paidAmount = paidAmountRaw == null || paidAmountRaw === '' ? amount : Number(paidAmountRaw)
  if (isNaN(paidAmount) || paidAmount <= 0) errors.push('Amount paid must be greater than zero.')

  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: errors.join(' ') })
  }

  const phone = normalizePhone(phoneRaw)
  const startDate = getVisitDateManila()
  const expiryDate = addDays(startDate, PLAN_TERMS[plan].days)

  const supabase = useSupabaseAdmin()

  const { data: payment, error: paymentError } = await supabase
    .from('membership_payments')
    .insert({
      full_name: fullName,
      email: emailRaw,
      phone,
      plan,
      coach: coach || null,
      payment_method: paymentMethod,
      reference_no: referenceNo || null,
      amount,
      receipt_url: null,
      status: 'approved',
      expiry_date: expiryDate,
      note: note || `Recorded by staff (${plan} plan)`,
      paid_amount: paidAmount,
      reminder_sent: false,
    })
    .select('*')
    .single()

  if (paymentError || !payment) {
    console.error('[Membership] Staff transaction insert error:', paymentError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to record transaction. Please try again.' })
  }

  const { error: sessionError } = await supabase
    .from('client_sessions')
    .insert({
      client_name: fullName,
      client_email: emailRaw,
      client_phone: phone,
      coach_name: coach || null,
      plan,
      total_sessions: PLAN_TERMS[plan].sessions,
      sessions_used: 0,
      start_date: startDate,
      end_date: expiryDate,
      status: 'active',
      note: note || `Membership recorded by staff (${plan} plan)`,
      paid_amount: amount,
    })

  if (sessionError) {
    console.error('[Membership] Failed to create client session:', sessionError.message)
  }

  if (memberId) {
    const { error: statusError } = await supabase
      .from('walkin_passes')
      .update({ member_status: plan })
      .eq('id', memberId)
      .eq('removed', false)

    if (statusError) {
      console.error('[Membership] Failed to update member status:', statusError.message)
    }
  }

  return {
    message: `${fullName}'s ${plan} payment of ₱${paidAmount.toLocaleString()} recorded. Expires ${expiryDate}.`,
    payment: {
      id: payment.id,
      fullName,
      plan,
      amount,
      paidAmount,
      expiryDate,
      status: 'approved',
    },
  }
})
