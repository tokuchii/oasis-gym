import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendCertificationEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  const fullName = String(body?.fullName ?? '').trim()
  const email = String(body?.email ?? '').trim()
  const phone = String(body?.phone ?? '').trim()
  const planRaw = String(body?.plan ?? '').trim().toLowerCase()
  const coach = String(body?.coach ?? '').trim() || null
  const paymentMethod = String(body?.paymentMethod ?? '').trim()
  const referenceNo = String(body?.referenceNo ?? '').trim() || null
  const amount = Number(body?.amount)

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

  const now = new Date()
  const expiryDate = new Date(now)
  if (planRaw === 'weekly') {
    expiryDate.setDate(expiryDate.getDate() + 7)
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1)
  }
  const expiryDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(expiryDate)

  const supabase = useSupabaseAdmin()

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
      expiry_date: expiryDateStr,
      reminder_sent: false,
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  sendCertificationEmail({ to: email, fullName, plan: planRaw }).catch(() => {})

  return {
    message: 'Payment submitted successfully. A certification email has been sent to your email address.',
    id: data.id,
  }
})
