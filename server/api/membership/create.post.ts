import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { getVisitDateManila, normalizePhone, sanitizeText, validateEmail, validatePhone } from '~/server/utils/walkin'
import {
  getPlanDays,
  getPlanRate,
  getPlanSessions,
  planToMemberStatus,
  INSTRUCTOR_FEE,
  MEMBERSHIP_FEE,
  PLAN_TERMS,
  type CustomerType,
  type MembershipPlanId,
} from '~/types/walkin'

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
  const plan = String(body?.plan ?? '').toLowerCase() as MembershipPlanId
  const customerType = String(body?.customerType ?? 'member').toLowerCase() as CustomerType
  const paymentMethod = String(body?.paymentMethod ?? '').toLowerCase()
  const referenceNo = sanitizeText(String(body?.referenceNo ?? ''))
  const coach = sanitizeText(String(body?.coach ?? ''))
  const note = sanitizeText(String(body?.note ?? ''))
  const includeMembershipFee = Boolean(body?.includeMembershipFee)
  const includeInstructorFee = Boolean(body?.includeInstructorFee)
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
  if (!PLAN_TERMS[plan]) errors.push('Plan must be daily, weekly, or monthly.')
  if (!['member', 'non_member'].includes(customerType)) errors.push('Customer type must be member or non-member.')
  if (!PAYMENT_METHODS.includes(paymentMethod)) errors.push('Payment method must be cash, GCash, or bank transfer.')
  if (referenceNo.length > 40) errors.push('Reference number is too long.')
  if (note.length > 200) errors.push('Note is too long (max 200 characters).')

  if (errors.length > 0) {
    throw createError({ statusCode: 400, statusMessage: errors.join(' ') })
  }

  const planPrice = getPlanRate(plan, customerType)
  const membershipFee = includeMembershipFee ? MEMBERSHIP_FEE : 0
  const instructorFee = includeInstructorFee ? INSTRUCTOR_FEE : 0
  const expectedAmount = planPrice + membershipFee + instructorFee

  const amountRaw = body?.amount
  const amount = amountRaw == null || amountRaw === '' ? expectedAmount : Number(amountRaw)
  if (isNaN(amount) || amount <= 0 || amount > 500000) {
    throw createError({ statusCode: 400, statusMessage: 'Amount must be between ₱1 and ₱500,000.' })
  }

  const paidAmount = paidAmountRaw == null || paidAmountRaw === '' ? amount : Number(paidAmountRaw)
  if (isNaN(paidAmount) || paidAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Amount paid must be greater than zero.' })
  }

  const status = paidAmount >= amount ? 'approved' : 'partial'
  const balance = Math.max(0, amount - paidAmount)
  const change = Math.max(0, paidAmount - amount)

  const phone = normalizePhone(phoneRaw)
  const startDate = getVisitDateManila()
  const expiryDate = addDays(startDate, getPlanDays(plan))
  const totalSessions = getPlanSessions(plan)

  const supabase = useSupabaseAdmin()

  const { data: payment, error: paymentError } = await supabase
    .from('membership_payments')
    .insert({
      full_name: fullName,
      email: emailRaw,
      phone,
      plan,
      customer_type: customerType,
      plan_price: planPrice,
      membership_fee: membershipFee,
      instructor_fee: instructorFee,
      coach: coach || null,
      payment_method: paymentMethod,
      reference_no: referenceNo || null,
      amount,
      receipt_url: null,
      status,
      expiry_date: expiryDate,
      note: note || `Recorded by staff (${plan} plan, ${customerType === 'member' ? 'member' : 'non-member'})`,
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
      customer_type: customerType,
      payment_id: payment.id,
      total_sessions: totalSessions,
      sessions_used: 0,
      start_date: startDate,
      end_date: expiryDate,
      status: 'active',
      note: note || `Membership recorded by staff (${plan} plan)`,
      paid_amount: paidAmount,
    })

  if (sessionError) {
    console.error('[Membership] Failed to create client session:', sessionError.message)
  }

  if (memberId) {
    const { error: statusError } = await supabase
      .from('walkin_passes')
      .update({ member_status: planToMemberStatus(plan), customer_type: customerType })
      .eq('id', memberId)
      .eq('removed', false)

    if (statusError) {
      console.error('[Membership] Failed to update member status:', statusError.message)
    }
  }

  const paymentMessage = status === 'partial'
    ? `${fullName}'s ${plan} payment recorded as PARTIAL. ₱${paidAmount.toLocaleString()} of ₱${amount.toLocaleString()} paid — ₱${balance.toLocaleString()} balance. Expires ${expiryDate}.`
    : `${fullName}'s ${plan} payment of ₱${paidAmount.toLocaleString()} recorded. ${change > 0 ? `₱${change.toLocaleString()} change. ` : ''}Expires ${expiryDate}.`

  return {
    message: paymentMessage,
    payment: {
      id: payment.id,
      fullName,
      plan,
      customerType,
      planPrice,
      amount,
      paidAmount,
      balance,
      change,
      expiryDate,
      status,
    },
  }
})
