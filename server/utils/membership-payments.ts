import type { SupabaseClient } from '@supabase/supabase-js'
import type { GymDatabase } from '~/server/utils/supabase'
import type { MembershipPayment } from '~/types/walkin'

type Db = SupabaseClient<GymDatabase>

export type MembershipPaymentInput = Omit<MembershipPayment, 'id' | 'created_at'>

export interface SaveMembershipPaymentResult {
  payment: MembershipPayment
  updated: boolean
}

function likeEscape(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1')
}

export async function saveMembershipPayment(
  db: Db,
  payload: MembershipPaymentInput,
): Promise<SaveMembershipPaymentResult> {
  const { data: existingRows, error: lookupError } = await db
    .from('membership_payments')
    .select('*')
    .eq('phone', payload.phone)
    .ilike('full_name', likeEscape(payload.full_name))
    .ilike('email', likeEscape(payload.email))
    .order('created_at', { ascending: true })

  if (lookupError) throw lookupError

  const rows = (existingRows ?? []) as MembershipPayment[]
  const now = new Date().toISOString()

  if (rows.length === 0) {
    const { data, error } = await db
      .from('membership_payments')
      .insert({ ...payload, created_at: now })
      .select('*')
      .single()

    if (error) throw error
    return { payment: data as MembershipPayment, updated: false }
  }

  const target = rows[0]
  const { data, error } = await db
    .from('membership_payments')
    .update({ ...payload, created_at: now })
    .eq('id', target.id)
    .select('*')
    .single()

  if (error) throw error

  const duplicateIds = rows.slice(1).map((row) => row.id)
  if (duplicateIds.length > 0) {
    const { error: deleteError } = await db
      .from('membership_payments')
      .delete()
      .in('id', duplicateIds)

    if (deleteError) {
      console.error('[Membership] Failed to remove duplicate payment records:', deleteError.message)
    }
  }

  return { payment: data as MembershipPayment, updated: true }
}
