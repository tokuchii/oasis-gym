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

  const { data: client, error: fetchErr } = await supabase
    .from('client_sessions')
    .select('*')
    .eq('id', clientId)
    .single()

  if (fetchErr || !client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found.' })
  }

  const { error } = await supabase
    .from('client_sessions')
    .update({ removed: true })
    .eq('id', clientId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { message: `${client.client_name} moved to history.` }
})
