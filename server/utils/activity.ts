import type { SupabaseClient } from '@supabase/supabase-js'
import type { GymDatabase } from '~/server/utils/supabase'
import type { ActivityCategory } from '~/types/walkin'

type Db = SupabaseClient<GymDatabase>

export interface ActivityEntry {
  category: ActivityCategory
  action: string
  title: string
  description?: string | null
  clientName?: string | null
  clientPhone?: string | null
  clientEmail?: string | null
  amount?: number | null
  reference?: string | null
  metadata?: Record<string, string | number | boolean | null> | null
  staff?: string
}

export async function logActivity(db: Db, entry: ActivityEntry): Promise<void> {
  const { error } = await db
    .from('activity_logs')
    .insert({
      category: entry.category,
      action: entry.action,
      title: entry.title,
      description: entry.description ?? null,
      client_name: entry.clientName ?? null,
      client_phone: entry.clientPhone ?? null,
      client_email: entry.clientEmail ?? null,
      amount: entry.amount ?? null,
      reference: entry.reference ?? null,
      metadata: entry.metadata ?? null,
      staff: entry.staff ?? 'staff',
    })

  if (error) {
    console.error('[Activity] Failed to log activity:', error.message)
  }
}
