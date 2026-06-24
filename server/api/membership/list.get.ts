import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const status = String(query.status ?? '').trim()
  const coach = String(query.coach ?? '').trim()

  const supabase = useSupabaseAdmin()

  const { data: allData, error: allError } = await supabase
    .from('membership_payments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (allError) {
    console.error('[Membership] List error:', allError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load payments.' })
  }

  const approvedEmails = (allData ?? [])
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

  const mapRow = (row: Record<string, unknown>) => ({
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
    isRemoved: removedEmailSet.has(row.email as string),
  })

  const allPayments = (allData ?? []).map(mapRow)

  const summary = {
    total: allPayments.length,
    pending: allPayments.filter((p) => p.status === 'pending').length,
    partial: allPayments.filter((p) => p.status === 'partial').length,
    approved: allPayments.filter((p) => p.status === 'approved' && !p.isRemoved).length,
    history: allPayments.filter((p) => p.status === 'approved' && p.isRemoved).length,
    rejected: allPayments.filter((p) => p.status === 'rejected').length,
    totalRevenue: allPayments
      .filter((p) => p.status === 'approved' || p.status === 'partial')
      .reduce((sum, p) => sum + (p.paidAmount ?? p.amount), 0),
  }

  let payments = allPayments

  if (status === 'history') {
    payments = payments.filter((p) => p.isRemoved && p.status === 'approved')
  } else if (status === 'approved') {
    payments = payments.filter((p) => p.status === 'approved' && !p.isRemoved)
  } else if (status && ['pending', 'partial', 'rejected'].includes(status)) {
    payments = payments.filter((p) => p.status === status)
  }

  if (coach) {
    payments = payments.filter((p) => p.coach === coach)
  }

  return { payments, summary }
})
