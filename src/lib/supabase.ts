import { createClient } from '@supabase/supabase-js'
import { isDemoMode } from './demoAuth'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const siteUrl = import.meta.env.VITE_SUPABASE_SITE_URL

export const supabase =
  isDemoMode() || !supabaseUrl || !supabaseAnonKey
    ? null
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          ...(siteUrl ? { siteUrl } : {}),
        },
      })
