import { logActivity } from '~/server/utils/activity'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const coachId = String(body?.id ?? '')

  if (!coachId) {
    throw createError({ statusCode: 400, statusMessage: 'Coach ID is required.' })
  }

  const supabase = useSupabaseAdmin()

  const { data: coach } = await supabase
    .from('coaches')
    .select('full_name')
    .eq('id', coachId)
    .maybeSingle()

  const { error } = await supabase
    .from('coaches')
    .delete()
    .eq('id', coachId)

  if (error) {
    console.error('[Coaches] Delete error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove coach. Please try again.' })
  }

  await logActivity(supabase, {
    category: 'delete',
    action: 'coach_removed',
    title: 'Coach removed',
    description: coach?.full_name ?? 'Coach removed',
    reference: coachId,
  })

  return { message: 'Coach removed.' }
})
