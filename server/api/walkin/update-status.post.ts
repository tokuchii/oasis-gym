import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { MEMBER_STATUS_IDS, serializePass } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const memberId = String(body?.id ?? '').trim()
  const memberStatus = String(body?.memberStatus ?? '').toLowerCase()

  if (!memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Member ID is required.' })
  }

  if (!MEMBER_STATUS_IDS.includes(memberStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'Member status must be walk-in, weekly, monthly, or yearly.' })
  }

  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('walkin_passes')
    .update({ member_status: memberStatus })
    .eq('id', memberId)
    .eq('removed', false)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error('[Walkin] Status update error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to update membership status. Please try again.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found.' })
  }

  return {
    pass: serializePass(data),
    message: 'Membership status updated.',
  }
})
