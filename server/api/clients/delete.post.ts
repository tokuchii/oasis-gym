import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const clientId = String(body?.id ?? '')

  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required.' })
  }

  const supabase = useSupabaseAdmin()
  const { error } = await supabase
    .from('client_sessions')
    .delete()
    .eq('id', clientId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { message: 'Client removed.' }
})
