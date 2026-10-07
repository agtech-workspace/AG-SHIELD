import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { createDemoSession, isDemoMode, setDemoSession } from '../lib/demoAuth'
import { Loader2, AlertCircle, Check, Eye, EyeOff } from 'lucide-react'

type Props = {
  session: Session | null
}

export default function LoginPage({ session }: Props) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [isRegister, setIsRegister] = useState(() => searchParams.get('register') === '1')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [showForgot, setShowForgot] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  if (session) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSubmit() {
    if (isDemoMode()) {
      setLoading(true)
      setMessage('')
      try {
        if (!email.trim()) throw new Error('Email is required.')
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.')
        if (isRegister && !nickname.trim()) throw new Error('Nickname is required.')
        setDemoSession(createDemoSession(email.trim(), isRegister ? nickname.trim() : undefined))
        const checkParam = searchParams.get('check')
        navigate(checkParam ? `/dashboard?check=${checkParam}` : '/dashboard', { replace: true })
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Sign-in failed.')
      } finally {
        setLoading(false)
      }
      return
    }
    if (!supabase) {
      setMessage('Supabase is not configured. Add env keys, then reload.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      if (!email.trim()) {
        throw new Error('Email is required.')
      }
      if (!password || password.length < 6) {
        throw new Error('Password must be at least 6 characters.')
      }

      if (isRegister) {
        if (!nickname.trim()) {
          throw new Error('Nickname is required.')
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nickname: nickname.trim() },
            emailRedirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/dashboard`,
          },
        })
        if (error) throw error
        if (data.user && !data.session) {
          setMessage('Account created! Check email to confirm, then login.')
        } else if (data.session) {
          const checkParam = searchParams.get('check')
          navigate(checkParam ? `/dashboard?check=${checkParam}` : '/dashboard', { replace: true })
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        const checkParam = searchParams.get('check')
        navigate(checkParam ? `/dashboard?check=${checkParam}` : '/dashboard', { replace: true })
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Authentication failed.'
      setMessage(errMsg)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleOAuth() {
    if (isDemoMode()) {
      setMessage('Demo mode active - use Email + Password below to sign in (any credentials).')
      return
    }
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/dashboard`,
        },
      })
      if (error) throw error
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetPassword() {
    if (isDemoMode()) {
      setMessage('Demo mode active - password reset is disabled.')
      return
    }
    if (!supabase) return
    if (!forgotEmail.trim()) {
      setMessage('Please enter your email address.')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: import.meta.env.VITE_AUTH_REDIRECT_URL || `${window.location.origin}/dashboard`,
      })
      if (error) throw error
      setResetSent(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to send reset email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-md space-y-4">
        {!showForgot ? (
          <>
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Shield
              </h1>
              <p className="text-sm text-gray-500">
                {isRegister ? 'Create your account' : 'Secure access to your fraud detection dashboard'}
              </p>
            </div>

            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleGoogleOAuth}
              disabled={loading}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div className="flex items-center">
              <div className="flex-1 h-px bg-gray-200"></div>
              <span className="px-3 text-xs text-gray-400 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-gray-200"></div>
            </div>

            <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-green-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg pr-10 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-green-500 transition"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-gray-400 cursor-pointer hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-gray-600">
                  <input type="checkbox" className="rounded border-gray-300" />
                  Remember me
                </label>
                {!isRegister && (
                  <button
                    type="button"
                    className="text-green-600 hover:text-green-700 font-medium"
                    onClick={() => { setForgotEmail(email); setShowForgot(true) }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>

              {isRegister && (
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Nickname</label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Your name"
                    autoComplete="nickname"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-green-500 transition"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-brand-teal text-brand-deep py-2.5 rounded-lg text-sm font-medium hover:bg-teal-600 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? 'Please wait' : isRegister ? 'Create account' : 'Sign in'}
              </button>

              {message && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${message.includes('error') || message.includes('failed') || message.includes('required') ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'}`}>
                  {message.includes('error') || message.includes('failed') || message.includes('required') ? (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{message}</span>
                </div>
              )}
            </form>

            <p className="text-sm text-center text-gray-600">
              {isRegister ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                className="text-green-600 font-medium hover:text-green-700"
                onClick={() => { setIsRegister(!isRegister); setMessage('') }}
              >
                {isRegister ? 'Sign in' : 'Sign up'}
              </button>
            </p>

            <p className="text-xs text-center text-gray-400">
              By continuing you agree to our{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">Terms</Link>
              {' '}and{' '}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">Privacy</Link>
            </p>
          </>
        ) : (
          <>
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Reset Password
              </h1>
              <p className="text-sm text-gray-500">
                {resetSent ? 'Check your email for the reset link.' : 'Enter your email to reset password.'}
              </p>
            </div>

            {!resetSent ? (
              <form onSubmit={(e) => { e.preventDefault(); handleResetPassword() }} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-green-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-brand-teal text-brand-deep py-2.5 rounded-lg text-sm font-medium hover:bg-teal-600 active:scale-[0.99] transition disabled:opacity-50 flex items-center justify-center gap-2"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>

                {message && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-red-50 text-red-600 border border-red-200">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{message}</span>
                  </div>
                )}
              </form>
            ) : (
              <div className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm bg-green-50 text-green-700 border border-green-200">
                <Check className="w-4 h-4" />
                <span>Check your inbox!</span>
              </div>
            )}

            <p className="text-sm text-center text-gray-600">
              <button
                type="button"
                className="text-green-600 font-medium hover:text-green-700"
                onClick={() => { setShowForgot(false); setResetSent(false); setMessage('') }}
              >
                Back to sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}