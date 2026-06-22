import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { WalkinPass, MembershipPayment, Coach, ClientSession } from '~/types/walkin'

export type GymDatabase = {
  public: {
    Tables: {
      walkin_passes: {
        Row: WalkinPass
        Insert: Omit<WalkinPass, 'id' | 'created_at' | 'checked_in_at' | 'checked_in_by' | 'payment_amount'> & {
          id?: string
          created_at?: string
          checked_in_at?: string | null
          checked_in_by?: string | null
          payment_amount?: number | null
        }
        Update: Partial<WalkinPass>
      }
      membership_payments: {
        Row: MembershipPayment
        Insert: Omit<MembershipPayment, 'id' | 'created_at' | 'status'> & {
          id?: string
          created_at?: string
          status?: string
        }
        Update: Partial<MembershipPayment>
      }
      client_sessions: {
        Row: ClientSession
        Insert: Omit<ClientSession, 'id' | 'created_at' | 'sessions_used'> & {
          id?: string
          created_at?: string
          sessions_used?: number
        }
        Update: Partial<ClientSession>
      }
      coaches: {
        Row: Coach
        Insert: Omit<Coach, 'id' | 'created_at'> & {
          id?: string
          created_at?: string
        }
        Update: Partial<Coach>
      }
    }
  }
}

let client: SupabaseClient<GymDatabase> | null = null
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

  client = createClient<GymDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  clientUrl = url

  return client
}
