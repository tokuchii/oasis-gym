import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const status = String(query.status ?? '').trim()
  const coach = String(query.coach ?? '').trim()

  const supabase = useSupabaseAdmin()

  let builder = supabase
    .from('membership_payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    builder = builder.eq('status', status)
  }

  if (coach) {
    builder = builder.eq('coach', coach)
  }

  const { data, error } = await builder

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const payments = (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    plan: row.plan,
    coach: row.coach,
    paymentMethod: row.payment_method,
    referenceNo: row.reference_no,
    amount: row.amount,
    receiptUrl: row.receipt_url,
    status: row.status,
    expiryDate: row.expiry_date,
    createdAt: row.created_at,
  }))

  const summary = {
    total: payments.length,
    pending: payments.filter((p) => p.status === 'pending').length,
    approved: payments.filter((p) => p.status === 'approved').length,
    rejected: payments.filter((p) => p.status === 'rejected').length,
    totalRevenue: payments.filter((p) => p.status === 'approved').reduce((sum, p) => sum + p.amount, 0),
  }

  return { payments, summary }
})
