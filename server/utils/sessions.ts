import type { SupabaseClient } from '@supabase/supabase-js'
import type { GymDatabase } from '~/server/utils/supabase'
import type { ClientSession, CustomerType, MembershipPlanId } from '~/types/walkin'
import { getPlanDays, getPlanSessions } from '~/types/walkin'
import { getVisitDateManila } from '~/server/utils/walkin'

type Db = SupabaseClient<GymDatabase>

export interface SessionSeed {
  clientName: string
  clientEmail: string
  clientPhone: string
  plan: MembershipPlanId
  customerType: CustomerType
  coachName?: string | null
  paymentId?: string | null
  paidAmount?: number | null
  note?: string | null
}

export function addPlanDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date)
}

function likeEscape(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1')
}

export function clientIdentityKey(name: string, phone: string, email: string): string {
  return [
    (name ?? '').trim().toLowerCase(),
    (phone ?? '').replace(/\D/g, ''),
    (email ?? '').trim().toLowerCase(),
  ].join('|')
}

export async function getClientSessions(
  db: Db,
  identity: { name: string; email: string; phone: string },
): Promise<ClientSession[]> {
  const { data, error } = await db
    .from('client_sessions')
    .select('*')
    .eq('client_phone', identity.phone)
    .ilike('client_name', likeEscape(identity.name))
    .ilike('client_email', likeEscape(identity.email))
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ClientSession[]
}

function isUsable(session: ClientSession, today: string): boolean {
  return session.status === 'active'
    && session.end_date >= today
    && session.sessions_used < session.total_sessions
}

async function getActiveSessions(db: Db, seed: SessionSeed): Promise<ClientSession[]> {
  const rows = await getClientSessions(db, {
    name: seed.clientName,
    email: seed.clientEmail ?? '',
    phone: seed.clientPhone,
  })
  return rows.filter((session) => session.status === 'active')
}

async function expireSessions(db: Db, ids: string[]) {
  if (!ids.length) return
  const { error } = await db
    .from('client_sessions')
    .update({ status: 'expired' })
    .in('id', ids)
  if (error) console.error('[Sessions] Failed to expire sessions:', error.message)
}

export async function ensureRegistrationSession(db: Db, seed: SessionSeed): Promise<ClientSession | null> {
  if (seed.plan === 'daily') return null

  const today = getVisitDateManila()
  const active = await getActiveSessions(db, seed)
  const usable = active.find((session) => isUsable(session, today))

  if (usable && usable.plan === seed.plan) return usable
  if (usable) await expireSessions(db, [usable.id])

  const expired = active
    .filter((session) => session.end_date < today && session.id !== usable?.id)
    .map((session) => session.id)
  await expireSessions(db, expired)

  const totalSessions = getPlanSessions(seed.plan)
  const endDate = addPlanDays(today, getPlanDays(seed.plan))

  const { data, error } = await db
    .from('client_sessions')
    .insert({
      client_name: seed.clientName,
      client_email: seed.clientEmail,
      client_phone: seed.clientPhone,
      coach_name: seed.coachName ?? null,
      plan: seed.plan,
      customer_type: seed.customerType,
      payment_id: null,
      total_sessions: totalSessions,
      sessions_used: 0,
      start_date: today,
      end_date: endDate,
      status: 'active',
      note: seed.note ?? `Created at registration (${seed.plan} plan)`,
      paid_amount: seed.paidAmount ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Sessions] Failed to create registration session:', error.message)
    return null
  }

  return data as ClientSession
}

export async function createPaidSession(db: Db, seed: SessionSeed): Promise<ClientSession | null> {
  const today = getVisitDateManila()
  const totalSessions = getPlanSessions(seed.plan)
  const endDate = addPlanDays(today, getPlanDays(seed.plan))
  const active = await getActiveSessions(db, seed)

  if (active.length > 0) {
    const session = active[0]
    const { data, error } = await db
      .from('client_sessions')
      .update({
        client_name: seed.clientName,
        client_email: seed.clientEmail,
        coach_name: seed.coachName ?? null,
        plan: seed.plan,
        customer_type: seed.customerType,
        payment_id: seed.paymentId ?? null,
        total_sessions: totalSessions,
        sessions_used: 0,
        start_date: today,
        end_date: endDate,
        status: 'active',
        note: seed.note ?? `Renewed via payment (${seed.plan} plan)`,
        paid_amount: seed.paidAmount ?? null,
        low_session_reminder_sent: false,
        completion_notified: false,
        completed_at: null,
      })
      .eq('id', session.id)
      .select('*')
      .single()

    if (error) {
      console.error('[Sessions] Failed to renew session:', error.message)
      return null
    }

    const duplicateIds = active.slice(1).map((row) => row.id)
    await expireSessions(db, duplicateIds)
    return data as ClientSession
  }

  const { data, error } = await db
    .from('client_sessions')
    .insert({
      client_name: seed.clientName,
      client_email: seed.clientEmail,
      client_phone: seed.clientPhone,
      coach_name: seed.coachName ?? null,
      plan: seed.plan,
      customer_type: seed.customerType,
      payment_id: seed.paymentId ?? null,
      total_sessions: totalSessions,
      sessions_used: 0,
      start_date: today,
      end_date: endDate,
      status: 'active',
      note: seed.note ?? `Created from payment (${seed.plan} plan)`,
      paid_amount: seed.paidAmount ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('[Sessions] Failed to create paid session:', error.message)
    return null
  }

  return data as ClientSession
}

export async function logSessionUsage(
  db: Db,
  session: ClientSession,
  passCode: string,
  staff = 'staff',
) {
  const { error } = await db
    .from('client_session_usage')
    .insert({
      session_id: session.id,
      client_name: session.client_name,
      client_email: session.client_email || null,
      client_phone: session.client_phone,
      plan: session.plan,
      used_date: getVisitDateManila(),
      pass_code: passCode,
      staff,
    })

  if (error) console.error('[Sessions] Failed to log usage:', error.message)
}
