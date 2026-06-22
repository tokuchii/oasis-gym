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
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { message: 'Coach removed.' }
})
