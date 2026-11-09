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
  const { error } = await supabase
    .from('coaches')
    .delete()
    .eq('id', coachId)

  if (error) {
    console.error('[Coaches] Delete error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to remove coach. Please try again.' })
  }

  return { message: 'Coach removed.' }
})
