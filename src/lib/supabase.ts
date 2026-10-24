import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describeIssues, readSupabaseConfig } from './env'

const result = readSupabaseConfig()

export const supabaseConfig = result.ok ? result.config : null
export const supabaseIssues = result.ok ? [] : result.issues
export const setupMessages = result.ok ? [] : describeIssues(result.issues)

export function isSupabaseConfigured(): boolean {
  return supabaseConfig !== null
}

let client: SupabaseClient | null = null

/**
 * Returns the shared Supabase client.
 *
 * Throws only for programmer error (calling before configuration is supplied);
 * the UI checks `isSupabaseConfigured()` first and renders a setup notice
 * instead of crashing.
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseConfig) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example).',
    )
  }

  if (!client) {
    client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'medicard.auth',
      },
    })
  }

  return client
}
