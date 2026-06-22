import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { validateCoachPayload } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const coachId = String(body?.id ?? '')

  if (!coachId) {
    throw createError({ statusCode: 400, statusMessage: 'Coach ID is required.' })
  }

  const payload = validateCoachPayload(body)
  const supabase = useSupabaseAdmin()

  const { error } = await supabase
    .from('coaches')
    .update({
      full_name: payload.fullName,
      specialty: payload.specialty || null,
      bio: payload.bio || null,
      photo_url: payload.photoUrl || null,
    })
    .eq('id', coachId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { message: 'Coach updated successfully.' }
})
