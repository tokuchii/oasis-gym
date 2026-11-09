import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { validateCoachPayload } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const payload = validateCoachPayload(await readBody(event))
  const supabase = useSupabaseAdmin()

  const { data: maxOrder } = await supabase
    .from('coaches')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxOrder?.display_order ?? 0) + 1

  const { data, error } = await supabase
    .from('coaches')
    .insert({
      full_name: payload.fullName,
      specialty: payload.specialty || null,
      bio: payload.bio || null,
      photo_url: payload.photoUrl || null,
      display_order: nextOrder,
      active: true,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Coaches] Create error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add coach. Please try again.' })
  }

  return {
    coach: {
      id: data.id,
      fullName: data.full_name,
      specialty: data.specialty,
      bio: data.bio,
      photoUrl: data.photo_url,
    },
    message: 'Coach added successfully.',
  }
})
