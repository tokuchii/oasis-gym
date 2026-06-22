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

  return {
    coaches: (data ?? []).map((c) => ({
      id: c.id,
      fullName: c.full_name,
      specialty: c.specialty,
      bio: c.bio,
      photoUrl: c.photo_url,
    })),
  }
})
