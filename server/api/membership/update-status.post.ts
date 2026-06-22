import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { sendMembershipApprovedEmail, sendMembershipRejectedEmail } from '~/server/utils/email'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const id = String(body?.id ?? '').trim()
  const status = String(body?.status ?? '').trim()

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Payment ID is required.' })
  }

  if (!['approved', 'rejected'].includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Status must be "approved" or "rejected".' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('membership_payments')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  let emailSent = false
  let emailError = ''

  try {
    if (status === 'approved') {
      await sendMembershipApprovedEmail({
        to: data.email,
        fullName: data.full_name,
        plan: data.plan,
        expiryDate: data.expiry_date ?? 'unknown',
      })
    } else {
      await sendMembershipRejectedEmail({
        to: data.email,
        fullName: data.full_name,
        plan: data.plan,
      })
    }
    emailSent = true
  } catch (err) {
    console.error(`[Membership] Failed to send ${status} email:`, err)
    emailError = err instanceof Error ? err.message : String(err)
  }

  return {
    message: `Payment ${status === 'approved' ? 'approved' : 'rejected'} successfully.${emailSent ? ` ${status === 'approved' ? 'Approval' : 'Rejection'} email sent.` : emailError ? ` Email could not be sent: ${emailError}` : ''}`,
    emailSent,
    payment: {
      id: data.id,
      fullName: data.full_name,
      status: data.status,
    },
  }
})
