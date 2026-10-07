import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  signInWithPassword,
  signInWithGoogle,
  signUp,
  resetPasswordForEmail,
} from '../lib/auth'

interface LoginDialogProps {
  session: Session | null
  onClose: () => void
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function LoginDialog({ session, onClose }: LoginDialogProps) {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [googleMsg, setGoogleMsg] = useState('')
  const [sentLink, setSentLink] = useState(false)

  useEffect(() => {
    if (session) onClose()
  }, [session, onClose])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMsg(null)
    setSentLink(false)
    try {
      if (mode === 'signin') {
        await signInWithPassword(email, password)
      } else if (mode === 'signup') {
        if (!nickname.trim()) throw new Error('Nickname is required.')
        const result = await signUp(email, password, nickname.trim())
        if (!result.session) {
          setMsg({ ok: true, text: 'Account created! Check your email to confirm, then sign in.' })
        }
      } else {
        await resetPasswordForEmail(email)
        setSentLink(true)
      }
    } catch (error) {
      setMsg({ ok: false, text: error instanceof Error ? error.message : 'Authentication failed.' })
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setBusy(true)
    setGoogleMsg('')
    try {
      await signInWithGoogle()
    } catch (error) {
      setGoogleMsg(error instanceof Error ? error.message : 'Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay no-print" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal fade-in">
        <button type="button" className="x icon-btn" aria-label="Close" onClick={onClose}>×</button>
        <span className="modal-badge">Shield</span>
        <h2>{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Welcome back'}</h2>
        <p className="sub">Sign in to report scams and track your reports.</p>

        {mode !== 'forgot' && (
          <>
            <button type="button" className="btn btn-block" onClick={handleGoogle} disabled={busy} style={{ background: '#fff', color: '#19196F', border: '1px solid var(--border)' }}>
              <GoogleIcon /> Continue with Google
            </button>
            {googleMsg && <div className="banner err">{googleMsg}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0', color: 'var(--muted)', fontSize: '0.8rem' }}>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span>or</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          </>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="lgEmail">Email</label>
              <input id="lgEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : 'Send reset link'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <div className="field">
                <label htmlFor="lgNick">Nickname</label>
                <input id="lgNick" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={30} />
              </div>
            )}
            <div className="field">
              <label htmlFor="lgEmail2">Email</label>
              <input id="lgEmail2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="lgPass">Password</label>
              <input id="lgPass" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="ghost-link" onClick={() => { setMode('forgot'); setMsg(null) }}>Forgot password?</button>
              <button type="button" className="ghost-link" onClick={() => { setMode((m) => (m === 'signup' ? 'signin' : 'signup')); setMsg(null) }}>
                {mode === 'signup' ? 'Back to sign in' : 'Create an account'}
              </button>
            </div>
            <button type="submit" className="btn btn-block" disabled={busy}>
              {busy ? <span className="spinner" /> : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </form>
        )}

        {sentLink && <div className="banner ok" style={{ marginTop: 12 }}>Reset link sent — check your inbox.</div>}
        {msg && <div className={`banner ${msg.ok ? 'ok' : 'err'}`} style={{ marginTop: 12 }}>{msg.text}</div>}
      </div>
    </div>
  )
}