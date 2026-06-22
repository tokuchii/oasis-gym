import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WalkinPass } from '~/types/walkin'

export type WalkinDatabase = {
  public: {
    Tables: {
      walkin_passes: {
        Row: WalkinPass
        Insert: Omit<WalkinPass, 'id' | 'created_at' | 'checked_in_at' | 'checked_in_by'> & {
          id?: string
          created_at?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
        }
        Update: Partial<WalkinPass>
      }
    }
  }
}

let client: SupabaseClient<WalkinDatabase> | null = null
let clientUrl: string | null = null

export function useSupabaseAdmin() {
  const config = useRuntimeConfig()
  const url = config.supabaseUrl
  const key = config.supabaseServiceRoleKey

  if (!url || !key) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Database not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    })
  }

  if (client && clientUrl === url) return client

  client = createClient<WalkinDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  clientUrl = url

  return client
}
