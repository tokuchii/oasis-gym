import { getPlanSessions, type ClientSession } from '~/types/walkin'
import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import { clientIdentityKey } from '~/server/utils/sessions'
import { getVisitDateManila, serializePass } from '~/server/utils/walkin'

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

  const passRows = (data ?? [])
    .map(serializePass)
    .filter((m) => includeCheckedIn || m.status === 'registered')

  const byIdentity = new Map<string, ReturnType<typeof serializePass>>()
  for (const pass of passRows) {
    const key = clientIdentityKey(pass.fullName, pass.phone, pass.email)
    const current = byIdentity.get(key)
    if (!current || pass.createdAt > current.createdAt) byIdentity.set(key, pass)
  }

  const passes = Array.from(byIdentity.values())

  const phones = Array.from(new Set(passes.map((m) => m.phone)))

  const { data: sessionRows } = phones.length > 0
    ? await supabase
        .from('client_sessions')
        .select('*')
        .in('client_phone', phones)
        .order('created_at', { ascending: false })
    : { data: [] as ClientSession[] }

  const today = getVisitDateManila()
  const sessionByIdentity = new Map<string, ClientSession>()
  const totalFor = (row: ClientSession) => getPlanSessions(row.plan)
  const usable = (row: ClientSession) =>
    row.end_date >= today
    && row.sessions_used < totalFor(row)
    && (row.status === 'active' || row.status === 'completed')

  for (const row of (sessionRows ?? []) as ClientSession[]) {
    const key = clientIdentityKey(row.client_name, row.client_phone, row.client_email)
    const current = sessionByIdentity.get(key)
    if (!current) {
      sessionByIdentity.set(key, row)
      continue
    }
    if (!usable(current) && usable(row)) sessionByIdentity.set(key, row)
  }

  const members = passes.map((member) => {
    const session = sessionByIdentity.get(clientIdentityKey(member.fullName, member.phone, member.email))
    const totalSessions = session ? totalFor(session) : 0
    return {
      ...member,
      session: session
        ? {
            plan: session.plan,
            totalSessions,
            sessionsUsed: session.sessions_used,
            sessionsRemaining: Math.max(0, totalSessions - session.sessions_used),
            status: session.status === 'completed' && usable(session) ? 'active' : session.status,
            startDate: session.start_date,
            endDate: session.end_date,
          }
        : null,
    }
  })

  return { members }
})
