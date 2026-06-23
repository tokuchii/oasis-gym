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
    .order('status', { ascending: status === 'pending' ? false : true })
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && ['pending', 'partial', 'approved', 'rejected'].includes(status)) {
    builder = builder.eq('status', status)
  }

  if (coach) {
    builder = builder.eq('coach', coach)
  }

  const { data, error } = await builder

  if (error) {
    console.error('[Membership] List error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load payments.' })
  }

  const approvedEmails = (data ?? [])
    .filter((r) => r.status === 'approved')
    .map((r) => r.email)

  const { data: removedClients } = approvedEmails.length > 0
    ? await supabase
        .from('client_sessions')
        .select('client_email')
        .eq('removed', true)
        .in('client_email', approvedEmails)
    : { data: [] }

  const removedEmailSet = new Set((removedClients ?? []).map((c) => c.client_email))

  let payments = (data ?? []).map((row) => ({
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
    status: row.status as string,
    note: row.note ?? null,
    paidAmount: row.paid_amount ?? null,
    expiryDate: row.expiry_date,
    createdAt: row.created_at,
    isRemoved: removedEmailSet.has(row.email),
  }))

  if (status === 'history') {
    payments = payments.filter((p) => p.isRemoved && p.status === 'approved')
  } else if (status === 'approved') {
    payments = payments.filter((p) => p.status === 'approved' && !p.isRemoved)
  }

  const allApproved = payments.filter((p) => p.status === 'approved')
  const summary = {
    total: payments.length,
    pending: payments.filter((p) => p.status === 'pending').length,
    partial: payments.filter((p) => p.status === 'partial').length,
    approved: payments.filter((p) => p.status === 'approved' && !p.isRemoved).length,
    history: payments.filter((p) => p.status === 'approved' && p.isRemoved).length,
    rejected: payments.filter((p) => p.status === 'rejected').length,
    totalRevenue: allApproved
      .reduce((sum, p) => sum + (p.status === 'partial' && p.paidAmount ? p.paidAmount : p.amount), 0),
  }

  return { payments, summary }
})
