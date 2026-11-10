import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { CUSTOMER_TYPE_IDS, MEMBER_STATUS_IDS, serializePass } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const memberId = String(body?.id ?? '').trim()
  const memberStatus = body?.memberStatus != null ? String(body.memberStatus).toLowerCase() : ''
  const customerType = body?.customerType != null ? String(body.customerType).toLowerCase() : ''

  if (!memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Member ID is required.' })
  }

  if (!memberStatus && !customerType) {
    throw createError({ statusCode: 400, statusMessage: 'Member status or customer type is required.' })
  }

  if (memberStatus && !MEMBER_STATUS_IDS.includes(memberStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Member status must be daily, weekly, or monthly.' })
  }

  if (customerType && !CUSTOMER_TYPE_IDS.includes(customerType)) {
    throw createError({ statusCode: 400, statusMessage: 'Customer type must be member or non-member.' })
  }

  const updates: Record<string, string> = {}
  if (memberStatus) updates.member_status = memberStatus
  if (customerType) updates.customer_type = customerType

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('walkin_passes')
    .update(updates)
    .eq('id', memberId)
    .eq('removed', false)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[Walkin] Status update error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update client. Please try again.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found.' })
  }

  return {
    pass: serializePass(data),
    message: 'Client updated.',
  }
})
