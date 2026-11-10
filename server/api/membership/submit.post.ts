import { useSupabaseAdmin } from '~/server/utils/supabase'
import { validateMembershipPayload, checkRateLimit } from '~/server/utils/walkin'
import { getPlanDays, getPlanRate, type MembershipPlanId } from '~/types/walkin'

export default defineEventHandler(async (event) => {
  const ip = getRequestHeader(event, 'x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rateError = checkRateLimit(`membership:${ip}`, 3, 300000)
  if (rateError) throw createError({ statusCode: 429, statusMessage: rateError })

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid form data.' })
  }

  const getField = (name: string) => {
    const field = formData.find((f) => f.name === name)
    return field ? Buffer.from(field.data).toString('utf-8').trim() : ''
  }

  const fields = {
    fullName: getField('fullName'),
    email: getField('email'),
    phone: getField('phone'),
    plan: getField('plan'),
    paymentMethod: getField('paymentMethod'),
    referenceNo: getField('referenceNo'),
    amount: getField('amount'),
  }

  const payload = validateMembershipPayload(fields)

  const coach = getField('coach') || null
  const receiptFile = formData.find((f) => f.name === 'receipt')

  if (!receiptFile || !receiptFile.filename) {
    throw createError({ statusCode: 400, statusMessage: 'Payment receipt is required.' })
  }

  const maxSize = 5 * 1024 * 1024
  if (receiptFile.data.length > maxSize) {
    throw createError({ statusCode: 400, statusMessage: 'Receipt file must be under 5MB.' })
  }

  const allowedTypes = ['image/jpeg']
  const ext = receiptFile.filename?.split('.').pop()?.toLowerCase() ?? ''
  const allowedExts = ['jpg', 'jpeg']
  if (!allowedTypes.includes(receiptFile.type ?? '') || !allowedExts.includes(ext)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG images (.jpg/.jpeg) are accepted.' })
  }

  const now = new Date()
  const expiryDate = new Date(now)
  expiryDate.setDate(expiryDate.getDate() + getPlanDays(payload.plan as MembershipPlanId))
  const expiryDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(expiryDate)

  const supabase = useSupabaseAdmin()

  const filePath = `receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadError } = await supabase
    .storage
    .from('oasis-gym')
    .upload(filePath, receiptFile.data, {
      contentType: receiptFile.type ?? 'image/jpeg',
      upsert: false,
    })

  if (uploadError) {
    console.error('[Membership] Upload error:', uploadError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to upload receipt. Please try again.' })
  }

  const { data, error } = await supabase
    .from('membership_payments')
    .insert({
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      plan: payload.plan,
      customer_type: payload.customerType,
      plan_price: getPlanRate(payload.plan as MembershipPlanId, payload.customerType as 'member' | 'non_member'),
      coach,
      payment_method: payload.paymentMethod,
      reference_no: payload.referenceNo || null,
      amount: payload.amount,
      receipt_url: filePath,
      expiry_date: expiryDateStr,
      reminder_sent: false,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Membership] Insert error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to submit payment. Please try again.' })
  }

  return {
    message: 'Payment submitted successfully. You will receive an email once staff verifies your payment.',
    id: data.id,
  }
})
