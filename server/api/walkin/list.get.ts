import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { serializePass } from '~/server/utils/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const includeCheckedIn = String(getQuery(event).all ?? '') === '1'

  const supabase = useSupabaseAdmin()
  const { data, error } = await supabase
    .from('walkin_passes')
    .select('*')
    .eq('removed', false)
    .order('full_name', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[Walkin] List error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load members. Please try again.' })
  }

  const members = (data ?? [])
    .map(serializePass)
    .filter((m) => includeCheckedIn || m.status === 'registered')

  return { members }
})
