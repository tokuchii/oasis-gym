import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const body = await readBody(event)
  const id = String(body?.id ?? '').trim()
  const addAmount = body?.addAmount != null ? Number(body.addAmount) : null
  const note = String(body?.note ?? '').trim() || null

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Payment ID is required.' })
  }

  if (!addAmount || isNaN(addAmount) || addAmount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Amount must be greater than 0.' })
  }

  const supabase = useSupabaseAdmin()

  const { data: existing, error: fetchErr } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Payment not found.' })
  }

  if (existing.status !== 'partial') {
    throw createError({ statusCode: 400, statusMessage: 'Payment must be in partial status to add a payment.' })
  }

  const currentPaid = existing.paid_amount ?? 0
  const newTotal = currentPaid + addAmount
  const remaining = existing.amount - newTotal
  const overpayment = remaining < 0 ? Math.abs(remaining) : 0

  const updatePayload: Record<string, unknown> = {
    paid_amount: newTotal,
    status: 'partial',
  }
  if (note) updatePayload.note = note

  const { data, error } = await supabase
    .from('membership_payments')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    console.error('[Membership] Add partial error:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to add payment. Please try again.' })
  }

  const fullyPaid = remaining <= 0

  return {
    message: overpayment > 0
      ? `₱${addAmount.toLocaleString()} added. ₱${newTotal.toLocaleString()} paid (₱${overpayment.toLocaleString()} overpaid) — ready for approval.`
      : fullyPaid
        ? `₱${addAmount.toLocaleString()} added. ₱${newTotal.toLocaleString()} of ₱${existing.amount.toLocaleString()} paid — ready for approval.`
        : `₱${addAmount.toLocaleString()} added. ₱${newTotal.toLocaleString()} of ₱${existing.amount.toLocaleString()} paid (₱${Math.max(0, remaining).toLocaleString()} remaining).`,
    overpayment,
    payment: {
      id: data.id,
      fullName: data.full_name,
      status: data.status,
      paidAmount: data.paid_amount,
    },
  }
})
