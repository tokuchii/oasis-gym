import type { SupabaseClient } from '@supabase/supabase-js'
import type { GymDatabase } from '~/server/utils/supabase'
import type { CustomerType, MembershipPayment } from '~/types/walkin'
import { getVisitDateManila } from '~/server/utils/walkin'

type Db = SupabaseClient<GymDatabase>

export type MembershipPaymentInput = Omit<MembershipPayment, 'id' | 'created_at'>

export interface SaveMembershipPaymentResult {
  payment: MembershipPayment
  updated: boolean
}

export interface CheckoutPaymentInput {
  fullName: string
  email: string
  phone: string
  customerType: CustomerType
  amount: number
  visitDate: string
  reference?: string | null
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

export async function recordCheckoutPayment(
  db: Db,
  input: CheckoutPaymentInput,
): Promise<MembershipPayment | null> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return null

  const { data: existingRows, error: lookupError } = await db
    .from('membership_payments')
    .select('*')
    .eq('phone', input.phone)
    .ilike('full_name', likeEscape(input.fullName))
    .ilike('email', likeEscape(input.email))
    .eq('plan', 'daily')
    .order('created_at', { ascending: false })

  if (lookupError) throw lookupError

  const payload = {
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    plan: 'daily' as const,
    customer_type: input.customerType,
    plan_price: input.amount,
    membership_fee: 0,
    instructor_fee: 0,
    coach: null,
    payment_method: 'cash',
    reference_no: input.reference ?? null,
    amount: input.amount,
    receipt_url: null,
    status: 'approved' as const,
    expiry_date: input.visitDate,
    note: 'Walk-in payment recorded at check-out',
    paid_amount: input.amount,
    reminder_sent: true,
  }

  const sameVisit = ((existingRows ?? []) as MembershipPayment[]).find(
    (row) => getVisitDateManila(new Date(row.created_at)) === input.visitDate,
  )

  if (sameVisit) {
    const { data, error } = await db
      .from('membership_payments')
      .update(payload)
      .eq('id', sameVisit.id)
      .select('*')
      .single()

    if (error) throw error
    return data as MembershipPayment
  }

  const { data, error } = await db
    .from('membership_payments')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('*')
    .single()

  if (error) throw error
  return data as MembershipPayment
}
