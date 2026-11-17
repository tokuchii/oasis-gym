import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { createPaidSession } from '~/server/utils/sessions'
import { sendMembershipApprovedEmail, sendMembershipRejectedEmail, sendCertificationEmail } from '~/server/utils/email'
import { getPlanDays, type CustomerType, type MembershipPlanId } from '~/types/walkin'

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

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
  if ((status === 'partial' || status === 'approved') && paidAmount != null && !isNaN(paidAmount) && paidAmount > 0) {
    updatePayload.paid_amount = paidAmount
  }
  if (status === 'approved' && existing.status === 'pending') {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
    updatePayload.expiry_date = addDays(today, getPlanDays(existing.plan as MembershipPlanId))
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

  const wasAlreadyActivated = existing.status === 'approved' || existing.status === 'partial'

  if ((status === 'approved' || status === 'partial') && !wasAlreadyActivated) {
    const plan = existing.plan as MembershipPlanId

    await createPaidSession(supabase, {
      clientName: existing.full_name,
      clientEmail: existing.email ?? '',
      clientPhone: existing.phone,
      coachName: existing.coach || null,
      plan,
      customerType: (existing.customer_type ?? 'member') as CustomerType,
      paymentId: existing.id,
      paidAmount: paidAmount ?? existing.paid_amount ?? existing.amount,
      note: note ?? `Auto-created from membership (${plan} plan)`,
    })
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
        expiryDate: data.expiry_date ?? undefined,
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
    message: `Payment ${status === 'approved' ? 'approved' : status === 'partial' ? 'marked as partial' : 'rejected'} successfully.${status === 'approved' || status === 'partial' ? ' Client session active.' : ''}${emailSent ? ' Email sent.' : ''}`,
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
