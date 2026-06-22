import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendCertificationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid form data.' })
  }

  const getField = (name: string) => {
    const field = formData.find((f) => f.name === name)
    return field ? Buffer.from(field.data).toString('utf-8').trim() : ''
  }

  const fullName = getField('fullName')
  const email = getField('email')
  const phone = getField('phone')
  const planRaw = getField('plan').toLowerCase()
  const coach = getField('coach') || null
  const paymentMethod = getField('paymentMethod')
  const referenceNo = getField('referenceNo') || null
  const amount = Number(getField('amount'))
  const receiptFile = formData.find((f) => f.name === 'receipt')

  if (!fullName) {
    throw createError({ statusCode: 400, statusMessage: 'Full name is required.' })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid email is required.' })
  }
  if (!phone) {
    throw createError({ statusCode: 400, statusMessage: 'Phone number is required.' })
  }
  if (!/^(09|\+639)\d{9}$/.test(phone)) {
    throw createError({ statusCode: 400, statusMessage: 'Phone must be a valid Philippine mobile number (09XXXXXXXXX).' })
  }
  if (planRaw !== 'weekly' && planRaw !== 'monthly') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan. Must be weekly or monthly.' })
  }
  if (!paymentMethod) {
    throw createError({ statusCode: 400, statusMessage: 'Payment method is required.' })
  }
  if (isNaN(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Valid payment amount is required.' })
  }
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
  if (!allowedTypes.includes(receiptFile.type ?? '') && !allowedExts.includes(ext)) {
    throw createError({ statusCode: 400, statusMessage: 'Only JPEG images (.jpg/.jpeg) are accepted.' })
  }

  const now = new Date()
  const expiryDate = new Date(now)
  if (planRaw === 'weekly') {
    expiryDate.setDate(expiryDate.getDate() + 7)
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1)
  }
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
    throw createError({ statusCode: 500, statusMessage: `Failed to upload receipt: ${uploadError.message}` })
  }

  const { data, error } = await supabase
    .from('membership_payments')
    .insert({
      full_name: fullName,
      email,
      phone,
      plan: planRaw,
      coach,
      payment_method: paymentMethod,
      reference_no: referenceNo,
      amount,
      receipt_url: filePath,
      expiry_date: expiryDateStr,
      reminder_sent: false,
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  let emailSent = false
  let emailError = ''
  try {
    await sendCertificationEmail({ to: email, fullName, plan: planRaw })
    emailSent = true
  } catch (err) {
    console.error('[Membership] Failed to send certification email:', err)
    emailError = err instanceof Error ? err.message : String(err)
  }

  return {
    message: emailSent
      ? 'Payment submitted successfully. A certification email has been sent to your email address.'
      : 'Payment submitted successfully. Email notification could not be sent — please check with staff.',
    emailSent,
    emailError: emailSent ? undefined : emailError,
    id: data.id,
  }
})
