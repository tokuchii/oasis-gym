import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const clientId = String(body?.id ?? '')
  const action = String(body?.action ?? '')

  if (!clientId) {
    throw createError({ statusCode: 400, statusMessage: 'Client ID is required.' })
  }

  const supabase = useSupabaseAdmin()

  const { data: client, error: fetchError } = await supabase
    .from('client_sessions')
    .select('*')
    .eq('id', clientId)
    .single()

  if (fetchError || !client) {
    throw createError({ statusCode: 404, statusMessage: 'Client not found.' })
  }

  if (action === 'add_session') {
    if (client.sessions_used >= client.total_sessions) {
      throw createError({ statusCode: 400, statusMessage: 'All sessions have been used.' })
    }

    const newUsed = client.sessions_used + 1
    const newStatus = newUsed >= client.total_sessions ? 'completed' : 'active'

    const { data: updated, error: updateError } = await supabase
      .from('client_sessions')
      .update({ sessions_used: newUsed, status: newStatus })
      .eq('id', clientId)
      .select('*')
      .single()

    if (updateError) {
      throw createError({ statusCode: 500, statusMessage: updateError.message })
    }

    return { client: updated, message: `Session ${newUsed}/${client.total_sessions} completed.` }
  }

  if (action === 'remove_session') {
    if (client.sessions_used <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'No sessions to remove.' })
    }

    const newUsed = client.sessions_used - 1
    const { data: updated, error: updateError } = await supabase
      .from('client_sessions')
      .update({ sessions_used: newUsed, status: 'active' })
      .eq('id', clientId)
      .select('*')
      .single()

    if (updateError) {
      throw createError({ statusCode: 500, statusMessage: updateError.message })
    }

    return { client: updated, message: `Session removed. ${newUsed}/${client.total_sessions} used.` }
  }

  throw createError({ statusCode: 400, statusMessage: 'Invalid action.' })
})
