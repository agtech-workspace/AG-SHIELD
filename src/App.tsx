import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { Loader2, Shield, AlertCircle } from 'lucide-react'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import TermsOfServicePage from './pages/TermsOfServicePage'
import LandingPage from './pages/LandingPage'
import VerifyBusinessPage from './pages/VerifyBusinessPage'
import VerifyBadgePage from './pages/VerifyBadgePage'
import { supabase } from './lib/supabase'
import { getDemoSession, isDemoMode, subscribeDemoAuth } from './lib/demoAuth'

const DEVICE_ID_KEY = 'safeguard_device_id'

function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

async function checkDeviceLimit(): Promise<{ allowed: boolean; reason: string }> {
  if (!supabase) return { allowed: true, reason: 'no_supabase' }
  try {
    const deviceId = getDeviceId()
    const { data, error } = await supabase.rpc('register_device_session', {
      p_device_id: deviceId,
      p_device_name: navigator.userAgent?.slice(0, 100) ?? 'Unknown',
    })
    if (error) return { allowed: true, reason: 'rpc_error' }
    return data as { allowed: boolean; reason: string }
  } catch {
    return { allowed: true, reason: 'error' }
  }
}

function LoadingState() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-green-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30">
          <Shield className="w-7 h-7 text-white" />
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    </div>
  )
}

function ConfigError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-green-50 p-6">
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-8 max-w-md text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-600" />
        </div>
        <h2 className="text-lg font-bold text-navy mb-2">Configuration Required</h2>
        <p className="text-sm text-slate-500 mb-4">
          Shield is missing required environment variables. Please configure:
        </p>
        <div className="bg-slate-50 rounded-lg p-4 text-left text-xs font-mono text-slate-600">
          <p className="mb-1">VITE_SUPABASE_URL</p>
          <p className="mb-1">VITE_SUPABASE_ANON_KEY</p>
          <p>VITE_AUTH_REDIRECT_URL (optional)</p>
        </div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const demoMode = isDemoMode()
  const [session, setSession] = useState<Session | null>(() => (demoMode ? getDemoSession() : null))
  const [loadingSession, setLoadingSession] = useState<boolean>(() => !demoMode)
  const [deviceBlocked, setDeviceBlocked] = useState<string | null>(null)

  useEffect(() => {
    if (demoMode) {
      return subscribeDemoAuth(setSession)
    }
    if (!supabase) {
      const timer = setTimeout(() => setLoadingSession(false), 0)
      return () => clearTimeout(timer)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoadingSession(false)
      if (data.session) {
        checkDeviceLimit().then(res => {
          if (!res.allowed) setDeviceBlocked(res.reason)
        })
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
    })

    return () => subscription.unsubscribe()
  }, [demoMode])

  if (loadingSession) {
    return <LoadingState />
  }

  if (!supabase && !demoMode) {
    return <ConfigError />
  }

  if (deviceBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-green-50 p-6">
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Device Limit Reached</h2>
          <p className="text-sm text-slate-500 mb-4">{deviceBlocked}</p>
          <button
            type="button"
            onClick={async () => {
              if (!supabase) return
              await supabase.auth.signOut()
              setDeviceBlocked(null)
              setSession(null)
              window.location.href = '/login'
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            Sign Out & Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} />} />
      <Route path="/login" element={<LoginPage session={session} />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route
        path="/dashboard"
        element={session ? <DashboardPage session={session} /> : <Navigate to="/login" replace />}
      />
      <Route path="/verify-business" element={<VerifyBusinessPage />} />
      <Route path="/verify/:code" element={<VerifyBadgePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <AppRoutes />
      </div>
    </BrowserRouter>
  )
}
