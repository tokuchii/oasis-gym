import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendMembershipApprovedEmail, sendMembershipRejectedEmail, sendCertificationEmail } from '~/server/utils/email'

const SESSION_LIMITS: Record<string, number> = { weekly: 4, monthly: 13, yearly: 156 }

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const id = String(body?.id ?? '').trim()
  const status = String(body?.status ?? '').trim()
  const note = String(body?.note ?? '').trim() || null
  const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : null

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Payment ID is required.' })
  }

  if (!['approved', 'rejected', 'partial'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Status must be "approved", "rejected", or "partial".' })
  }

  const supabase = useSupabaseAdmin()

  const { data: existing, error: fetchErr } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found.' })
  }

  const updatePayload: Record<string, unknown> = { status }
  if (note) updatePayload.note = note
  if (status === 'partial' && paidAmount != null && !isNaN(paidAmount) && paidAmount > 0) {
    updatePayload.paid_amount = paidAmount
  }

  const { data, error } = await supabase
    .from('membership_payments')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[Membership] Update error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update payment. Please try again.' })
  }

  if (status === 'approved') {
    const totalSessions = SESSION_LIMITS[existing.plan] ?? 4
    const now = new Date()
    const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
    const endDate = new Date(now)
    endDate.setFullYear(endDate.getFullYear() + 1)
    const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(endDate)

    const { error: sessionError } = await supabase
      .from('client_sessions')
      .insert({
        client_name: existing.full_name,
        client_email: existing.email,
        client_phone: existing.phone,
        coach_name: existing.coach || null,
        plan: existing.plan,
        total_sessions: totalSessions,
        sessions_used: 0,
        start_date: startDate,
        end_date: endDateStr,
        status: 'active',
        note: note ?? `Auto-created from membership (${existing.plan} plan)`,
        paid_amount: existing.amount,
      })

    if (sessionError) {
      console.error('[Membership] Failed to create client session:', sessionError.message)
    }
  }

  let emailSent = false

  try {
    if (status === 'approved') {
      await sendMembershipApprovedEmail({
        to: data.email,
        fullName: data.full_name,
        plan: data.plan,
        expiryDate: data.expiry_date ?? 'unknown',
      })
      await sendCertificationEmail({
        to: data.email,
        fullName: data.full_name,
        plan: data.plan,
      })
    } else if (status === 'rejected') {
      await sendMembershipRejectedEmail({
        to: data.email,
        fullName: data.full_name,
        plan: data.plan,
      })
    }
    emailSent = true
  } catch (err) {
    console.error(`[Membership] Failed to send ${status} email:`, err)
  }

  return {
    message: `Payment ${status === 'approved' ? 'approved' : status === 'partial' ? 'marked as partial' : 'rejected'} successfully.${status === 'approved' ? ' Client session created.' : ''}${emailSent ? ' Email sent.' : ''}`,
    emailSent,
    payment: {
      id: data.id,
      fullName: data.full_name,
      status: data.status,
      note: data.note,
      paidAmount: data.paid_amount,
    },
  }
})
