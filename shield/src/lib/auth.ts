import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

const REDIRECT = import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/`

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(cb: (session: Session | null) => void): (() => void) | null {
  if (!supabase) return null
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
  return data.session
}

export async function signUp(email: string, password: string, nickname?: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: nickname ? { nickname: nickname.trim() } : undefined,
      emailRedirectTo: REDIRECT,
    },
  })
  if (error) throw error
  return data
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: REDIRECT },
  })
  if (error) throw error
}

export async function resetPasswordForEmail(email: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: REDIRECT })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}