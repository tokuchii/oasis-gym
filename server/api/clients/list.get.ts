import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'

const SESSION_LIMITS: Record<string, number> = { weekly: 4, monthly: 13 }

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const supabase = useSupabaseAdmin()

  const { data: existingClients, error: clientError } = await supabase
    .from('client_sessions')
    .select('*')
    .order('created_at', { ascending: false })

  if (clientError) {
    console.error('[Clients] List error:', clientError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load clients.' })
  }

  const existingEmails = new Set((existingClients ?? []).map((c) => c.client_email))

  const { data: approvedPayments } = await supabase
    .from('membership_payments')
    .select('*')
    .eq('status', 'approved')

  if (approvedPayments) {
    for (const payment of approvedPayments) {
      if (existingEmails.has(payment.email)) continue

      const totalSessions = SESSION_LIMITS[payment.plan] ?? 4
      const now = new Date()
      const startDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
      const endDate = new Date(now)
      endDate.setFullYear(endDate.getFullYear() + 1)
      const endDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(endDate)

      await supabase.from('client_sessions').insert({
        client_name: payment.full_name,
        client_email: payment.email,
        client_phone: payment.phone,
        coach_name: payment.coach || null,
        plan: payment.plan,
        total_sessions: totalSessions,
        sessions_used: 0,
        start_date: startDate,
        end_date: endDateStr,
        status: 'active',
        note: `Synced from membership (${payment.plan} plan)`,
        paid_amount: payment.amount,
      })
      existingEmails.add(payment.email)
    }
  }

  const { data: allClients, error: finalError } = await supabase
    .from('client_sessions')
    .select('*')
    .eq('removed', false)
    .order('created_at', { ascending: false })

  if (finalError) {
    console.error('[Clients] Final list error:', finalError)
    throw createError({ statusCode: 500, statusMessage: 'Failed to load clients.' })
  }

  return { clients: allClients ?? [] }
})
