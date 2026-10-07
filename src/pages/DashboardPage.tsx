import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Joyride, type EventData, type Step } from 'react-joyride'
import { supabase } from '../lib/supabase'
import { clearDemoSession, isDemoMode } from '../lib/demoAuth'
import { processRisk, type RiskInput } from '../lib/riskEngine'
import { getMockAccount } from '../lib/mockData'
import { ACCOUNT_NUMBER_LENGTH, BANK_CODES, BANKS, HIGH_AMOUNT_THRESHOLD, HISTORY_MAX_ITEMS, REPORT_CATEGORIES } from '../lib/constants'
import { AlertTriangle, ArrowRight, Award, Bitcoin, Building2, Briefcase, Camera, Check, CheckCircle, CreditCard, Factory, FileText, Gift, Heart, Home, Landmark, Link2, Loader2, MessageSquare, MoreHorizontal, Printer, Search, Send, ShieldCheck, Store, Upload, User, UserX, Wallet, AlertCircle as AlertIcon, Bell, Image as ImageIcon, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Gauge from '../components/Gauge'
import AdminStatsOverview from '../components/admin/AdminStatsOverview'
import UserManagement from '../components/admin/UserManagement'
import B2BTenantsKeys from '../components/admin/B2BTenantsKeys'
import RunnerHeartbeat from '../components/admin/RunnerHeartbeat'
import { TOUR_STEPS, TOUR_LOCALE } from '../components/tourSteps'
import ThemeToggle from '../components/ThemeToggle'

type RiskLevel = 'safe' | 'warning' | 'high_risk'

type AccountRecord = {
  id: string
  account_number: string
  bank_name: string
  overall_risk_level: RiskLevel
  total_reports: number
  is_verified_business: boolean
  account_name?: string
  flagged_reason?: string
}

type RiskResult = {
  risk: RiskLevel
  score: number
  confidence?: number
  reasons: string[]
  socialProof?: string
  accountName?: string
  flaggedReason?: string
  bankName?: string
  sourceRegistry?: string[]
}

type HistoryItem = {
  id: string
  accountNumber: string
  bankName: string
  amount: number
  risk: RiskLevel
  timestamp: string
  score?: number
  reasons?: string[]
}

type Profile = {
  nickname: string
  is_admin?: boolean
  role?: string
}

type ReportFeedItem = {
  id: string
  reason_category: string | null
  description: string | null
  evidence_url: string | null
  created_at: string
  account: Pick<AccountRecord, 'account_number' | 'bank_name' | 'overall_risk_level'> | null
  status?: string | null
}

type MyReportRow = {
  id: string
  reason_category: string | null
  description: string | null
  status: string | null
  created_at: string
  account: Pick<AccountRecord, 'account_number' | 'bank_name'> | null
}

type ActiveTab = 'home' | 'scan' | 'reports' | 'community' | 'settings' | 'admin' | 'merchant' | 'events'

const STORAGE_KEY = 'safeguard_recent_checks'
const SEARCH_TALLY_KEY = 'safeguard_search_tally'

const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  safe: { label: 'Safe', color: '#22c55e' },
  warning: { label: 'Suspicious', color: '#f59e0b' },
  high_risk: { label: 'Dangerous', color: '#dc2626' },
}

const CATEGORY_META: Record<string, { icon: LucideIcon; accent: string; active: string }> = {
  'Instagram Vendor Scam': { icon: Camera, accent: 'text-pink-500', active: 'bg-pink-50 text-pink-800 border-pink-300' },
  'Crypto P2P Fraud': { icon: Bitcoin, accent: 'text-orange-500', active: 'bg-orange-50 text-orange-800 border-orange-300' },
  'Facebook Marketplace': { icon: Store, accent: 'text-sky-500', active: 'bg-sky-50 text-sky-800 border-sky-300' },
  'Job/Visa Phishing': { icon: Briefcase, accent: 'text-amber-500', active: 'bg-amber-50 text-amber-800 border-amber-300' },
  'POS Withdrawal Error': { icon: CreditCard, accent: 'text-violet-500', active: 'bg-violet-50 text-violet-800 border-violet-300' },
  'Fake Giveaway': { icon: Gift, accent: 'text-rose-500', active: 'bg-rose-50 text-rose-800 border-rose-300' },
  Impersonation: { icon: UserX, accent: 'text-red-500', active: 'bg-red-50 text-red-800 border-red-300' },
  'Social Media Report': { icon: MessageSquare, accent: 'text-blue-500', active: 'bg-blue-50 text-blue-800 border-blue-300' },
  'Rental / Housing Scam': { icon: Home, accent: 'text-teal-500', active: 'bg-teal-50 text-teal-800 border-teal-300' },
  'Fake Supplier / Invoice': { icon: Factory, accent: 'text-slate-500', active: 'bg-slate-50 text-slate-800 border-slate-300' },
  'Romance Scam': { icon: Heart, accent: 'text-fuchsia-500', active: 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300' },
  'Advance Fee Fraud': { icon: Wallet, accent: 'text-yellow-600', active: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
  'Business Email Compromise': { icon: Building2, accent: 'text-indigo-500', active: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
  Other: { icon: MoreHorizontal, accent: 'text-gray-500', active: 'bg-gray-100 text-gray-800 border-gray-300' },
}

const REPORT_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-50 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600' },
}

function spaceAccount(n: string): string {
  const d = n.replace(/\D/g, '')
  return d ? `${d.slice(0, 3)}${d[3] ? ` ${d.slice(3, 6)}` : ''}${d[6] ? ` ${d.slice(6)}` : ''}` : ''
}

type SafetyTip = { icon: string; title: string; body: string }

function getSafetyTips(result: RiskResult, accountNumber: string, bank: string, amount: number): SafetyTip[] {
  const tips: SafetyTip[] = []
  const masked = maskAccount(accountNumber)
  const displayAmount = amount >= 1000 ? `₦${amount.toLocaleString()}` : null
  const bankInfo = bank ? ` at ${bank}` : ''

  if (result.risk === 'safe') {
    tips.push({
      icon: '🛡️',
      title: 'All Clear',
      body: `Account ${masked}${bankInfo} passed our checks with no risk indicators. It appears safe to transact with.`,
    })
    if (amount >= HIGH_AMOUNT_THRESHOLD) {
      tips.push({
        icon: '💰',
        title: 'Large Transfer Advisory',
        body: `You are sending ${displayAmount} — a significant sum. Even for safe accounts, consider doing a small test transfer first, then confirm with the recipient before sending the full amount.`,
      })
    } else {
      tips.push({
        icon: '✅',
        title: 'Safe to Proceed',
        body: `No red flags were raised for this account. Standard precautions still apply — confirm the recipient's identity if you haven't already.`,
      })
    }
    if (!result.accountName) {
      tips.push({
        icon: '🆔',
        title: 'Unverified Account Name',
        body: `The account name could not be confirmed through our database. Always verify by asking the recipient to read out the name on their account via a phone call.`,
      })
    }
    tips.push({
      icon: '👀',
      title: 'Stay Vigilant',
      body: `Fraudsters can change tactics. If something feels off about this transaction, trust your instinct and double-check.`,
    })
  } else if (result.risk === 'warning') {
    tips.push({
      icon: '⚠️',
      title: 'Caution Advised',
      body: `Account ${masked}${bankInfo} raised some concerns. We recommend verifying the owner before sending ${displayAmount || 'any money'}.`,
    })
    tips.push({
      icon: '📞',
      title: 'Verification Steps',
      body: displayAmount
        ? `Call the recipient on a known number (not the one in the message). Ask them to confirm their bank details. For ${displayAmount}, request a government-issued ID match.`
        : `Contact the account owner through a verified channel — not the contact they provided. Confirm their full name matches the account.`,
    })
    if (!result.accountName) {
      tips.push({
        icon: '🔍',
        title: 'Account Name Unknown',
        body: `We could not verify the name on this account. Ask for a proof of account ownership — a bank statement or USSD-generated account name is a good start.`,
      })
    }
    if (result.socialProof?.includes('community report')) {
      tips.push({
        icon: '👥',
        title: 'Community Reports',
        body: `${result.socialProof}. Multiple unrelated reports increase credibility. Consider reporting this to your bank's fraud desk before any transaction.`,
      })
    }
    tips.push({
      icon: '📋',
      title: 'Recommended Actions',
      body: `1) Verify identity 2) Send a small test amount first 3) Use "Send to Bank" with confirmed details 4) Save the recipient for future reference.`,
    })
  } else {
    tips.push({
      icon: '🚨',
      title: 'DO NOT SEND MONEY',
      body: `Account ${masked}${bankInfo} is flagged as highly dangerous. Sending money here carries significant risk of loss.`,
    })
    tips.push({
      icon: '🔴',
      title: 'Urgent Advisory',
      body: displayAmount
        ? `You were about to send ${displayAmount} to a flagged account. Stop all communication immediately. Report this transaction attempt to your bank's fraud team.`
        : `Any transaction to this account is strongly discouraged. Block the account and report to authorities if contacted by the owner.`,
    })
    if (result.socialProof?.includes('people flagged')) {
      tips.push({
        icon: '📢',
        title: 'Community Alert',
        body: `${result.socialProof}. These reports are from independent community members — this is a strong signal that this account is involved in fraudulent activity.`,
      })
    } else if (result.socialProof?.includes('community report')) {
      tips.push({
        icon: '📢',
        title: 'Community Reports',
        body: `${result.socialProof}. Community reports are a major risk factor. Assume this account is compromised or fraudulent.`,
      })
    }
    tips.push({
      icon: '🛑',
      title: 'Next Steps',
      body: `1) Do not send any money 2) Block/save as unsafe 3) Report to police (if you have already sent money) 4) Report to your bank 5) Submit a community report here to warn others.`,
    })
  }

  return tips
}

function sanitizeAccountNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, ACCOUNT_NUMBER_LENGTH)
}

function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function maskAccount(n: string): string {
  const clean = n.replace(/\D/g, '')
  if (clean.length <= 4) return '*'.repeat(clean.length)
  return '*'.repeat(clean.length - 4) + clean.slice(-4)
}

function loadHistory(): HistoryItem[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try { return JSON.parse(raw) as HistoryItem[] } catch { return [] }
}

function getSearchCount(accountKey: string): number {
  try {
    const raw = localStorage.getItem(SEARCH_TALLY_KEY)
    const map: Record<string, number> = raw ? JSON.parse(raw) : {}
    return map[accountKey] ?? 0
  } catch {
    return 0
  }
}

function incrementSearchCount(accountKey: string): number {
  try {
    const raw = localStorage.getItem(SEARCH_TALLY_KEY)
    const map: Record<string, number> = raw ? JSON.parse(raw) : {}
    map[accountKey] = (map[accountKey] ?? 0) + 1
    localStorage.setItem(SEARCH_TALLY_KEY, JSON.stringify(map))
    return map[accountKey]
  } catch {
    return 1
  }
}

