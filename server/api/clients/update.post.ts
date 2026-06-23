import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

const PLAN_PRICES: Record<string, number> = { weekly: 599, monthly: 1499 }

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const clientId = String(body?.id ?? '')
  const action = String(body?.action ?? '')
  const paidAmount = body?.paidAmount != null ? Number(body.paidAmount) : null
  const note = String(body?.note ?? '').trim() || null

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
      console.error('[Clients] Session update error:', updateError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update session.' })
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
      console.error('[Clients] Session remove error:', updateError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update session.' })
    }

    return { client: updated, message: `Session removed. ${newUsed}/${client.total_sessions} used.` }
  }

  if (action === 'update_payment') {
    const totalAmount = PLAN_PRICES[client.plan] ?? 599
    const updatePayload: Record<string, unknown> = {}
    if (paidAmount != null && !isNaN(paidAmount) && paidAmount > 0) {
      updatePayload.paid_amount = paidAmount
    }
    if (note) updatePayload.note = note

    const { data: updated, error: updateError } = await supabase
      .from('client_sessions')
      .update(updatePayload)
      .eq('id', clientId)
      .select('*')
      .single()

    if (updateError) {
      console.error('[Clients] Payment update error:', updateError)
      throw createError({ statusCode: 500, statusMessage: 'Failed to update payment.' })
    }

    const finalPaid = updated.paid_amount ?? paidAmount ?? client.paid_amount ?? 0
    const isFullyPaid = finalPaid >= totalAmount

    return {
      client: updated,
      message: isFullyPaid
        ? `Payment completed. ₱${finalPaid} of ₱${totalAmount}.`
        : `Payment updated. ₱${finalPaid} of ₱${totalAmount} paid.`,
    }
  }

  throw createError({ statusCode: 400, statusMessage: 'Invalid action.' })
})
