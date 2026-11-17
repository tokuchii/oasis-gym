import { logActivity } from '~/server/utils/activity'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const memberId = String(body?.id ?? '').trim()

  if (!memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Member ID is required.' })
  }

  const supabase = useSupabaseAdmin()

  const { data: member, error: fetchError } = await supabase
    .from('walkin_passes')
    .select('id, full_name, phone, email, removed')
    .eq('id', memberId)
    .maybeSingle()

  if (fetchError) {
    console.error('[Walkin] Remove lookup error:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove member. Please try again.' })
  }

  if (!member) {
    throw createError({ statusCode: 404, statusMessage: 'Member not found.' })
  }

  if (member.removed) {
    return { message: `${member.full_name} is already removed.` }
  }

  const { error } = await supabase
    .from('walkin_passes')
    .update({ removed: true })
    .eq('id', memberId)

  if (error) {
    console.error('[Walkin] Remove error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove member. Please try again.' })
  }

  await logActivity(supabase, {
    category: 'delete',
    action: 'member_removed',
    title: 'Member removed',
    description: `${member.full_name} moved to history`,
    clientName: member.full_name,
    clientPhone: member.phone,
    clientEmail: member.email,
    reference: memberId,
  })

  return { message: `${member.full_name} removed. Visit history is kept.` }
})