async function fetchMyReports(userId: string): Promise<MyReportRow[] | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('reports')
    .select('id, reason_category, description, status, created_at, account:accounts(account_number, bank_name)')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)
  return (data as MyReportRow[] | null) ?? null
}

async function fetchAccountName(accountNumber: string, bankName: string): Promise<string> {
  const edgeUrl = import.meta.env.VITE_RESOLVE_EDGE_URL
  const bankCode = BANK_CODES[bankName] ?? ''
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!edgeUrl) return ''
  try {
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey ?? '', 'Authorization': `Bearer ${anonKey ?? ''}` },
      body: JSON.stringify({ account_number: accountNumber, bank_code: bankCode, bank_name: bankName }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return ''
    const payload = await response.json() as { account_name?: string | null }
    return payload.account_name?.trim() ?? ''
  } catch {
    return ''
  }
}

function buildRiskInput(account: AccountRecord | null, amount: number, isNewRecipient: boolean, reportCount: number, nameResolved: boolean, flaggedReason: string | null): RiskInput {
  return {
    totalReports: reportCount,
    isVerifiedBusiness: account?.is_verified_business ?? false,
    accountName: account?.account_name ?? null,
    flaggedReason,
    transferAmount: amount,
    isNewRecipient,
    nameResolved,
    accountExists: !!account,
  }
}

