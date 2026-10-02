import type { Session, User } from '@supabase/supabase-js'

const DEMO_SESSION_KEY = 'safeguard_demo_session'

type AuthListener = (session: Session | null) => void

const listeners = new Set<AuthListener>()

export function isDemoMode(): boolean {
  return import.meta.env.VITE_AUTH_MODE === 'demo'
}

export function subscribeDemoAuth(listener: AuthListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function createDemoSession(email?: string, nickname?: string): Session {
  const now = new Date().toISOString()
  const user: User = {
    id: 'demo-user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: email || 'demo@shield.local',
    email_confirmed_at: now,
    phone: '',
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { nickname: nickname?.trim() || 'Demo User' },
    identities: [],
    created_at: now,
    updated_at: now,
  }
  return {
    access_token: 'demo_access_token',
    refresh_token: 'demo_refresh_token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user,
  } as Session
}

export function saveDemoSession(session: Session | null): void {
  if (session) localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session))
  else localStorage.removeItem(DEMO_SESSION_KEY)
}

export function getDemoSession(): Session | null {
  const raw = localStorage.getItem(DEMO_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Session
    if (!parsed?.user?.id) return null
    const expiresAt = parsed.expires_at ?? 0
    if (expiresAt > 0 && expiresAt * 1000 < Date.now()) {
      saveDemoSession(null)
      return null
    }
    return parsed
  } catch {
    saveDemoSession(null)
    return null
  }
}

function notify(session: Session | null): void {
  listeners.forEach((listener) => listener(session))
}

export function setDemoSession(session: Session | null): void {
  saveDemoSession(session)
  notify(session)
}

export function clearDemoSession(): void {
  saveDemoSession(null)
  notify(null)
}