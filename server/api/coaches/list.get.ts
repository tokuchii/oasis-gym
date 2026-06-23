import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async () => {
  const supabase = useSupabaseAdmin()

  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('active', true)
    .order('display_order', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const coaches = await Promise.all(
    (data ?? []).map(async (c) => {
      let photoUrl = c.photo_url
      if (photoUrl && photoUrl.startsWith('coach-photos/')) {
        const { data: signed } = await supabase.storage
          .from('oasis-gym')
          .createSignedUrl(photoUrl, 86400)
        if (signed?.signedUrl) photoUrl = signed.signedUrl
      }
      return {
        id: c.id,
        fullName: c.full_name,
        specialty: c.specialty,
        bio: c.bio,
        photoUrl,
      }
    }),
  )

  return { coaches }
})