export default function DashboardPage({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const checkAccount = new URLSearchParams(window.location.search).get('check')
    return checkAccount && checkAccount.replace(/\D/g, '').length === ACCOUNT_NUMBER_LENGTH ? 'scan' : 'home'
  })
  const [profile, setProfile] = useState<Profile | null>(null)
  const isAdminViewer = profile?.role === 'root_admin' || profile?.role === 'moderator'
  const [nicknameInput, setNicknameInput] = useState('')
  const [savingNickname, setSavingNickname] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [accountNumber, setAccountNumber] = useState(() => {
    const checkAccount = new URLSearchParams(window.location.search).get('check')
    return checkAccount && checkAccount.replace(/\D/g, '').length === ACCOUNT_NUMBER_LENGTH ? checkAccount.replace(/\D/g, '') : ''
  })
  const [amount, setAmount] = useState('')
  const [scanBank, setScanBank] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<RiskResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory())
  const [checkError, setCheckError] = useState('')

  const [reportAccount, setReportAccount] = useState('')
  const [reportBank, setReportBank] = useState<string>(BANKS[0])
  const [reportType, setReportType] = useState(REPORT_CATEGORIES[0])
  const [reportDescription, setReportDescription] = useState('')
  const [reportEvidenceType, setReportEvidenceType] = useState<'link' | 'image' | 'pdf'>('link')
  const [reportEvidenceUrl, setReportEvidenceUrl] = useState('')
  const [reportEvidenceFile, setReportEvidenceFile] = useState<File | null>(null)
  const [reportEvidenceUploading, setReportEvidenceUploading] = useState(false)
  const [reportOtherCategory, setReportOtherCategory] = useState('')
  const [reporting, setReporting] = useState(false)
  const [reportFeedback, setReportFeedback] = useState('')
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [submittedAccount, setSubmittedAccount] = useState('')
  const [myReports, setMyReports] = useState<MyReportRow[]>([])
  const [myReportsLoading, setMyReportsLoading] = useState(true)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [liveFeed, setLiveFeed] = useState<ReportFeedItem[]>([])
  const [riskChartData, setRiskChartData] = useState<{ name: string; value: number; color: string }[]>([])

  const [overlayOpen, setOverlayOpen] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [pendingReports, setPendingReports] = useState<ReportFeedItem[]>([])
  const [processingReview, setProcessingReview] = useState(false)
  const countdownIntervalRef = useRef<number | null>(null)

  const [tourRunning, setTourRunning] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [tourDemo, setTourDemo] = useState(false)

  useEffect(() => {
    const seen = localStorage.getItem('hasSeenTour_v1')
    if (!seen) {
      const timer = setTimeout(() => setTourRunning(true), 600)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleTourEvent = (data: EventData) => {
    const { action, index, type, status } = data
    if (status === 'finished' || status === 'skipped' || action === 'skip') {
      setTourRunning(false)
      setTourDemo(false)
      localStorage.setItem('hasSeenTour_v1', 'true')
      return
    }
    if (type === 'step:after') {
      if (index === 0) setActiveTab('scan')
      if (index === 1) setAccountNumber('7382019941')
      if (index === 2) setTourDemo(true)
      if (index === 3) setActiveTab('reports')
      if (index === 4) setActiveTab('community')
      if (index === 5) setActiveTab('settings')
      setTourStep(index + 1)
    }
  }

  const [merchantName, setMerchantName] = useState('')
  const [merchantCAC, setMerchantCAC] = useState('')
  const [merchantAccount, setMerchantAccount] = useState('')
  const [merchantBank, setMerchantBank] = useState<string>(BANKS[0])
  const [verifyingMerchant, setVerifyingMerchant] = useState(false)
  const [merchantResult, setMerchantResult] = useState<{verified: boolean; verification_id?: string; risk_level?: string; badge_url?: string} | null>(null)

  const [eventsList, setEventsList] = useState<{id: string; title: string; description: string; event_date: string; location: string; event_type: string; seats_available: number}[]>([])
  const [subscribingToEvent, setSubscribingToEvent] = useState<string | null>(null)
  const [subscribeEmail, setSubscribeEmail] = useState('')
  const [subscribeName, setSubscribeName] = useState('')
  const [subscribeFeedback, setSubscribeFeedback] = useState('')

  const exportHistoryPDF = () => {
    if (history.length === 0) return
    window.print()
  }

  useEffect(() => {
    async function loadProfileAndDashboard() {
      if (!supabase) {
        setDashboardLoading(false)
        return
      }
      try {
        const { data: profileData } = await supabase.from('profiles').select('nickname, is_admin, role').eq('id', session.user.id).maybeSingle()
        if (profileData) {
          setProfile(profileData as Profile)
        } else {
          const nickname = session.user.user_metadata?.nickname
          setNicknameInput(nickname ?? '')
          if (nickname) setProfile({ nickname })
          else setProfileModalOpen(true)
        }

        const { data: accountsData } = await supabase.from('accounts').select('overall_risk_level')
        if (accountsData) {
          const counts = accountsData.reduce<Record<RiskLevel, number>>((acc, item) => {
            const key = item.overall_risk_level as RiskLevel
            if (key in acc) acc[key] += 1
            return acc
          }, { safe: 0, warning: 0, high_risk: 0 })
          setRiskChartData([
            { name: 'Safe', value: counts.safe, color: '#22c55e' },
            { name: 'Suspicious', value: counts.warning, color: '#f59e0b' },
            { name: 'Dangerous', value: counts.high_risk, color: '#dc2626' },
          ])
        }

        const { data: feedData } = await supabase
          .from('reports')
          .select('id, reason_category, description, evidence_url, created_at, account:accounts(account_number, bank_name, overall_risk_level)')
          .order('created_at', { ascending: false }).limit(10)
        if (feedData) setLiveFeed(feedData as unknown as ReportFeedItem[])

        const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
        if (profileCount !== null) setUserCount(profileCount)
      } finally {
        setDashboardLoading(false)
      }
    }
    void loadProfileAndDashboard()

    async function loadEvents() {
      if (!supabase) return
      const { data } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true })
        .limit(20)
      if (data) setEventsList(data as typeof eventsList)
    }
    void loadEvents()
  }, [session.user.id, session.user.user_metadata?.nickname])

  useEffect(() => {
    if (overlayOpen || result?.risk === 'high_risk') document.body.classList.add('threat-typography')
    else document.body.classList.remove('threat-typography')
    return () => { document.body.classList.remove('threat-typography') }
  }, [overlayOpen, result?.risk])

  useEffect(() => {
    if (!overlayOpen) {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
      return
    }
    if (countdownIntervalRef.current !== null) window.clearInterval(countdownIntervalRef.current)
    countdownIntervalRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current !== null) {
            window.clearInterval(countdownIntervalRef.current)
            countdownIntervalRef.current = null
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => {
      if (countdownIntervalRef.current !== null) {
        window.clearInterval(countdownIntervalRef.current)
        countdownIntervalRef.current = null
      }
    }
  }, [overlayOpen])

  const recentRecipientMap = useMemo(() => {
    return new Set(history.map((item) => `${item.accountNumber}|${item.bankName}`))
  }, [history])

  async function findAccount(account: string, bank?: string) {
    if (!supabase) return null
    let query = supabase
      .from('accounts')
      .select('id, account_number, bank_name, overall_risk_level, total_reports, is_verified_business, account_name, flagged_reason')
      .eq('account_number', account)
    if (bank) query = query.eq('bank_name', bank)
    query = query.order('overall_risk_level', { ascending: false }).limit(1)
    const { data, error } = await query.maybeSingle()
    if (error) {
      if (error.message.toLowerCase().includes('schema cache')) {
        throw new Error("Schema cache stale. Run supabase/refresh_schema_cache.sql and reload.")
      }
      throw new Error(error.message)
    }
    return data as AccountRecord | null
  }

  async function handleCheck(event: FormEvent) {
    event.preventDefault()
    if (accountNumber.length !== ACCOUNT_NUMBER_LENGTH) { setCheckError(`Enter a valid ${ACCOUNT_NUMBER_LENGTH}-digit account number`); return }
    setChecking(true)
    setCheckError('')
    setResult(null)
    try {
      let account = await findAccount(accountNumber, scanBank || undefined)

      const matchedBank = account?.bank_name ?? scanBank
      const mockAccount = import.meta.env.DEV && !account ? getMockAccount(accountNumber, matchedBank) : null
      if (mockAccount) {
        account = {
          id: '',
          account_number: mockAccount.accountNumber,
          bank_name: mockAccount.bankName,
          overall_risk_level: mockAccount.overallRiskLevel,
          total_reports: mockAccount.totalReports,
          is_verified_business: mockAccount.isVerifiedBusiness,
          account_name: mockAccount.accountName ?? undefined,
          flagged_reason: mockAccount.flaggedReason ?? undefined,
        }
      }

      const resolvedBank = account?.bank_name ?? scanBank
      const totalReports = account?.total_reports ?? 0
      let fetchedName = ''
      let nameResolved = false
      try {
        fetchedName = await fetchAccountName(accountNumber, resolvedBank)
        if (fetchedName) nameResolved = true
      } catch { fetchedName = '' }

      const dbName = account?.account_name || fetchedName
      const flaggedReason = account?.flagged_reason || null
      const parsedAmount = Number.parseInt(amount.replace(/\D/g, ''), 10) || 0
      const isNewRecipient = !recentRecipientMap.has(`${accountNumber}|${resolvedBank}`)

      let outcome: RiskResult

      const riskCheckUrl = import.meta.env.VITE_RISK_CHECK_EDGE_URL
        || (import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/risk-check` : '')
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const accessToken = session?.access_token ?? ''

      if (riskCheckUrl) {
        try {
          const riskResp = await fetch(riskCheckUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey ?? '',
              'Authorization': `Bearer ${accessToken || anonKey}`,
              'x-sandbox': 'true',
            },
            body: JSON.stringify({
              account_number: accountNumber,
              bank_name: resolvedBank,
              amount: parsedAmount,
              is_new_recipient: isNewRecipient,
              holder_name: dbName ?? '',
            }),
            signal: AbortSignal.timeout(10000),
          })
          if (riskResp.ok) {
            const riskData = await riskResp.json() as {
              risk_level?: string
              risk_score?: number
              confidence_interval?: number
              reasons?: string[]
              social_proof?: string | null
              source_registry?: string[]
            }
            if (typeof riskData.risk_score !== 'number' || typeof riskData.risk_level !== 'string') {
              throw new Error('Malformed risk payload')
            }
            const rl: RiskLevel = riskData.risk_level === 'high_risk' ? 'high_risk' : riskData.risk_level === 'warning' ? 'warning' : 'safe'
            outcome = {
              risk: rl,
              score: riskData.risk_score,
              confidence: riskData.confidence_interval ?? undefined,
              reasons: riskData.reasons ?? [],
              socialProof: riskData.social_proof ?? undefined,
              accountName: dbName,
              flaggedReason: flaggedReason ?? undefined,
              bankName: resolvedBank,
              sourceRegistry: riskData.source_registry ?? [],
            }
          } else {
            throw new Error('Edge function error')
          }
        } catch {
          const input = buildRiskInput(account, parsedAmount, isNewRecipient, totalReports, nameResolved, flaggedReason)
          outcome = { ...processRisk(input), accountName: dbName, flaggedReason: flaggedReason ?? undefined, bankName: resolvedBank }
        }
      } else {
        const input = buildRiskInput(account, parsedAmount, isNewRecipient, totalReports, nameResolved, flaggedReason)
        outcome = { ...processRisk(input), accountName: dbName, flaggedReason: flaggedReason ?? undefined, bankName: resolvedBank }
      }
      setResult(outcome)

      const accountKey = `${accountNumber}|${resolvedBank}`
      incrementSearchCount(accountKey)

      const newItem: HistoryItem = {
        id: Date.now().toString(),
        accountNumber: accountNumber,
        bankName: resolvedBank,
        amount: Number(amount) || 0,
        risk: outcome.risk,
        timestamp: new Date().toISOString(),
        score: outcome.score,
        reasons: outcome.reasons
      }
      setHistory((prev) => [newItem, ...prev].slice(0, HISTORY_MAX_ITEMS))

      setCountdown(outcome.risk === 'high_risk' ? 5 : 0)
      setOverlayOpen(true)
    } catch (error) {
      setCheckError(error instanceof Error ? error.message : 'Risk check failed.')
    } finally {
      setChecking(false)
    }
  }

  async function handleReport(event: FormEvent) {
    event.preventDefault()
    if (reportAccount.length !== ACCOUNT_NUMBER_LENGTH) { setReportFeedback(`Enter ${ACCOUNT_NUMBER_LENGTH}-digit account number`); return }
    if (reportType === 'Other' && !reportOtherCategory.trim()) { setReportFeedback('Please describe the scam type'); return }
    if (reportEvidenceType === 'link' && !reportEvidenceUrl.trim()) { setReportFeedback('Please provide evidence link'); return }
    if ((reportEvidenceType === 'image' || reportEvidenceType === 'pdf') && !reportEvidenceFile) { setReportFeedback('Please select a file'); return }
    setReporting(true)
    setReportFeedback('')
    try {
      if (!supabase) { setReportFeedback('Supabase not configured.'); return }

      const category = reportType === 'Other' ? reportOtherCategory.trim() : reportType
      const desc = reportType === 'Other' && reportOtherCategory.trim()
        ? (reportDescription ? `${reportOtherCategory.trim()} — ${reportDescription}` : reportOtherCategory.trim())
        : reportDescription || null

      let evidenceUrl: string | null = null
      if (reportEvidenceType === 'link') {
        evidenceUrl = reportEvidenceUrl.trim() || null
      } else if (reportEvidenceFile) {
        setReportEvidenceUploading(true)
        const ext = reportEvidenceFile.name.split('.').pop() ?? (reportEvidenceType === 'pdf' ? 'pdf' : 'png')
        const fileName = `${Date.now()}_${reportAccount}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(fileName, reportEvidenceFile, {
            cacheControl: '3600',
            upsert: false,
          })
        if (uploadError) throw new Error(uploadError.message)
        const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(uploadData.path)
        evidenceUrl = publicUrl
      }

      const { error } = await supabase.rpc('submit_user_report', {
        p_account_number: reportAccount,
        p_bank_name: reportBank,
        p_reason_category: category,
        p_description: desc,
        p_evidence_url: evidenceUrl,
      })
      if (error) throw new Error(error.message)
      setReportSubmitted(true)
      setSubmittedAccount(reportAccount)
      setReportFeedback('')
      const rows = await fetchMyReports(session.user.id)
      if (rows) setMyReports(rows)
      setReportAccount('')
      setReportDescription('')
      setReportEvidenceType('link')
      setReportEvidenceUrl('')
      setReportEvidenceFile(null)
      setReportEvidenceUploading(false)
      setReportOtherCategory('')
      setReportType(REPORT_CATEGORIES[0])
      setReportBank(BANKS[0])
    } catch (error) {
      setReportFeedback(error instanceof Error ? error.message : 'Unable to submit report.')
      setReportEvidenceUploading(false)
    } finally {
      setReporting(false)
    }
  }

  async function saveNickname(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !nicknameInput.trim()) return
    setSavingNickname(true)
    setProfileError('')
    try {
      const nextNickname = nicknameInput.trim()
      const metadataUpdate = await supabase.auth.updateUser({ data: { nickname: nextNickname } })
      if (metadataUpdate.error) throw metadataUpdate.error
      const profileWrite = await supabase.from('profiles').upsert({ id: session.user.id, nickname: nextNickname })
      if (profileWrite.error) {
        setProfile({ nickname: nextNickname })
        setProfileError('Nickname saved to metadata. Run schema sync for table persistence.')
        return
      }
      setProfile({ nickname: nextNickname })
      setProfileModalOpen(false)
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save nickname.')
    } finally {
      setSavingNickname(false)
    }
  }

  async function handleApproveReport(reportId: string) {
    if (!supabase) return
    setProcessingReview(true)
    try {
      const { error } = await supabase.rpc('approve_report', { p_report_id: reportId })
      if (error) throw error
      setPendingReports(prev => prev.filter(r => r.id !== reportId))
    } catch (error) {
      console.error('Approve error:', error)
    } finally {
      setProcessingReview(false)
    }
  }

  async function handleRejectReport(reportId: string) {
    if (!supabase) return
    setProcessingReview(true)
    try {
      const { error } = await supabase.rpc('reject_report', { p_report_id: reportId })
      if (error) throw error
      setPendingReports(prev => prev.filter(r => r.id !== reportId))
    } catch (error) {
      console.error('Reject error:', error)
    } finally {
      setProcessingReview(false)
    }
  }

  useEffect(() => {
    if (isAdminViewer && supabase) {
      supabase
        .from('reports')
        .select('id, reason_category, description, evidence_url, created_at, account:accounts(account_number, bank_name, overall_risk_level)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          if (data) setPendingReports(data as unknown as ReportFeedItem[])
        })
    }
  }, [isAdminViewer])

  useEffect(() => {
    let active = true
    void (async () => {
      if (!supabase) {
        setMyReportsLoading(false)
        return
      }
      const rows = await fetchMyReports(session.user.id)
      if (active) {
        if (rows) setMyReports(rows)
        setMyReportsLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [session.user.id])

  async function signOut() {
    if (isDemoMode()) {
      clearDemoSession()
      window.location.href = '/login'
      return
    }
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleMerchantVerify(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !merchantName.trim() || !merchantCAC.trim() || merchantAccount.length !== ACCOUNT_NUMBER_LENGTH) return
    setVerifyingMerchant(true)
    try {
      const { data, error } = await supabase.rpc('verify_merchant', {
        p_business_name: merchantName.trim(),
        p_cac_number: merchantCAC.trim() || null,
        p_primary_account: merchantAccount,
        p_bank_name: merchantBank
      })
      if (error) throw error
      if (data && data.length > 0) {
        setMerchantResult(data[0])
        incrementSearchCount(`${merchantAccount}|${merchantBank}`)
      }
    } catch (error) {
      console.error('Merchant verification error:', error)
    } finally {
      setVerifyingMerchant(false)
    }
  }

  async function deleteAccount() {
    if (!supabase) return
    try {
      const { error } = await supabase.rpc('admin_delete_user', { user_id: session.user.id })
      if (error) throw error
      await supabase.auth.signOut()
      window.location.href = '/'
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete account.')
    }
  }

  async function handleEventSubscribe(eventId: string) {
    if (!supabase || !subscribeEmail.trim()) return
    setSubscribingToEvent(eventId)
    setSubscribeFeedback('')
    try {
      const { error } = await supabase.from('event_subscribers').insert({
        email: subscribeEmail.trim(),
        name: subscribeName.trim() || null,
        event_id: eventId
      })
      if (error) throw error
      setSubscribeFeedback('Successfully registered! We will contact you soon.')
      setSubscribeEmail('')
      setSubscribeName('')
    } catch (error) {
      setSubscribeFeedback(error instanceof Error ? error.message : 'Registration failed')
    } finally {
      setSubscribingToEvent(null)
    }
  }

  function resetVerify() {
    setResult(null)
    setAccountNumber('')
    setAmount('')
    setCheckError('')
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })
  }

  const getInitial = (name: string) => name ? name.charAt(0).toUpperCase() : '?'

  const statusPillClass = (risk: RiskLevel) =>
    `px-3 py-1 rounded-full text-xs font-medium ${
      risk === 'safe' ? 'bg-green-100 text-green-700' : risk === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
    }`

  return (
    <div className="bg-gray-50 min-h-screen text-gray-900">
      {profileModalOpen && (
        <div className="fixed inset-0 bg-gray-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Set your nickname</h3>
            <form onSubmit={saveNickname} className="space-y-4">
              <div>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder="Your nickname"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <button type="submit" className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2" disabled={savingNickname}>
                {savingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {savingNickname ? 'Saving...' : 'Continue'}
              </button>
              {profileError && <p className="text-red-500 text-sm">{profileError}</p>}
            </form>
          </div>
        </div>
      )}

      {overlayOpen && result && (() => {
        const tips = getSafetyTips(result, accountNumber, result.bankName || '', parseInt(amount, 10) || 0)
        const amountNum = parseInt(amount, 10) || 0
        const searchCount = getSearchCount(`${accountNumber}|${result.bankName || ''}`)

        const riskGradients = {
          safe: { bg: 'rgba(34,197,94,0.12) 0%, rgba(0,0,0,0.85) 70%', border: 'rgba(34,197,94,0.3)', glow: '0 0 60px rgba(34,197,94,0.12), 0 0 120px rgba(34,197,94,0.04)' },
          warning: { bg: 'rgba(245,158,11,0.18) 0%, rgba(0,0,0,0.85) 70%', border: 'rgba(245,158,11,0.35)', glow: '0 0 60px rgba(245,158,11,0.15), 0 0 120px rgba(245,158,11,0.05)' },
          high_risk: { bg: 'rgba(220,38,38,0.30) 0%, rgba(0,0,0,0.88) 70%', border: 'rgba(220,38,38,0.4)', glow: '0 0 80px rgba(220,38,38,0.2), 0 0 150px rgba(220,38,38,0.06)' },
        }[result.risk]

        const btnStyles = {
          safe: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-400 hover:to-emerald-500 shadow-lg shadow-green-500/25',
          warning: 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-amber-500/25',
          high_risk: 'bg-gradient-to-r from-red-600 to-rose-700 text-white',
        }[result.risk]

        return (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 overflow-y-auto" style={{
            background: `radial-gradient(ellipse at center, ${riskGradients.bg})`,
          }}>
            <div className="relative w-full max-w-lg my-8 animate-in zoom-in-95 duration-300">
              {/* Main Glass Card */}
              <div className="relative bg-slate-900/80 backdrop-blur-2xl rounded-3xl p-6 md:p-7 shadow-2xl" style={{
                border: `1px solid ${riskGradients.border}`,
                boxShadow: riskGradients.glow,
              }}>
                {/* Top decorative gradient line */}
                <div className="absolute top-0 left-6 right-6 h-0.5 rounded-full" style={{ background: `linear-gradient(90deg, transparent, ${riskGradients.border})` }}></div>

                {/* Close button */}
                <button
                  type="button"
                  onClick={() => setOverlayOpen(false)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors z-10 border border-slate-700/50"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Gauge */}
                <div className="flex justify-center mb-3">
                  <Gauge score={result.score} risk={result.risk} label={RISK_META[result.risk].label} />
                </div>

                {/* Account Info Card */}
                <div className="bg-slate-800/40 rounded-xl p-4 mb-4 border border-slate-700/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase">Account</p>
                      <p className="text-white font-mono text-base font-bold tracking-wider mt-0.5">{maskAccount(accountNumber)}</p>
                      {result.bankName && (
                        <p className="text-slate-400 text-xs font-mono mt-0.5">{result.bankName}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase">Risk Score</p>
                      <p className={`text-xl font-bold mt-0.5 ${result.risk === 'safe' ? 'text-green-400' : result.risk === 'warning' ? 'text-amber-400' : 'text-red-400'}`}>{result.score}%</p>
                      <span className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        result.risk === 'safe' ? 'bg-green-500/15 text-green-400' : result.risk === 'warning' ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
                      }`}>{RISK_META[result.risk].label}</span>
                    </div>
                  </div>
                  {result.accountName && (
                    <div className="mt-2 pt-2 border-t border-slate-700/30">
                      <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase">Account Name</p>
                      <p className="text-slate-300 text-sm mt-0.5">{result.accountName}</p>
                    </div>
                  )}
                  {amountNum > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/30">
                      <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase">Transfer Amount</p>
                      <p className="text-white text-sm font-semibold mt-0.5">₦{amountNum.toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {/* Watchlist / Registry Matches */}
                {result.sourceRegistry && result.sourceRegistry.length > 0 && (
                  <div className="mb-4">
                    <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase mb-2">Watchlist Matches</p>
                    <div className="flex flex-wrap gap-2">
                      {result.sourceRegistry.map((src) => {
                        const tier = src.toUpperCase() === 'CROWDSOURCED' ? 'Community' : 'Official'
                        return (
                          <span
                            key={src}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                              src === 'PEP'
                                ? 'bg-amber-950/40 border-amber-700/40 text-amber-300'
                                : 'bg-red-950/50 border-red-800/50 text-red-300'
                            }`}
                          >
                            {src === 'PEP' ? 'Politically Exposed Person' : `${src} Watchlist`}
                            <span
                              className={`ml-1.5 text-[9px] font-medium uppercase tracking-wider ${
                                tier === 'Official' ? 'opacity-80' : 'opacity-60 italic'
                              }`}
                              title={
                                tier === 'Official'
                                  ? 'Verified government / official registry source'
                                  : 'Community-reported (OSINT) source - may be included or excluded by source policy'
                              }
                            >
                              {tier}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Risk Factors */}
                {result.reasons.length > 0 && (
                  <div className="mb-4">
                    <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase mb-2">Risk Factors</p>
                    <div className="space-y-2">
                      {result.reasons.map((reason, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm bg-slate-800/30 rounded-lg px-3 py-2 border border-slate-700/20">
                          {result.risk === 'safe' ? (
                            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                          ) : result.risk === 'warning' ? (
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
                          ) : (
                            <AlertIcon className="w-4 h-4 mt-0.5 shrink-0 text-red-400" />
                          )}
                          <span className="text-slate-300">{reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dynamic Safety Advice */}
                <div className="mb-4">
                  <p className="text-slate-500 text-[10px] font-medium tracking-[0.12em] uppercase mb-2">Safety Advisory</p>
                  <div className="space-y-2">
                    {tips.slice(0, 3).map((tip, i) => (
                      <div key={i} className={`rounded-lg px-3.5 py-3 text-sm border ${
                        result.risk === 'high_risk'
                          ? 'bg-red-950/30 border-red-800/30'
                          : result.risk === 'warning'
                          ? 'bg-amber-950/20 border-amber-800/25'
                          : 'bg-green-950/20 border-green-800/20'
                      }`}>
                        <div className="flex items-start gap-2.5">
                          <span className="text-base shrink-0 mt-0.5">{tip.icon}</span>
                          <div>
                            <p className={`font-semibold text-sm mb-0.5 ${
                              result.risk === 'high_risk' ? 'text-red-300' : result.risk === 'warning' ? 'text-amber-300' : 'text-green-300'
                            }`}>{tip.title}</p>
                            <p className="text-slate-400 leading-relaxed text-xs">{tip.body}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search Tally */}
                {searchCount > 0 && (
                  <div className="text-center mb-3">
                    <span className="text-slate-500 text-xs">
                      <span className="font-semibold text-slate-300">{searchCount}</span> {searchCount === 1 ? 'person has' : 'people have'} also checked this account
                    </span>
                  </div>
                )}

                {/* Action Button */}
                {result.risk === 'high_risk' ? (
                  <button
                    type="button"
                    className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all duration-300 disabled:opacity-40"
                    style={{
                      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                      color: '#fff',
                      boxShadow: countdown > 0 ? 'none' : '0 0 25px rgba(220,38,38,0.35)',
                      animation: countdown > 0 ? 'none' : 'gauge-pulse 1.5s ease-in-out infinite',
                    }}
                    onClick={() => setOverlayOpen(false)}
                    disabled={countdown > 0}
                  >
                    {countdown > 0 ? `HOLD — VERIFYING (${countdown}s)` : 'I UNDERSTAND THE RISK, PROCEED'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`w-full py-3.5 rounded-xl font-bold text-sm tracking-wider transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${btnStyles}`}
                    onClick={() => setOverlayOpen(false)}
                  >
                    CONTINUE
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      <nav className="h-16 bg-white border-b flex items-center justify-between px-6 sticky top-0 z-30">
        <div>
          <h1 className="text-xl font-semibold text-green-600 leading-none" data-tour="brand">Shield</h1>
          <p className="text-xs font-normal text-green-400/70 tracking-[0.08em] leading-tight">by AG Tech</p>
        </div>

        <div className="flex gap-6 text-sm font-medium">
          <button
            type="button"
            className={`${activeTab === 'home' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('home')}
          >
            Home
          </button>
          <button
            type="button"
            className={`${activeTab === 'scan' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('scan')}
          >
            Scan
          </button>
          <button
            type="button"
            className={`${activeTab === 'reports' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('reports')}
          >
            Reports
          </button>
          <button
            type="button"
            className={`${activeTab === 'community' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('community')}
          >
            Community
          </button>
          <button
            type="button"
            className={`${activeTab === 'merchant' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('merchant')}
          >
            Verify Business
          </button>
          <button
            type="button"
            className={`${activeTab === 'events' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('events')}
          >
            Events
          </button>
          <button
            type="button"
            className={`${activeTab === 'settings' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
          {isAdminViewer && (
            <button
              type="button"
              className={`${activeTab === 'admin' ? 'text-brand-teal border-b-2 border-brand-teal pb-1' : 'text-gray-600 hover:text-brand-teal'}`}
              onClick={() => setActiveTab('admin')}
            >
              Admin
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 hidden md:inline">
            Welcome back, <span className="font-semibold text-green-600">{profile?.nickname || 'User'}</span> 🛡️
          </span>
          <button type="button" onClick={() => setActiveTab('settings')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg relative" title="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>
          <ThemeToggle />
          <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">
            {getInitial(profile?.nickname ?? 'U')}
          </div>
        </div>
      </nav>

      <div className="p-6 space-y-6">
        {activeTab === 'home' && (
          <>
            {dashboardLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
              </div>
            ) : (
            <><div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:border-green-200 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Accounts Checked</span>
                  <span className="text-2xl">📊</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800">{history.length}</h3>
                <p className="text-xs text-green-600 mt-1 flex items-center gap-1">↑ Growing daily</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:border-red-200 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Fraudulent Accounts</span>
                  <span className="text-2xl">🚫</span>
                </div>
                <h3 className="text-2xl font-bold text-red-500">{riskChartData.find(d => d.name === 'Dangerous')?.value || 0}</h3>
                <p className="text-xs text-red-500 mt-1">Flagged by community</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:border-green-200 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Verified Safe</span>
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="text-2xl font-bold text-green-600">{riskChartData.find(d => d.name === 'Safe')?.value || 0}</h3>
                <p className="text-xs text-green-600 mt-1">No negative reports</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 hover:border-amber-200 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">Reports Submitted</span>
                  <span className="text-2xl">📝</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800">{liveFeed.length}</h3>
                <p className="text-xs text-gray-500 mt-1">Community reports</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="group bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-2xl text-white shadow-lg shadow-green-500/10 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-green-500/20 hover:-translate-y-0.5" onClick={() => setActiveTab('scan')}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Quick Scan</h3>
                    <p className="text-sm text-green-50/80 mb-4">Scan an account number to check for fraud risk</p>
                    <button className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/30 transition-all flex items-center gap-2 group-hover:gap-3">
                      Go to Scanner <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </button>
                  </div>
                  <span className="text-4xl opacity-60 group-hover:opacity-100 transition-opacity">🔍</span>
                </div>
              </div>
              <div className="group bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-500/10 cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20 hover:-translate-y-0.5" onClick={() => setActiveTab('reports')}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">Report Scam</h3>
                    <p className="text-sm text-blue-50/80 mb-4">Help the community by reporting suspicious accounts</p>
                    <button className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/30 transition-all flex items-center gap-2 group-hover:gap-3">
                      Submit Report <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </button>
                  </div>
                  <span className="text-4xl opacity-60 group-hover:opacity-100 transition-opacity">📋</span>
                </div>
              </div>
            </div>

            <div id="recent-activity" className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Recent Activity</h3>
                <div className="flex items-center gap-2">
                  {history.length > 0 && (
                    <button
                      onClick={exportHistoryPDF}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    > Print Report </button>
                  )}
                  {history.length > 0 && <span className="text-xs text-gray-400">{history.length} total checks</span>}
                </div>
              </div>
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2 opacity-30">🔍</div>
                  <p className="text-gray-400 text-sm">No recent activity. Start by scanning an account!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {history.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 rounded-lg px-2 -mx-2 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                          item.risk === 'safe' ? 'bg-green-100 text-green-600' : item.risk === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'
                        }`}>
                          {item.risk === 'safe' ? '✓' : item.risk === 'warning' ? '!' : '✕'}
                        </div>
                        <div>
                          <p className="font-medium text-sm font-mono tracking-wider">{maskAccount(item.accountNumber)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-gray-500">{item.bankName}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">{getSearchCount(`${item.accountNumber}|${item.bankName}`)} searches</span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        item.risk === 'safe' ? 'bg-green-50 text-green-700' : item.risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {item.risk === 'safe' ? 'Safe' : item.risk === 'warning' ? 'Warning' : 'High Risk'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result && (() => {
              const tips = getSafetyTips(result, accountNumber, result.bankName || '', parseInt(amount) || 0)
              return (
                <div className="bg-gradient-to-br from-white to-green-50/40 p-6 rounded-2xl shadow border border-green-100/50">
                  <div className="flex items-center gap-2 mb-4">
                    {result.risk === 'safe' ? (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                    ) : result.risk === 'warning' ? (
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><AlertIcon className="w-4 h-4 text-red-600" /></div>
                    )}
                    <h2 className="text-lg font-semibold">Check Result</h2>
                  </div>

                  <div className="flex items-center justify-between bg-white rounded-xl p-4 border">
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Account</p>
                      <h3 className="font-mono font-bold tracking-wider text-gray-800 mt-0.5">{maskAccount(accountNumber)}</h3>
                      {result.bankName && <p className="text-xs text-gray-500 font-mono">{result.bankName}</p>}
                      {result.accountName && <p className="text-sm text-gray-600 mt-1">{result.accountName}</p>}
                      <p className="text-xs text-gray-400 mt-2">
                        <span className="font-semibold text-gray-600">{getSearchCount(`${accountNumber}|${result.bankName || ''}`)}</span> people also checked this account
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Score</p>
                      <h3 className={`text-2xl font-bold mt-0.5 ${result.risk === 'safe' ? 'text-green-600' : result.risk === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>{result.score}%</h3>
                      <span className={statusPillClass(result.risk)}>{RISK_META[result.risk].label}</span>
                    </div>
                  </div>

                  {/* Dynamic Advice */}
                  <div className="mt-4 space-y-2">
                    {tips.slice(0, 2).map((tip, i) => (
                      <div key={i} className={`rounded-lg px-3.5 py-2.5 border text-sm ${
                        result.risk === 'high_risk'
                          ? 'bg-red-50 border-red-200'
                          : result.risk === 'warning'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">{tip.icon}</span>
                          <div>
                            <p className={`font-semibold text-sm ${
                              result.risk === 'high_risk' ? 'text-red-700' : result.risk === 'warning' ? 'text-amber-700' : 'text-green-700'
                            }`}>{tip.title}</p>
                            <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{tip.body}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Risk Factors */}
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Risk Factors</p>
                    <ul className="text-sm text-gray-600 space-y-1.5">
                      {result.reasons.map((reason, idx) => (
                        <li key={`${reason}-${idx}`} className="flex items-start gap-2">
                          <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${result.risk === 'safe' ? 'text-green-500' : result.risk === 'warning' ? 'text-amber-500' : 'text-red-500'}`} />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {result.socialProof && (
                    <div className={`mt-3 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 ${
                      result.risk === 'high_risk' ? 'bg-red-50 text-red-700' : result.risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {result.risk === 'high_risk' ? <AlertIcon className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                      {result.socialProof}
                    </div>
                  )}

                  <button type="button" onClick={resetVerify} className="mt-4 text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                    ← Check another account
                  </button>
                </div>
              )
            })()}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Visitors</p>
                  <span className="text-blue-500 text-lg">👤</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800">{userCount}</h3>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-red-200 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Fraudulent</p>
                  <span className="text-red-500 text-lg">🚫</span>
                </div>
                <h3 className="text-2xl font-bold text-red-500">{riskChartData.find(d => d.name === 'Dangerous')?.value || 0}</h3>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-green-200 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Verified Safe</p>
                  <span className="text-green-500 text-lg">✅</span>
                </div>
                <h3 className="text-2xl font-bold text-green-600">{riskChartData.find(d => d.name === 'Safe')?.value || 0}</h3>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-amber-200 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Checks Done</p>
                  <span className="text-amber-500 text-lg">📊</span>
                </div>
                <h3 className="text-2xl font-bold text-gray-800">{history.length}</h3>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Risk Distribution</h2>
                <div className="flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-green-500 rounded-full"></span>
                    <span className="text-gray-500">Safe</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></span>
                    <span className="text-gray-500">Suspicious</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 bg-red-500 rounded-full"></span>
                    <span className="text-gray-500">Dangerous</span>
                  </div>
                </div>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={riskChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {riskChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Community Reports</h2>
                <span className="text-xs text-gray-400">{liveFeed.length} total</span>
              </div>
              {!liveFeed.length ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-2 opacity-30">📋</div>
                  <p className="text-gray-400 text-sm">No reports yet. Submit a report to help the community.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="py-2.5 text-left text-gray-400 font-medium text-[11px] uppercase tracking-wider">Account</th>
                        <th className="text-left text-gray-400 font-medium text-[11px] uppercase tracking-wider">Type</th>
                        <th className="text-left text-gray-400 font-medium text-[11px] uppercase tracking-wider">Date</th>
                        <th className="text-left text-gray-400 font-medium text-[11px] uppercase tracking-wider">Evidence</th>
                        <th className="text-left text-gray-400 font-medium text-[11px] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveFeed.map((entry) => {
                        const account = entry.account
                        const risk = account?.overall_risk_level ?? 'warning'
                        const isImage = entry.evidence_url?.match(/\.(jpg|jpeg|png|webp)$/i)
                        const isPdf = entry.evidence_url?.match(/\.pdf$/i)
                        return (
                          <tr key={entry.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                            <td className="py-3 font-mono tracking-wider">
                              {account?.account_number ? maskAccount(account.account_number) : '—'}
                              <span className="block text-[10px] text-gray-400 font-normal mt-0.5">{account?.account_number ? getSearchCount(`${account.account_number}|${account.bank_name || ''}`) : 0} searches</span>
                            </td>
                            <td className="py-3">
                              <span className="text-gray-700 text-xs">{entry.reason_category ?? 'General'}</span>
                            </td>
                            <td className="py-3 text-gray-500 text-xs">{formatDate(entry.created_at)}</td>
                            <td className="py-3">
                              {entry.evidence_url && isValidUrl(entry.evidence_url) ? (
                                isImage ? (
                                  <a href={entry.evidence_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 text-xs font-medium flex items-center gap-1">
                                    <span>📸</span> View Image
                                  </a>
                                ) : isPdf ? (
                                  <a href={entry.evidence_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 text-xs font-medium flex items-center gap-1">
                                    <span>📄</span> View PDF
                                  </a>
                                ) : (
                                  <a href={entry.evidence_url} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700 text-xs font-medium flex items-center gap-1">
                                    <span>🔗</span> View Link
                                  </a>
                                )
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="py-3">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                risk === 'safe' ? 'bg-green-50 text-green-700' : risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                              }`}>{RISK_META[risk].label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Live Activity</h2>
                {history.length > 0 && <span className="text-xs text-gray-400">Last 5 checks</span>}
              </div>
              <ul className="space-y-1">
                {history.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-gray-50/50 transition-colors text-sm">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                      item.risk === 'safe' ? 'bg-green-100 text-green-600' : item.risk === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'
                    }`}>
                      {item.risk === 'safe' ? '✓' : item.risk === 'warning' ? '!' : '✕'}
                    </div>
                    <div className="flex-1 flex items-baseline gap-1.5">
                      <span className="font-mono tracking-wider font-medium">{maskAccount(item.accountNumber)}</span>
                      <span className="text-gray-400 text-xs">· {item.bankName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        item.risk === 'safe' ? 'bg-green-50 text-green-700' : item.risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {item.risk === 'safe' ? 'Safe' : item.risk === 'warning' ? 'Warning' : 'High Risk'}
                      </span>
                      <span className="text-gray-400 text-xs">{formatTime(item.timestamp)}</span>
                    </div>
                  </li>
                ))}
                {history.length === 0 && (
                  <li className="text-center py-6">
                    <div className="text-2xl mb-1 opacity-30">📡</div>
                    <p className="text-gray-400 text-sm">No activity yet. Check an account to get started.</p>
                  </li>
                )}
              </ul>
            </div>
          </>
          )}
          </>
        )}

        {activeTab === 'scan' && (
          <div className="glass rounded-xl p-6 shadow-sm max-w-3xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Instant Scanner</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enter any Nigerian bank account number to see its risk tier, community flags, and masked account
                  name before you transfer.
                </p>
              </div>
              <button
                type="button"
                onClick={exportHistoryPDF}
                className="no-print shrink-0 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Print Report
              </button>
            </div>
            <form onSubmit={handleCheck} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-3">
                <div>
                  <label htmlFor="scanAccount" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Account Number
                  </label>
                  <input
                    id="scanAccount"
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(sanitizeAccountNumber(e.target.value))}
                    placeholder="002 123 4567"
                    maxLength={ACCOUNT_NUMBER_LENGTH}
                    inputMode="numeric"
                    className="w-full border rounded-lg px-4 py-2.5 font-mono tracking-[3px] focus:outline-none focus:ring-2 focus:ring-teal-500"
                    data-tour="scan-input"
                  />
                </div>
                <div>
                  <label htmlFor="scanBank" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Bank
                  </label>
                  <select
                    id="scanBank"
                    value={scanBank}
                    onChange={(e) => setScanBank(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Auto-detect</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    className="w-full sm:w-auto bg-brand-teal text-brand-deep px-6 py-2.5 rounded-lg font-semibold hover:bg-teal-600 disabled:opacity-50 flex items-center justify-center gap-2 teal-glow"
                    disabled={checking || accountNumber.length !== ACCOUNT_NUMBER_LENGTH}
                    data-tour="check-btn"
                  >
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {checking ? 'Checking…' : 'Scan'}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="scanAmount" className="block text-xs font-medium text-gray-500 mb-1.5">
                  Transfer amount (optional)
                </label>
                <input
                  id="scanAmount"
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 150000"
                  className="w-full border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              {checkError && <p className="text-red-500 text-sm flex items-center gap-2"><AlertIcon className="w-4 h-4" />{checkError}</p>}
            </form>

            {tourDemo && (
              <div data-tour="result-card" className="mt-6 pt-6 border-t">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold">Demo Result</h3>
                </div>
                <div className="flex items-center justify-between bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border">
                  <div>
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Account</p>
                    <h4 className="font-mono font-bold tracking-wider text-gray-800 mt-0.5">******9941</h4>
                    <p className="text-xs text-gray-500 font-mono">OPay</p>
                    <p className="text-sm text-gray-600 mt-1">Demo User</p>
                    <p className="text-xs text-gray-400 mt-2"><span className="font-semibold text-gray-600">12</span> people also checked this account</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Score</p>
                    <h4 className="text-2xl font-bold mt-0.5 text-amber-500">45%</h4>
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Suspicious</span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="rounded-lg px-3.5 py-2.5 border text-sm bg-amber-50 border-amber-200">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">🛡️</span>
                      <div>
                        <p className="font-semibold text-sm text-amber-700">Flagged for Review</p>
                        <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">This account has been reported in community alerts. Exercise caution before sending payments.</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg px-3.5 py-2.5 border text-sm bg-amber-50 border-amber-200">
                    <div className="flex items-start gap-2">
                      <span className="text-base shrink-0">📋</span>
                      <div>
                        <p className="font-semibold text-sm text-amber-700">Confirm Identity</p>
                        <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">Call the recipient on a known number to verify their identity before transferring.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <ul className="text-sm text-gray-600 space-y-1.5 mt-4 pt-3 border-t border-gray-100">
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />Reported by 2 community members</li>
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />Account created less than 3 months ago</li>
                  <li className="flex items-start gap-2"><CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />Multiple recent searches from different users</li>
                </ul>
              </div>
            )}

            {result && (() => {
        const tips = getSafetyTips(result, accountNumber, result.bankName || '', parseInt(amount) || 0)
              const scoreTone = result.risk === 'safe' ? 'bg-green-500' : result.risk === 'warning' ? 'bg-amber-500' : 'bg-red-500'
              return (
                <div className="mt-6 pt-6 border-t">
                  <div className="flex items-center gap-2 mb-4">
                    {result.risk === 'safe' ? (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle className="w-4 h-4 text-green-600" /></div>
                    ) : result.risk === 'warning' ? (
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><AlertIcon className="w-4 h-4 text-red-600" /></div>
                    )}
                    <h3 className="text-lg font-semibold">Result</h3>
                    <span className={statusPillClass(result.risk)}>{RISK_META[result.risk].label}</span>
                  </div>

                  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Account</p>
                        <h4 className="font-mono font-bold tracking-wider text-gray-800 mt-0.5">{maskAccount(accountNumber)}</h4>
                        <p className="text-xs text-gray-500 font-mono">{result.bankName || scanBank || 'Bank auto-detected'}</p>
                        {result.accountName && <p className="text-sm text-gray-600 mt-1">{result.accountName}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Score</p>
                        <h4 className={`text-2xl font-bold mt-0.5 ${result.risk === 'safe' ? 'text-green-600' : result.risk === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>
                          {result.score}<span className="text-sm font-medium text-gray-400">/100</span>
                        </h4>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${scoreTone}`}
                        style={{ width: `${Math.max(3, Math.min(100, result.score))}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2 font-mono">
                      <span className="font-semibold text-gray-600">{getSearchCount(`${accountNumber}|${result.bankName || ''}`)}</span> people also checked this account
                    </p>
                  </div>

                  {/* Dynamic Advice */}
                  <div className="mt-4 space-y-2">
                    {tips.slice(0, 2).map((tip, i) => (
                      <div key={i} className={`rounded-lg px-3.5 py-2.5 border text-sm ${
                        result.risk === 'high_risk'
                          ? 'bg-red-50 border-red-200'
                          : result.risk === 'warning'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-green-50 border-green-200'
                      }`}>
                        <div className="flex items-start gap-2">
                          <span className="text-base shrink-0">{tip.icon}</span>
                          <div>
                            <p className={`font-semibold text-sm ${
                              result.risk === 'high_risk' ? 'text-red-700' : result.risk === 'warning' ? 'text-amber-700' : 'text-green-700'
                            }`}>{tip.title}</p>
                            <p className="text-gray-600 text-xs mt-0.5 leading-relaxed">{tip.body}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Why this score?</p>
                    <ul className="text-sm text-gray-600 space-y-1.5">
                      {result.reasons.map((reason) => (
                        <li key={reason} className="flex items-start gap-2">
                          <CheckCircle className={`w-4 h-4 mt-0.5 shrink-0 ${result.risk === 'safe' ? 'text-green-500' : result.risk === 'warning' ? 'text-amber-500' : 'text-red-500'}`} />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {result.socialProof && (
                    <div className={`mt-3 px-3.5 py-2 rounded-lg text-xs flex items-center gap-2 ${
                      result.risk === 'high_risk' ? 'bg-red-50 text-red-700' : result.risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {result.risk === 'high_risk' ? <AlertIcon className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                      {result.socialProof}
                    </div>
                  )}
                  <div className="mt-4 flex items-center justify-between">
                    <button type="button" onClick={resetVerify} className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                      ← Check another account
                    </button>
                    <button
                      type="button"
                      onClick={exportHistoryPDF}
                      className="text-sm font-semibold text-brand-teal hover:underline flex items-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" /> Print Report
                    </button>
                  </div>
                </div>
              )
            })()}

            {history.length > 0 && (
              <div className="mt-6 pt-6 border-t">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Recent scans</h3>
                  <button
                    type="button"
                    onClick={exportHistoryPDF}
                    className="no-print text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Print Report
                  </button>
                </div>
                <div className="space-y-1">
                  {history.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 rounded-lg px-2 -mx-2 hover:bg-gray-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm ${
                          item.risk === 'safe' ? 'bg-green-100 text-green-600' : item.risk === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-500'
                        }`}>
                          {item.risk === 'safe' ? '✓' : item.risk === 'warning' ? '!' : '✕'}
                        </div>
                        <div>
                          <p className="font-medium text-sm font-mono tracking-wider">{maskAccount(item.accountNumber)}</p>
                          <span className="text-xs text-gray-500">{item.bankName || 'Auto-detected bank'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {typeof item.score === 'number' && <span className="font-mono text-xs text-gray-400">{item.score}/100</span>}
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                          item.risk === 'safe' ? 'bg-green-50 text-green-700' : item.risk === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {item.risk === 'safe' ? 'Safe' : item.risk === 'warning' ? 'Suspicious' : 'Dangerous'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="max-w-5xl mx-auto grid gap-6 lg:grid-cols-[1fr_340px] items-start">
            <div className="bg-white rounded-2xl shadow overflow-hidden" data-tour="reports-form">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Report a Scam</h2>
                    <p className="text-sm text-gray-500">Flag a suspicious account to warn the community.</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {reportSubmitted ? (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">Report submitted</h3>
                    <p className="text-sm text-gray-500 mb-1">
                      Account <span className="font-mono tracking-wider font-medium text-gray-700">{maskAccount(submittedAccount)}</span> has been flagged.
                    </p>
                    <p className="text-sm text-gray-500 mb-6">Our moderators review every report before it is published. Thank you.</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => { setReportSubmitted(false); setReportFeedback('') }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                      >
                        Submit another
                      </button>
                      <button
                        type="button"
                        onClick={() => document.getElementById('my-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                        className="px-4 py-2 border border-green-200 text-green-700 rounded-lg hover:bg-green-50 text-sm"
                      >
                        View my reports
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleReport} className="space-y-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                        <span className="text-sm font-medium text-gray-700">Account</span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            value={reportAccount}
                            onChange={(e) => setReportAccount(sanitizeAccountNumber(e.target.value))}
                            placeholder="Account number"
                            maxLength={10}
                            required
                            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono tracking-widest"
                          />
                        </div>
                        <div className="relative">
                          <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <select
                            value={reportBank}
                            onChange={(e) => setReportBank(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none bg-white"
                          >
                            {BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                          </select>
                        </div>
                      </div>
                      {reportAccount && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                          <span className="font-mono tracking-widest text-xs text-green-800">{spaceAccount(reportAccount)}</span>
                          <span className="text-gray-300 text-xs">·</span>
                          <span className="text-xs text-gray-600">{reportBank}</span>
                          <span className="text-[10px] text-gray-400 font-mono">NIP {BANK_CODES[reportBank]}</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                        <span className="text-sm font-medium text-gray-700">What kind of scam is this?</span>
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {REPORT_CATEGORIES.map((cat) => {
                          const meta = CATEGORY_META[cat]
                          const Icon = meta.icon
                          const active = reportType === cat
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => { setReportType(cat); setReportFeedback('') }}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-sm transition-colors ${active ? `${meta.active} ring-1` : 'border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50/40'}`}
                            >
                              <Icon className={`h-4 w-4 shrink-0 ${active ? meta.accent : 'text-gray-400'}`} />
                              <span className="truncate">{cat}</span>
                              {active && <Check className="w-4 h-4 ml-auto shrink-0 text-green-600" />}
                            </button>
                          )
                        })}
                      </div>
                      {reportType === 'Other' && (
                        <input
                          value={reportOtherCategory}
                          onChange={(e) => setReportOtherCategory(e.target.value)}
                          placeholder="Tell us what kind of scam this was, in your own words..."
                          required
                          className="mt-2 w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center">3</span>
                        <span className="text-sm font-medium text-gray-700">What happened?</span>
                      </div>
                      <textarea
                        value={reportDescription}
                        onChange={(e) => setReportDescription(e.target.value)}
                        placeholder="Describe what happened — what did they promise? How did they contact you? What happened after you paid?"
                        rows={3}
                        maxLength={400}
                        className="mt-2 w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                      />
                      <p className="text-right text-[11px] text-gray-400 mt-1">{reportDescription.length}/400</p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center">4</span>
                          <span className="text-sm font-medium text-gray-700">Evidence</span>
                        </div>
                        <div className="flex gap-1">
                          {([['link', 'Link', Link2], ['image', 'Image', ImageIcon], ['pdf', 'PDF', FileText]] as const).map(([key, label, Icon]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setReportEvidenceType(key)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${reportEvidenceType === key ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            >
                              <Icon className="h-3.5 w-3.5" /> {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {reportEvidenceType === 'link' ? (
                        <input
                          type="url"
                          value={reportEvidenceUrl}
                          onChange={(e) => setReportEvidenceUrl(e.target.value)}
                          placeholder="https://example.com/screenshot.png"
                          required
                          className="mt-2 w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      ) : (
                        <div
                          className="mt-2"
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault()
                            const f = e.dataTransfer.files?.[0]
                            if (f) setReportEvidenceFile(f)
                          }}
                        >
                          <label className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-4 py-5 text-center cursor-pointer transition-colors ${reportEvidenceFile ? 'border-green-300 bg-green-50/40 hover:border-green-400' : 'border-gray-300 hover:border-green-300 hover:bg-green-50/40'}`}>
                            {reportEvidenceFile ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <span className="text-sm text-gray-700">{reportEvidenceFile.name}</span>
                                <span className="text-xs text-gray-400">Click to replace or drop a new file</span>
                              </>
                            ) : (
                              <>
                                <Upload className="h-5 w-5 text-gray-400" />
                                <span className="text-sm text-gray-600">Click to attach or drag &amp; drop</span>
                                <span className="text-xs text-gray-400">{reportEvidenceType === 'image' ? 'JPG, PNG or WEBP' : 'PDF'}</span>
                              </>
                            )}
                          </label>
                          <input
                            type="file"
                            accept={reportEvidenceType === 'image' ? 'image/*' : 'application/pdf'}
                            onChange={(e) => setReportEvidenceFile(e.target.files?.[0] ?? null)}
                            required
                            className="hidden"
                          />
                          {reportEvidenceFile && (
                            <div className="mt-2 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                              <span className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                                <FileText className="h-4 w-4 text-green-600 shrink-0" />
                                <span className="truncate font-medium">{reportEvidenceFile.name}</span>
                                <span className="text-xs text-gray-400 shrink-0">{(reportEvidenceFile.size / 1024).toFixed(0)} KB</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setReportEvidenceFile(null)}
                                className="text-red-500 hover:text-red-600 shrink-0"
                                aria-label="Remove file"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {reportEvidenceUploading && (
                        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Uploading evidence...
                        </p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={reporting}
                      className="w-full inline-flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm"
                    >
                      {reporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {reporting ? 'Submitting...' : 'Submit Report'}
                    </button>

                    {reportFeedback && (
                      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${reportFeedback.includes('error') ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-700'}`}>
                        {reportFeedback.includes('error')
                          ? <AlertIcon className="h-4 w-4 mt-0.5 shrink-0" />
                          : <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                        {reportFeedback}
                      </div>
                    )}
                  </form>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div id="my-reports" className="bg-white p-6 rounded-2xl shadow scroll-mt-24">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-green-600" /> Your Reports
                  </h3>
                  {myReports.length > 0 && <span className="text-xs text-gray-400">{myReports.length}</span>}
                </div>
                {myReportsLoading ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="animate-spin h-4 w-4" /> Loading your reports...
                  </div>
                ) : myReports.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2 opacity-30">🛡️</div>
                    <p className="text-gray-400 text-sm">You haven't reported any scams yet.</p>
                    <button
                      type="button"
                      onClick={() => setReportSubmitted(false)}
                      className="mt-3 text-sm text-green-600 hover:text-green-700 underline"
                    >
                      Report an account
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {myReports.map((report) => {
                      const statusMeta = REPORT_STATUS_META[report.status ?? ''] ?? { label: report.status ?? 'Submitted', cls: 'bg-gray-100 text-gray-600' }
                      return (
                        <li key={report.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono tracking-wider text-sm text-gray-800">
                              {report.account ? maskAccount(report.account.account_number) : 'Unknown account'}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusMeta.cls}`}>
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {report.account?.bank_name ?? ''}{report.account?.bank_name ? ' · ' : ''}{formatDate(report.created_at)}
                          </p>
                          <span className="mt-2 inline-block text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                            {report.reason_category ?? 'General'}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-600" /> How reports are used
                </h3>
                <ul className="space-y-3 text-sm text-gray-600">
                  <li className="flex gap-2.5">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> Reviewed by our moderators before publishing.
                  </li>
                  <li className="flex gap-2.5">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> Each approved report raises the account's risk score for everyone.
                  </li>
                  <li className="flex gap-2.5">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> Users who search a flagged account see the warning.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-lg mx-auto space-y-6" data-tour="settings-area">
            <div className="bg-white p-6 rounded-2xl shadow">
              <h2 className="text-lg font-semibold mb-6">Account Settings</h2>

              <form onSubmit={saveNickname} className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Display Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      placeholder="Your nickname"
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Email</label>
                  <input
                    value={session.user.email ?? ''}
                    readOnly
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm"
                  />
                </div>
                <button type="submit" className="bg-brand-teal text-brand-deep px-5 py-2 rounded-lg hover:bg-teal-600 disabled:opacity-50 flex items-center gap-2 text-sm font-medium" disabled={savingNickname}>
                  {savingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {savingNickname ? 'Saving...' : 'Save Changes'}
                </button>
                {profileError && <p className="text-red-500 text-sm">{profileError}</p>}
              </form>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h3 className="text-sm font-semibold mb-1">Appearance</h3>
              <p className="text-xs text-gray-500 mb-4">
                Dark-first AG Tech theme. Your choice is saved on this device.
              </p>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                <span className="text-sm text-gray-600">Theme</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Light / Dark</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h3 className="text-sm font-semibold mb-4">Notifications</h3>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-teal-500" />
                  <span className="text-sm text-gray-600">Email me when an account I searched is later flagged</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-teal-500" />
                  <span className="text-sm text-gray-600">Weekly fraud alert digest</span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 rounded border-gray-300 text-green-600 focus:ring-teal-500" />
                  <span className="text-sm text-gray-600">Community report updates</span>
                </label>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h3 className="text-sm font-semibold mb-4">Privacy</h3>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => { const h = loadHistory(); if (h.length === 0) { alert('No search history yet.') } else { setActiveTab('home') } }} className="text-sm text-green-600 border border-green-200 px-4 py-2 rounded-lg hover:bg-green-50">
                  View my searches
                </button>
                <button type="button" onClick={() => { localStorage.removeItem(STORAGE_KEY); setHistory([]) }} className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50">
                  Clear history
                </button>
                <button type="button" onClick={() => setActiveTab('reports')} className="text-sm text-green-600 border border-green-200 px-4 py-2 rounded-lg hover:bg-green-50">
                  View my reports
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h3 className="text-sm font-semibold mb-4">Security</h3>
              <div className="space-y-3">
                <button type="button" onClick={async () => { if (!supabase) return; await supabase.auth.resetPasswordForEmail(session.user.email ?? '', { redirectTo: `${window.location.origin}/dashboard` }); alert('Check your email for the password reset link.') }} className="text-sm text-green-600 border border-green-200 px-4 py-2 rounded-lg hover:bg-green-50 w-full text-left">
                  Change password →
                </button>
                <button type="button" onClick={async () => { if (!supabase) return; await supabase.auth.signOut({ scope: 'others' }); alert('Signed out of all other devices.') }} className="text-sm text-gray-600 border border-gray-200 px-4 py-2 rounded-lg hover:bg-gray-50 w-full text-left">
                  Sign out of all devices
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow border border-red-100">
              <h3 className="text-sm font-semibold mb-2 text-red-600">Danger Zone</h3>
              <p className="text-xs text-gray-500 mb-4">Once you delete your account, there is no going back. Please be certain.</p>
              <button type="button" onClick={() => { if (window.confirm('Are you sure you want to delete your account? This cannot be undone.')) { deleteAccount() } }} className="text-sm text-white bg-red-600 px-4 py-2 rounded-lg hover:bg-red-700">
                Delete my account
              </button>
            </div>

            <div className="text-center space-y-2">
              <button type="button" onClick={() => { setTourRunning(true); setTourStep(0); setTourDemo(false); setActiveTab('home') }} className="text-sm text-green-600 hover:text-green-700 underline">
                Take the tour again
              </button>
            </div>
            <div className="text-center">
              <button type="button" onClick={() => setSignOutConfirmOpen(true)} className="text-sm text-gray-500 hover:text-red-600 underline">
                Sign out of Shield
              </button>
            </div>

            {signOutConfirmOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-2xl shadow-lg max-w-sm w-full mx-4">
                  <h3 className="font-semibold mb-2">Sign out?</h3>
                  <p className="text-sm text-gray-600 mb-6">Are you sure you want to sign out of Shield?</p>
                  <div className="flex gap-3 justify-end">
                    <button type="button" onClick={() => setSignOutConfirmOpen(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                      Cancel
                    </button>
                    <button type="button" onClick={signOut} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'merchant' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Verified by AG Shield</h2>
                  <p className="text-sm text-gray-500">Get your business verified and display a trust badge to your customers.</p>
                </div>
                <a
                  href="/verify-business"
                  className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-1 shrink-0"
                >
                  Full Page <ArrowRight className="w-3 h-3" />
                </a>
              </div>
              <form onSubmit={handleMerchantVerify} className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 font-medium">Business Name</label>
                  <input
                    type="text"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    placeholder="Your registered business name"
                    required
                    className="w-full mt-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">CAC Registration Number</label>
                  <input
                    type="text"
                    value={merchantCAC}
                    onChange={(e) => setMerchantCAC(e.target.value.toUpperCase())}
                    placeholder="RC1234567"
                    required
                    className="w-full mt-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 font-medium">Primary Account Number</label>
                    <input
                      type="text"
                      value={merchantAccount}
                      onChange={(e) => setMerchantAccount(sanitizeAccountNumber(e.target.value))}
                      placeholder="10-digit account"
                      maxLength={10}
                      required
                      className="w-full mt-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 font-medium">Bank</label>
                    <select
                      value={merchantBank}
                      onChange={(e) => setMerchantBank(e.target.value)}
                      className="w-full mt-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
                  disabled={verifyingMerchant || !merchantName.trim() || !merchantCAC.trim() || merchantAccount.length !== ACCOUNT_NUMBER_LENGTH}
                >
                  {verifyingMerchant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  {verifyingMerchant ? 'Verifying...' : 'Verify Business'}
                </button>
              </form>

              {merchantResult && (
                <div className={`mt-6 p-4 rounded-xl ${merchantResult.verified ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-start gap-3">
                    {merchantResult.verified ? (
                      <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
                    ) : (
                      <AlertIcon className="w-6 h-6 text-red-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className={`font-semibold ${merchantResult.verified ? 'text-green-700' : 'text-red-700'}`}>
                        {merchantResult.verified ? 'Business Verified' : 'Verification Failed'}
                      </h3>
                      {merchantResult.verified && merchantResult.badge_url && (
                        <p className="text-xs text-gray-400 mt-1">
                          Badge URL: <a href={merchantResult.badge_url} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">{merchantResult.badge_url}</a>
                        </p>
                      )}
                      {merchantResult.verification_id && (
                        <p className="text-xs text-gray-400">ID: {merchantResult.verification_id}</p>
                      )}
                    </div>
                  </div>
                  {merchantResult.risk_level && (
                    <div className="mt-3 text-sm">
                      <span className="text-gray-600">Risk Level: </span>
                      <span className={`font-medium ${merchantResult.risk_level === 'safe' ? 'text-green-600' : merchantResult.risk_level === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}>
                        {merchantResult.risk_level}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-gradient-to-r from-green-600 to-emerald-700 p-6 rounded-2xl text-white">
              <h2 className="text-lg font-semibold mb-2">Why Get Verified?</h2>
              <ul className="space-y-2 text-sm opacity-90">
                <li>✓ Display a verified badge on invoices, Instagram, and WhatsApp</li>
                <li>✓ Customers can check your badge instantly at <span className="font-mono text-xs">/verify/&lt;code&gt;</span></li>
                <li>✓ Verified by AG Shield — part of Nigeria's growing trust network</li>
              </ul>
              <a href="/verify-business" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-yellow-300 hover:text-yellow-200">
                Learn more about business verification <ArrowRight className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-6">
            <div className="glass p-6 rounded-xl shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Upcoming Events & Workshops</h2>
              <p className="text-sm text-gray-600 mb-6">Join our fraud awareness sessions to learn how to protect yourself and your business from scams.</p>
              
              {eventsList.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No upcoming events. Check back soon!</p>
              ) : (
                <div className="space-y-4">
                  {eventsList.map((event) => (
                    <div key={event.id} className="border rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className={`text-xs px-2 py-1 rounded-full ${event.event_type === 'webinar' ? 'bg-blue-100 text-blue-700' : event.event_type === 'corporate' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                            {event.event_type}
                          </span>
                          <h3 className="font-semibold mt-2">{event.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                          <div className="flex gap-4 mt-2 text-sm text-gray-500">
                            <span>📅 {formatDate(event.event_date)}</span>
                            <span>📍 {event.location || 'Online'}</span>
                            {event.seats_available && <span>👥 {event.seats_available} seats</span>}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t">
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={subscribeEmail}
                            onChange={(e) => setSubscribeEmail(e.target.value)}
                            placeholder="Your email"
                            className="flex-1 border rounded-lg px-3 py-2 text-sm"
                          />
                          <input
                            type="text"
                            value={subscribeName}
                            onChange={(e) => setSubscribeName(e.target.value)}
                            placeholder="Your name"
                            className="w-32 border rounded-lg px-3 py-2 text-sm"
                          />
                          <button
                            onClick={() => handleEventSubscribe(event.id)}
                            disabled={subscribingToEvent === event.id || !subscribeEmail.trim()}
                            className="px-4 py-2 bg-brand-teal text-brand-deep rounded-lg text-sm font-medium hover:bg-teal-600 disabled:opacity-50"
                          >
                            {subscribingToEvent === event.id ? '...' : 'Register'}
                          </button>
                        </div>
                        {subscribeFeedback && <p className="text-sm mt-2 text-green-600">{subscribeFeedback}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-semibold mb-2">🎓 Free Webinars</h3>
                <p className="text-sm text-gray-600">Monthly online sessions on fraud prevention</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-semibold mb-2">🏢 Corporate Training</h3>
                <p className="text-sm text-gray-600">Customized fraud awareness for your team</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow">
                <h3 className="font-semibold mb-2">🤝 Community Outreach</h3>
                <p className="text-sm text-gray-600">Free sessions in markets and churches</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'community' && (
          <div className="space-y-6" data-tour="community-feed">
            <div className="bg-white p-6 rounded-2xl shadow">
              <h2 className="text-lg font-semibold mb-4">Community Statistics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{userCount}</p>
                  <p className="text-sm text-gray-600">Registered Users</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-500">{riskChartData.find(d => d.name === 'Dangerous')?.value || 0}</p>
                  <p className="text-sm text-gray-600">Scammers Flagged</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{riskChartData.find(d => d.name === 'Safe')?.value || 0}</p>
                  <p className="text-sm text-gray-600">Safe Checks</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-500">{liveFeed.length}</p>
                  <p className="text-sm text-gray-600">Reports Submitted</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h2 className="text-lg font-semibold mb-4">Safety Tips</h2>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  Search any account number <strong>before</strong> you send — it takes 10 seconds
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  If an account shows <strong>Warning</strong>, call the person on a known number to confirm
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  A business that won't wait for you to verify is a red flag itself
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  Report accounts immediately — your report protects the next person
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">✓</span>
                  Check the merchant directory before paying new suppliers
                </li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow">
              <h2 className="text-lg font-semibold mb-4">Recent Community Activity</h2>
              <div className="flex gap-4 mb-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> High Risk — confirmed flagged</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Warning — community reports</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Safe — no flags</span>
              </div>
              <div className="space-y-3">
                {(showAllActivity ? history : history.slice(0, 5)).length === 0 ? (
                  <p className="text-gray-500 text-sm">No recent activity. Start by checking an account!</p>
                ) : (
                  (showAllActivity ? history : history.slice(0, 5)).map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${item.risk === 'safe' ? 'bg-green-500' : item.risk === 'warning' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                        <div>
                          <span className="text-sm font-mono tracking-wider">{maskAccount(item.accountNumber)}</span>
                          <span className="text-xs text-gray-400 ml-2">· {item.bankName}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                          item.risk === 'safe' ? 'bg-green-100 text-green-700' : item.risk === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {item.risk === 'safe' ? 'Safe' : item.risk === 'warning' ? 'Warning' : 'High Risk'}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  ))
                )}
                {history.length > 5 && !showAllActivity && (
                  <button type="button" onClick={() => setShowAllActivity(true)} className="text-sm text-green-600 hover:underline">
                    View all activity →
                  </button>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-r from-green-500 to-green-600 p-6 rounded-2xl text-white">
              <h2 className="text-lg font-semibold mb-2">Download the Android App</h2>
              <p className="text-sm opacity-90 mb-4">Get real-time protection while banking. The app automatically detects suspicious account numbers.</p>
              <div className="flex gap-3">
                <button className="bg-white text-green-600 px-4 py-2 rounded-lg text-sm font-medium">
                  Install on Android
                </button>
                <button className="border border-white text-white px-4 py-2 rounded-lg text-sm">
                  Learn More
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && isAdminViewer && (
          <div className="space-y-6">
          <AdminStatsOverview />
          <UserManagement currentRole={profile?.role} />
          <div className="bg-white p-6 rounded-2xl shadow max-w-3xl">
            <h2 className="text-lg font-semibold mb-4">Pending Reports Review</h2>
            {pendingReports.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No pending reports to review.</p>
            ) : (
              <div className="space-y-4">
                {pendingReports.map((report) => (
                  <div key={report.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium font-mono tracking-wider">{report.account?.account_number ? maskAccount(report.account.account_number) : 'Unknown'}</p>
                        <p className="text-sm text-gray-600">{report.account?.bank_name}</p>
                        {report.account?.account_number && (
                          <p className="text-xs text-gray-400">{getSearchCount(`${report.account.account_number}|${report.account.bank_name || ''}`)} searches</p>
                        )}
                        <p className="text-sm text-gray-500">Category: {report.reason_category}</p>
                        {report.description && <p className="text-sm mt-2 text-gray-700">{report.description}</p>}
                        {report.evidence_url && isValidUrl(report.evidence_url) ? (
                          <a href={report.evidence_url} target="_blank" rel="noopener noreferrer" className="text-sm text-green-600 hover:underline mt-1 inline-block">
                            View Evidence
                          </a>
                        ) : report.evidence_url ? (
                          <span className="text-sm text-red-400 mt-1 inline-block">Invalid evidence URL</span>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveReport(report.id)}
                          disabled={processingReview}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleRejectReport(report.id)}
                          disabled={processingReview}
                          className="px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 text-sm"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <B2BTenantsKeys />
          <RunnerHeartbeat />
          </div>
        )}
      </div>

      {tourRunning && (
        <Joyride
          steps={TOUR_STEPS as Step[]}
          run={tourRunning}
          stepIndex={tourStep}
          onEvent={handleTourEvent}
          continuous
          options={{
            showProgress: true,
            hideOverlay: true,
            skipScroll: true,
            buttons: ['back', 'close', 'primary', 'skip'],
          }}
          locale={TOUR_LOCALE}
          styles={{
            tooltipContent: {
              textAlign: 'left',
            },
            buttonPrimary: {
              backgroundColor: '#0aaa96',
              color: '#080830',
              fontSize: '0.875rem',
              fontWeight: 600,
            },
            buttonBack: {
              color: '#6b7280',
              fontSize: '0.875rem',
            },
            buttonSkip: {
              color: '#9ca3af',
              fontSize: '0.875rem',
            },
          }}
        />
      )}

      <section className="print-sheet" aria-label="Search audit trail">
        <header className="print-head">
          <strong>Shield by AG Tech</strong>
          <span>Search Audit Trail</span>
        </header>
        <p className="print-meta">
          Account: {session.user.email ?? 'signed-in user'} · Generated{' '}
          {new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
        </p>
        {history.length === 0 ? (
          <p className="print-empty">No scans on record.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Bank</th>
                <th>Verdict</th>
                <th>Score</th>
                <th>Amount (NGN)</th>
                <th>When</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td className="font-mono">{maskAccount(item.accountNumber)}</td>
                  <td>{item.bankName || 'Auto-detected'}</td>
                  <td>{RISK_META[item.risk].label}</td>
                  <td>{typeof item.score === 'number' ? `${item.score}/100` : '—'}</td>
                  <td>{item.amount > 0 ? item.amount.toLocaleString() : '—'}</td>
                  <td>{new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{item.reasons?.length ? item.reasons.join('; ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="print-foot">Generated by Shield by AG Tech · The Truecaller for bank apps</p>
      </section>
    </div>
  )
}