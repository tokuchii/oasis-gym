import { requireStaff } from '~/server/utils/auth'
import { useSupabaseAdmin } from '~/server/utils/supabase'
import type { ActivityLog } from '~/types/walkin'

export default defineEventHandler(async (event) => {
  requireStaff(event)

  const query = getQuery(event)
  const category = String(query.category ?? '').trim()
  const requestedLimit = Number(query.limit ?? 500)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(1, requestedLimit), 1000) : 500

  const supabase = useSupabaseAdmin()

  let builder = supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (category && category !== 'all') {
    builder = builder.eq('category', category)
  }

  const { data, error } = await builder

  if (error) {
    console.error('[Activity] List error:', error)
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { activities: [], error: 'Activity log is not set up yet. Run supabase/schema.sql.' }
    }
    throw createError({ statusCode: 500, statusMessage: 'Failed to load activity log.' })
  }

  const activities = ((data ?? []) as ActivityLog[]).map((row) => ({
    id: row.id,
    category: row.category,
    action: row.action,
    title: row.title,
    description: row.description,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    amount: row.amount,
    reference: row.reference,
    metadata: row.metadata,
    staff: row.staff,
    createdAt: row.created_at,
  }))

  return { activities }
})
