import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isDemoMode } from '../lib/demoAuth'
import { sandboxCacLookup, demoVerifyMerchant, type CACMatch, type MerchantResult } from '../lib/cacSandbox'
import { getMockAccount } from '../lib/mockData'
import { ACCOUNT_NUMBER_LENGTH, BANKS, BANK_CODES } from '../lib/constants'
import { Award, Building2, CheckCircle, Loader2, Shield, AlertCircle, X, Search, Clock } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'

function companyTypeFrom(cacNumber: string): string {
  const match = cacNumber.match(/^([A-Za-z]+)/)
  const prefix = (match?.[1] ?? '').toUpperCase()
  return ['BN', 'RC', 'IT', 'LP', 'LLP'].includes(prefix) ? prefix : 'RC'
}

export default function VerifyBusinessPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [cac, setCac] = useState('')
  const [account, setAccount] = useState('')
  const [bank, setBank] = useState<string>(BANKS[0])
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState<MerchantResult | null>(null)
  const [error, setError] = useState('')

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<CACMatch[]>([])
  const [searchError, setSearchError] = useState('')

  function sanitizeAccount(value: string) {
    return value.replace(/\D/g, '').slice(0, ACCOUNT_NUMBER_LENGTH)
  }

  async function callVerifac(mode: 'number' | 'search', body: Record<string, unknown>) {
    if (isDemoMode()) {
      const companyNumber = String(body.company_number ?? '').trim()
      const companyType = String(body.company_type ?? 'RC').toUpperCase()
      const companyName = String(body.company_name ?? '').trim()
      return sandboxCacLookup(mode, companyNumber, companyType, companyName)
    }
    const edgeUrl = import.meta.env.VITE_VERIFY_CAC_EDGE_URL
    if (!edgeUrl) throw new Error('verify-cac edge URL is not configured')
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, ...body }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => null)
      throw new Error(err?.error ?? `verify-cac returned ${response.status}`)
    }
    const data = await response.json()
    if (data.sandbox) console.info('verify-cac running in sandbox mode')
    return data as { results: CACMatch[]; status: string; count: number }
  }

  async function resolveAccountName(accountNumber: string, bankName: string): Promise<string> {
    if (isDemoMode()) return getMockAccount(accountNumber, bankName)?.accountName?.trim() ?? ''
    const edgeUrl = import.meta.env.VITE_RESOLVE_EDGE_URL
    if (!edgeUrl) return ''
    try {
      const response = await fetch(edgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_number: accountNumber, bank_code: BANK_CODES[bankName] ?? '', bank_name: bankName }),
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return ''
      const payload = await response.json() as { account_name?: string | null }
      return payload.account_name?.trim() ?? ''
    } catch {
      return ''
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (searchQuery.trim().length < 3) return
    setSearching(true)
    setSearchError('')
    setSearchResults([])
    try {
      const data = await callVerifac('search', { company_name: searchQuery.trim() })
      setSearchResults(data.results ?? [])
      if (data.count === 0) setSearchError('No CAC registrations found for that name.')
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  function handlePick(match: CACMatch) {
    setName(match.company_name)
    setCac(`${match.company_type}${match.rc_number}`)
    setSearchOpen(false)
    setSearchResults([])
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault()
    if (!name.trim() || !cac.trim() || account.length !== ACCOUNT_NUMBER_LENGTH) return
    setVerifying(true)
    setError('')
    setResult(null)
    try {
      // 1. CAC registry check (number lookup)
      const cacData = await callVerifac('number', {
        company_number: cac.replace(/\D/g, ''),
        company_type: companyTypeFrom(cac),
      })
      const official = cacData.results?.[0]
      const cacStatus = official?.status ?? 'NOT_FOUND'
      const officialName = official?.company_name ?? ''

      // 2. Bank account name resolution
      const resolvedName = await resolveAccountName(account, bank)

      if (isDemoMode()) {
        // 3. Local mirror of verify_merchant (migration 20260918000003)
        setResult(demoVerifyMerchant({
          business_name: name.trim(),
          primary_account: account,
          bank_name: bank,
          cac_number: cac.trim(),
          cac_status: cacStatus,
          official_cac_name: officialName,
          account_name: resolvedName,
        }))
        return
      }

      if (!supabase) throw new Error('Supabase is not configured.')

      // 3. Persist via the authoritative verify_merchant RPC
      const { data, error: rpcError } = await supabase.rpc('verify_merchant', {
        p_business_name: name.trim(),
        p_primary_account: account,
        p_bank_name: bank,
        p_cac_number: cac.trim(),
        p_cac_status: cacStatus,
        p_official_cac_name: officialName || null,
        p_account_name: resolvedName || null,
        p_account_name_match: resolvedName.length > 0,
        p_payment_reference: null,
      })
      if (rpcError) throw rpcError
      const row = data?.[0] as MerchantResult | undefined
      if (!row) throw new Error('No response from verification service.')
      setResult(row)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" data-tour="verify-business">
      <nav className="h-16 bg-white border-b flex items-center justify-between px-6 sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/')} className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-green-600" />
            <span className="text-xl font-semibold text-green-600">Shield</span>
          </button>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">by AG Tech</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button type="button" onClick={() => navigate('/dashboard')} className="text-sm text-gray-600 hover:text-green-600">Dashboard</button>
          <button type="button" onClick={() => navigate('/login')} className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">Sign In</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Left — B2B messaging */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-green-600" />
              <span className="text-sm font-semibold uppercase tracking-wider text-green-600">For Businesses</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Get Verified. <span className="text-green-600">Build Trust.</span>
            </h1>
            <p className="text-gray-600 text-lg mb-6">
              AG Shield verifies your business against CAC records and fraud databases. Once verified, display your badge anywhere — on invoices, Instagram, WhatsApp, or your website — so customers know you're legitimate before they pay.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">Verified Badge</p>
                  <p className="text-sm text-gray-500">Display the "Verified by AG Shield" badge on your storefront, social media, or invoices.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">Public Verification Page</p>
                  <p className="text-sm text-gray-500">Every verified business gets a public page at <span className="font-mono text-xs">shield.agtech.ng/verify/&lt;code&gt;</span> that anyone can check.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">CAC-verified Identity</p>
                  <p className="text-sm text-gray-500">We confirm your registration against the Corporate Affairs Commission registry before issuing a badge.</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">Coming Soon — API Access</p>
              <p className="text-amber-700">Fintechs and platforms can integrate AG Shield's verification API directly. <span className="font-medium">Business verification is the first step.</span></p>
            </div>
          </div>

          {/* Right — Verification form */}
          <div>
            <div className="bg-white rounded-2xl shadow-sm border p-6">
              <div className="flex items-center gap-2 mb-6">
                <Award className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-semibold">Verify Your Business</h2>
                {isDemoMode() && (
                  <span className="text-[10px] font-medium uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full ml-auto">Demo sandbox</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSearchOpen((o) => !o)}
                className="w-full mb-4 border border-dashed border-green-400 text-green-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-green-50 flex items-center justify-center gap-2"
              >
                <Search className="w-4 h-4" />
                {searchOpen ? "Hide CAC name search" : "Don't know your CAC number? Search by business name"}
              </button>

              {searchOpen && (
                <form onSubmit={handleSearch} className="mb-5 p-4 bg-gray-50 rounded-xl border">
                  <label className="text-sm text-gray-600 font-medium">Search CAC registry by business name</label>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="e.g. Deolu Ventures"
                      className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={searching || searchQuery.trim().length < 3}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </button>
                  </div>
                  {searchError && <p className="text-xs text-red-600 mt-2">{searchError}</p>}
                  {searchResults.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {searchResults.map((m) => (
                        <li key={m.rc_number}>
                          <button
                            type="button"
                            onClick={() => handlePick(m)}
                            className="w-full text-left p-3 bg-white rounded-lg border hover:border-green-400 text-sm"
                          >
                            <span className="font-semibold text-gray-800 block">{m.company_name}</span>
                            <span className="text-xs text-gray-500">{m.company_type}{m.rc_number} · {m.status}</span>
                            {m.registered_at && <span className="text-xs text-gray-400 ml-1">· registered {m.registered_at}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </form>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="text-sm text-gray-600 font-medium">Business Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your registered business name"
                    required
                    className="w-full mt-1 border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 font-medium">CAC Registration Number</label>
                  <input
                    type="text"
                    value={cac}
                    onChange={(e) => setCac(e.target.value.toUpperCase())}
                    placeholder="RC1234567"
                    required
                    className="w-full mt-1 border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 font-medium">Account Number</label>
                    <input
                      type="text"
                      value={account}
                      onChange={(e) => setAccount(sanitizeAccount(e.target.value))}
                      placeholder="10-digit account"
                      maxLength={10}
                      required
                      className="w-full mt-1 border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 font-medium">Bank</label>
                    <select
                      value={bank}
                      onChange={(e) => setBank(e.target.value)}
                      className="w-full mt-1 border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                    >
                      {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
                  disabled={verifying || !name.trim() || !cac.trim() || account.length !== ACCOUNT_NUMBER_LENGTH}
                >
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                  {verifying ? 'Checking CAC & identity...' : 'Verify Business — ₦8,000/year'}
                </button>
              </form>

              {error && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start gap-2 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {result && (
                <div className={`mt-6 p-4 rounded-xl ${result.verification_state === 'pending' ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="flex items-start gap-3">
                    {result.verification_state === 'pending' ? (
                      <Clock className="w-6 h-6 text-amber-600 shrink-0" />
                    ) : (
                      <X className="w-6 h-6 text-red-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <h3 className={`font-semibold ${result.verification_state === 'pending' ? 'text-amber-700' : 'text-red-700'}`}>
                        {result.verification_state === 'pending' ? 'Identity Confirmed — Payment Pending' : 'Verification Rejected'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {result.reason ?? (result.verification_state === 'pending'
                          ? 'Complete payment to activate your verified badge.'
                          : 'Please correct the details and try again.')}
                      </p>
                      {result.badge_url && result.verification_state === 'pending' && (
                        <div className="mt-3 p-3 bg-white rounded-lg border border-amber-100">
                          <p className="text-xs text-gray-500 mb-1">Your verification page (activates after payment):</p>
                          <code className="text-sm text-amber-700 font-mono break-all">{result.badge_url}</code>
                        </div>
                      )}
                      {result.risk_level && (
                        <p className="text-xs mt-2 text-gray-500">
                          Risk Level: <span className={`font-medium ${result.risk_level === 'safe' ? 'text-green-600' : result.risk_level === 'warning' ? 'text-yellow-600' : 'text-red-600'}`}>{result.risk_level}</span>
                        </p>
                      )}
                      {result.verification_id && (
                        <p className="text-xs text-gray-400 mt-1 font-mono">ID: {result.verification_id}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-400 mt-4 text-center">
                By verifying, you agree to our <a href="/terms" className="underline">Terms of Service</a>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing section */}
      <section className="bg-white border-t py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-center mb-12">Choose Your Plan</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="border rounded-2xl p-6 hover:shadow-lg transition">
              <h3 className="font-bold text-lg mb-1">Verified Badge</h3>
              <p className="text-3xl font-bold text-green-600 mb-4">₦8,000<span className="text-sm font-normal text-gray-400">/year</span></p>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Verified badge</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Public verification page</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> CAC + fraud database check</li>
              </ul>
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
                Get Verified
              </button>
            </div>

            <div className="border-2 border-green-500 rounded-2xl p-6 hover:shadow-lg transition relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs px-3 py-0.5 rounded-full font-medium">Popular</span>
              <h3 className="font-bold text-lg mb-1">Payment Protection</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">₦12,000<span className="text-sm font-normal text-gray-400">/month</span></p>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Everything in Badge</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Unlimited verifications</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Audit trail & export</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Team seats</li>
              </ul>
              <button type="button" className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 text-sm font-medium">
                Coming Soon
              </button>
            </div>

            <div className="border rounded-2xl p-6 hover:shadow-lg transition">
              <h3 className="font-bold text-lg mb-1">API Access</h3>
              <p className="text-3xl font-bold text-gray-900 mb-4">₦15<span className="text-sm font-normal text-gray-400">/call</span></p>
              <ul className="space-y-2 text-sm text-gray-600 mb-6">
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Account name resolution</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Blacklist + risk scoring</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Fraud intelligence feed</li>
                <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-600" /> Volume discounts</li>
              </ul>
              <button type="button" className="w-full bg-gray-900 text-white py-2 rounded-lg hover:bg-gray-800 text-sm font-medium">
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}