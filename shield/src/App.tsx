import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './lib/supabase'
import { getSession, onAuthStateChange, signOut as authSignOut } from './lib/auth'
import { LoginDialog } from './components/LoginDialog'
import {
  BANKS,
  sanitizeAccount,
  maskAccount,
  demoScan,
  liveToResult,
  type LiveAccount,
  type ScanResult,
} from './lib/risk'

const REPORT_CATEGORIES = [
  'Instagram Vendor Scam', 'Crypto P2P Fraud', 'Facebook Marketplace',
  'Job/Visa Phishing', 'POS Withdrawal Error', 'Fake Giveaway', 'Impersonation',
  'Social Media Report', 'Rental / Housing Scam', 'Fake Supplier / Invoice',
  'Romance Scam', 'Advance Fee Fraud', 'Business Email Compromise', 'Other',
]

const STATUS_META: Record<string, { label: string; cls: string }> = {
  approved: { label: 'Approved', cls: 'safe' },
  pending: { label: 'Pending', cls: 'review' },
  rejected: { label: 'Rejected', cls: 'block' },
}

const VERDICT_LABEL: Record<string, string> = { safe: 'Safe', review: 'Review', block: 'Block' }

interface HistoryItem {
  id: string
  at: string
  result: ScanResult
}

interface MyReport {
  id: string
  reason_category: string
  description: string | null
  status: string
  created_at: string
  account: { account_number: string; bank_name: string } | null
}

const ICONS = {
  shield: <><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" /><path d="M9 12l2 2 4-4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  printer: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  upload: <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>,
  trash: <><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" /><path d="M10 11v6M14 11v6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  mail: <><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" /><path d="M22 6l-10 7L2 6" /></>,
  link: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></>,
  file: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
}

function themeInit(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('shield-theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* ignore */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem('shield-history')
    const parsed = raw ? (JSON.parse(raw) as HistoryItem[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, 12) : []
  } catch {
    return []
  }
}

export function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(themeInit)
  const [history, setHistory] = useState<HistoryItem[]>(loadHistory)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [account, setAccount] = useState('')
  const [bank, setBank] = useState<string>(BANKS[0])

  const [showModal, setShowModal] = useState(false)
  const [waitlist, setWaitlist] = useState(false)
  const [wlName, setWlName] = useState('')
  const [wlEmail, setWlEmail] = useState('')
  const [wlRole, setWlRole] = useState('Student / Developer')
  const [wlDone, setWlDone] = useState(false)

  const [session, setSession] = useState<Session | null>(null)
  const [loginOpen, setLoginOpen] = useState(false)

  const [reports, setReports] = useState<MyReport[] | null>(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportType, setReportType] = useState(REPORT_CATEGORIES[0])
  const [reportOther, setReportOther] = useState('')
  const [reportAccount, setReportAccount] = useState('')
  const [reportBank, setReportBank] = useState<string>(BANKS[0])
  const [reportDesc, setReportDesc] = useState('')
  const [reportEvidenceType, setReportEvidenceType] = useState<'link' | 'image' | 'pdf'>('link')
  const [reportUrl, setReportUrl] = useState('')
  const [reportFile, setReportFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportBanner, setReportBanner] = useState<{ ok: boolean; text: string } | null>(null)
  const [reportSubmitted, setReportSubmitted] = useState(false)
  const [submittedAccount, setSubmittedAccount] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('shield-theme', theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem('shield-history', JSON.stringify(history.slice(0, 12)))
    } catch {
      /* ignore */
    }
  }, [history])

  useEffect(() => {
    let dismissed = false
    try {
      dismissed = localStorage.getItem('shield-techverse-dismissed') === '1'
    } catch {
      /* ignore */
    }
    if (dismissed) return
    const timer = window.setTimeout(() => {
      if (sessionStorage.getItem('shield-techverse-seen') === '1') return
      sessionStorage.setItem('shield-techverse-seen', '1')
      setShowModal(true)
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [])

  async function loadMyReports(userId: string) {
    if (!supabase) return
    setReportsLoading(true)
    const { data } = await supabase
      .from('reports')
      .select('id, reason_category, description, status, created_at, account:accounts(account_number, bank_name)')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
    setReports(data as MyReport[] | null)
    setReportsLoading(false)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChange((sess) => {
      setSession(sess)
      if (sess) void loadMyReports(sess.user.id)
      else setReports(null)
    })
    void getSession().then((sess) => {
      setSession(sess)
      if (sess) void loadMyReports(sess.user.id)
    })
    return () => { unsubscribe?.() }
  }, [])

  async function handleScan(event: FormEvent) {
    event.preventDefault()
    const clean = sanitizeAccount(account)
    if (clean.length !== 10) {
      setScanError('Enter a valid 10-digit NUBAN account number.')
      setResult(null)
      return
    }
    setScanError('')
    setScanning(true)
    try {
      let res = demoScan(clean, bank)
      if (supabase) {
        const { data, error } = await supabase
          .from('accounts')
          .select('account_number, bank_name, overall_risk_level, account_name, flagged_reason, total_reports, is_verified_business')
          .eq('account_number', clean)
          .eq('bank_name', bank)
          .limit(1)
        if (!error) {
          const row = (data as LiveAccount[] | null)?.[0]
          if (row) res = liveToResult(row, clean, bank)
        }
      }
      setResult(res)
      setHistory((h) => [
        { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), at: new Date().toISOString(), result: res },
        ...h,
      ].slice(0, 12))
    } finally {
      setScanning(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  async function handleSignOut() {
    await authSignOut()
    setSession(null)
    setReports(null)
  }

  async function handleReportSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase || !session) return
    setReportSubmitting(true)
    setReportBanner(null)
    try {
      const category = reportType === 'Other' ? (reportOther.trim() || 'Other') : reportType
      const desc = reportDesc.trim() || null
      const cleanAccount = sanitizeAccount(reportAccount)
      if (cleanAccount.length !== 10) {
        setReportBanner({ ok: false, text: 'Enter a valid 10-digit account number.' })
        return
      }
      let evidenceUrl: string | null = null
      if (reportEvidenceType === 'link') {
        evidenceUrl = reportUrl.trim() || null
      } else if (reportFile) {
        const ext = reportFile.name.split('.').pop() ?? (reportEvidenceType === 'pdf' ? 'pdf' : 'png')
        const fileName = `${Date.now()}_${cleanAccount}.${ext}`
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(fileName, reportFile, { cacheControl: '3600', upsert: false })
        if (uploadError) throw new Error(uploadError.message)
        const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(uploadData.path)
        evidenceUrl = publicUrl
      }
      const { error } = await supabase.rpc('submit_user_report', {
        p_account_number: cleanAccount,
        p_bank_name: reportBank,
        p_reason_category: category,
        p_description: desc,
        p_evidence_url: evidenceUrl,
      })
      if (error) throw new Error(error.message)
      setReportSubmitted(true)
      setSubmittedAccount(cleanAccount)
      resetReportForm()
      void loadMyReports(session.user.id)
    } catch (error) {
      setReportBanner({ ok: false, text: error instanceof Error ? error.message : 'Unable to submit report.' })
    } finally {
      setReportSubmitting(false)
    }
  }

  function resetReportForm() {
    setReportAccount('')
    setReportDesc('')
    setReportEvidenceType('link')
    setReportUrl('')
    setReportFile(null)
    setReportOther('')
    setReportType(REPORT_CATEGORIES[0])
    setReportBank(BANKS[0])
  }

  function handleWaitlist(event: FormEvent) {
    event.preventDefault()
    if (!wlName.trim() || !wlEmail.trim()) return
    try {
      const raw = localStorage.getItem('shield-techverse-regs')
      const regs: Array<{ name: string; email: string; role: string; at: string }> = raw ? JSON.parse(raw) : []
      regs.push({ name: wlName.trim(), email: wlEmail.trim(), role: wlRole, at: new Date().toISOString() })
      localStorage.setItem('shield-techverse-regs', JSON.stringify(regs))
    } catch {
      /* ignore */
    }
    setWlDone(true)
  }

  function dismissModalForever() {
    try {
      localStorage.setItem('shield-techverse-dismissed', '1')
    } catch {
      /* ignore */
    }
    setShowModal(false)
  }

  function onFilePick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setReportFile(file)
    event.target.value = ''
  }

  const configured = isConfigured()
  const descCount = reportDesc.length

  return (
    <>
      <div className="app-shell">
      <header className="topbar no-print">
        <div className="container topbar-inner">
          <div className="brand">
            <span className="brand-badge">{ICONS.shield}</span>
            <span>
              Shield
              <small>by AG Tech — the Truecaller for bank apps</small>
            </span>
          </div>
          <div className="top-actions">
            {session ? (
              <button type="button" className="icon-btn" onClick={() => void handleSignOut()} aria-label="Sign out">
                {ICONS.user}
                {session.user.email ?? 'Account'}
              </button>
            ) : (
              <button type="button" className="icon-btn" onClick={() => setLoginOpen(true)} aria-label="Sign in">
                {ICONS.user}
                Sign in
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? ICONS.moon : ICONS.sun}
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button type="button" className="icon-btn" onClick={handlePrint} aria-label="Print report">
              {ICONS.printer}
              Print
            </button>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Scan before you pay.</h1>
          <p>
            Enter any Nigerian bank account number to see its risk tier, community flags, and masked account
            name before you transfer. Powered by AG SHIELD.
          </p>
        </section>

        <section className="card">
          <h2>Instant Scanner</h2>
          <form onSubmit={handleScan} className="scan-fields">
            <div className="field">
              <label htmlFor="acc">Account Number</label>
              <input
                id="acc"
                className="mono"
                inputMode="numeric"
                placeholder="002 123 4567"
                value={account}
                onChange={(e) => setAccount(sanitizeAccount(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="bank">Bank</label>
              <select id="bank" value={bank} onChange={(e) => setBank(e.target.value)}>
                {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <button type="submit" className="btn" disabled={scanning}>
              {scanning ? <span className="spinner" /> : ICONS.search}
              {scanning ? 'Scanning…' : 'Scan'}
            </button>
          </form>

          {scanError && (
            <div className="banner err">
              {ICONS.alert}
              <span>{scanError}</span>
            </div>
          )}

          {result && (
            <div className="verdict fade-in" data-verdict={result.verdict}>
              <div className="verdict-head">
                <div className="verdict-title">
                  <span className={`dot ${result.verdict}`} />
                  {VERDICT_LABEL[result.verdict] ?? result.verdict}
                  <span className="pill">{result.tier}</span>
                </div>
                <span className="hist-when">
                  Score {result.score}/100
                </span>
              </div>
              <ul>
                {result.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <div className="scorebar"><i style={{ width: `${result.score}%`, background: result.verdict === 'safe' ? 'var(--safe-fg)' : result.verdict === 'review' ? 'var(--review-fg)' : 'var(--block-fg)' }} /></div>
              <div className="meta-line">
                <span className="mono">{maskAccount(result.account)}</span>
                <span>·</span>
                <span>{result.bank}</span>
                {result.maskedName && <>
                  <span>·</span>
                  <span>Name: {result.maskedName}</span>
                </>}
              </div>
            </div>
          )}

          <h2 style={{ marginTop: 26 }}>Scan history</h2>
          {history.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No scans yet — your recent lookups will appear here.</p>
          )}
          {history.map((item) => (
            <div className="history-row" key={item.id}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`dot ${item.result.verdict}`} />
                <span>
                  <span className="mono">{maskAccount(item.result.account)}</span> · {item.result.bank} ·{' '}
                  {VERDICT_LABEL[item.result.verdict]}
                </span>
              </div>
              <span className="hist-when">
                {ICONS.clock} {new Date(item.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          {history.length > 0 && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={handlePrint}>
              {ICONS.printer}
              Print Report
            </button>
          )}
        </section>

        <section id="reports" className="section-marker">
          <h2 style={{ margin: '34px 0 0' }}>Report a Scam</h2>
          <p style={{ color: 'var(--muted)', marginTop: 6 }}>
            Help protect the community — flag an account you suspect. {session ? `Signed in as ${session.user.email ?? 'you'}.` : 'Sign in to submit and track reports.'}
          </p>

          <div className="grid-main">
            <div className="card rp-steps">
              {!configured && (
                <div className="banner err">
                  {ICONS.alert}
                  <span>Live reporting needs the AG SHIELD backend — add VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see README).</span>
                </div>
              )}
              {configured && !session && (
                <div className="auth-panel">
                  <strong>Sign in to submit a report</strong>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '6px 0 12px' }}>
                    Use the same AG SHIELD account as the parent app — reports stay linked to you.
                  </p>
                  <button type="button" className="btn" onClick={() => setLoginOpen(true)}>
                    {ICONS.user} Sign in
                  </button>
                </div>
              )}

              {configured && session && !reportSubmitted && (
                <form onSubmit={handleReportSubmit}>
                  <div className="rp-step">
                    <span className="rp-num" />
                    <div style={{ flex: 1 }}>
                      <strong>Account</strong>
                      <div className="scan-fields" style={{ marginTop: 8 }}>
                        <div className="field">
                          <label htmlFor="rAcc">Account Number</label>
                          <input id="rAcc" className="mono" inputMode="numeric" placeholder="002 123 4567" value={reportAccount} onChange={(e) => setReportAccount(sanitizeAccount(e.target.value))} />
                        </div>
                        <div className="field">
                          <label htmlFor="rBank">Bank</label>
                          <select id="rBank" value={reportBank} onChange={(e) => setReportBank(e.target.value)}>
                            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rp-step">
                    <span className="rp-num" />
                    <div style={{ flex: 1 }}>
                      <strong>Scam category</strong>
                      <div className="chip-grid" style={{ marginTop: 8 }}>
                        {REPORT_CATEGORIES.map((c) => (
                          <button key={c} type="button" className={`chip ${reportType === c ? 'sel' : ''}`} onClick={() => setReportType(c)}>
                            {reportType === c && ICONS.check}
                            {c}
                          </button>
                        ))}
                      </div>
                      {reportType === 'Other' && (
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor="rOther">Describe the category</label>
                          <input id="rOther" value={reportOther} onChange={(e) => setReportOther(e.target.value)} maxLength={60} placeholder="e.g. WhatsApp clone scam" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rp-step">
                    <span className="rp-num" />
                    <div style={{ flex: 1 }}>
                      <strong>What happened</strong>
                      <div className="field" style={{ marginTop: 8 }}>
                        <textarea
                          rows={4}
                          maxLength={400}
                          value={reportDesc}
                          onChange={(e) => setReportDesc(e.target.value)}
                          placeholder="Describe the scam — how you were contacted, what was promised, etc."
                        />
                        <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: '0.78rem' }}>{descCount}/400</div>
                      </div>
                    </div>
                  </div>

                  <div className="rp-step">
                    <span className="rp-num" />
                    <div style={{ flex: 1 }}>
                      <strong>Evidence</strong>
                      <div className="seg" style={{ marginTop: 8 }}>
                        {(['link', 'image', 'pdf'] as const).map((kind) => (
                          <button key={kind} type="button" className={`chip ${reportEvidenceType === kind ? 'sel' : ''}`} onClick={() => setReportEvidenceType(kind)}>
                            {kind === 'link' ? ICONS.link : kind === 'image' ? ICONS.image : ICONS.file}
                            {kind === 'link' ? 'Link' : kind === 'image' ? 'Image' : 'PDF'}
                          </button>
                        ))}
                      </div>
                      {reportEvidenceType === 'link' && (
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor="rUrl">Proof URL</label>
                          <input id="rUrl" value={reportUrl} onChange={(e) => setReportUrl(e.target.value)} placeholder="https://…" />
                        </div>
                      )}
                      {(reportEvidenceType === 'image' || reportEvidenceType === 'pdf') && (
                        <>
                          {reportFile ? (
                            <button type="button" className="file-chip" onClick={() => setReportFile(null)}>
                              {reportFile.name}
                              <span style={{ fontSize: '1.1rem' }}>×</span>
                            </button>
                          ) : (
                            <label
                              className={`dropzone ${dragging ? 'drag' : ''}`}
                              htmlFor="rFile"
                              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                              onDragLeave={() => setDragging(false)}
                              onDrop={(e) => {
                                e.preventDefault()
                                setDragging(false)
                                const file = e.dataTransfer.files?.[0] ?? null
                                if (file) setReportFile(file)
                              }}
                            >
                              {ICONS.upload}
                              <div>Drop your {reportEvidenceType} here or tap to browse</div>
                            </label>
                          )}
                          <input id="rFile" type="file" hidden accept={reportEvidenceType === 'pdf' ? 'application/pdf' : 'image/*'} onChange={onFilePick} />
                        </>
                      )}
                    </div>
                  </div>

                  <button type="submit" className="btn btn-block" disabled={reportSubmitting}>
                    {reportSubmitting ? <span className="spinner" /> : ICONS.flag}
                    Submit report
                  </button>
                  {reportBanner && (
                    <div className={`banner ${reportBanner.ok ? 'ok' : 'err'}`}>
                      {reportBanner.ok ? ICONS.check : ICONS.alert}
                      <span>{reportBanner.text}</span>
                    </div>
                  )}
                </form>
              )}

              {configured && session && reportSubmitted && (
                <div className="fade-in">
                  <div className="banner ok">
                    {ICONS.check}
                    <span>Report submitted for {maskAccount(submittedAccount)}. A moderator will review it.</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                    <button type="button" className="btn" onClick={() => setReportSubmitted(false)}>Submit another</button>
                    <a href="#your-reports" className="btn btn-ghost" onClick={() => setReportSubmitted(false)} style={{ textDecoration: 'none' }}>View my reports</a>
                  </div>
                </div>
              )}
            </div>

            <div id="your-reports" className="section-marker">
              <div className="card">
                <h2>Your Reports</h2>
                {!configured && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Connect a backend to view your reports.</p>}
                {configured && !session && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sign in to see the account numbers you've reported.</p>}
                {configured && session && reportsLoading && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading…</p>}
                {configured && session && !reportsLoading && reports && reports.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No reports yet — protect the community by flagging one.</p>
                )}
                {configured && session && !reportsLoading && reports?.map((r) => {
                  const meta = STATUS_META[r.status] ?? { label: r.status, cls: 'review' }
                  return (
                    <div className="history-row" key={r.id}>
                      <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className={`dot ${meta.cls}`} />
                          <strong>{meta.label}</strong>
                          <span className="chip">{r.reason_category}</span>
                        </div>
                        <div className="hist-when" style={{ marginTop: 2 }}>
                          <span className="mono">{maskAccount(r.account?.account_number ?? '')}</span> · {r.account?.bank_name ?? '—'} ·{' '}
                          {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {configured && session && reports && (
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => void loadMyReports(session.user.id)}>Refresh</button>{' '}
                    <button type="button" className="btn btn-ghost" onClick={() => void handleSignOut()}>Sign out</button>
                  </div>
                )}
              </div>

              <div className="card" style={{ marginTop: 20 }}>
                <h2>How reports are used</h2>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.8 }}>
                  <li>Moderators review each report before it influences scan verdicts.</li>
                  <li>Approved reports raise the account's risk score and tier.</li>
                  <li>Warnings show for anyone who scans a flagged account.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        Shield by AG Tech · the Truecaller for bank apps · built on the AG SHIELD risk engine
      </footer>

      {showModal && (
        <div className="overlay no-print" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal fade-in">
            <button type="button" className="x icon-btn" aria-label="Close" onClick={() => setShowModal(false)}>{ICONS.x}</button>
            <span className="modal-badge">AG Tech Presents</span>
            <h2>TechVerse Connect 2027</h2>
            <p className="sub">Empower. Build. Replicate. Connecting campus talent to continent-scale tech infrastructure.</p>
            <p className="facts">📍 University of Lagos (UNILAG), Nigeria · 🗓️ 2-Day Biannual Residency</p>
            <ul className="tracks">
              <li>Cybersecurity &amp; Zero-Trust — protecting financial switches &amp; public APIs.</li>
              <li>AI Governance &amp; Ethical Code — local data pipelines in emerging markets.</li>
              <li>Product &amp; Venture Building — for the next 100 million users.</li>
            </ul>
            {!waitlist && (
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Keynotes &amp; panels with leaders from AWS, Paystack, Interswitch, the EU Delegation, and the Ministry of Communications.</p>
            )}
            {waitlist ? (
              <form onSubmit={handleWaitlist}>
                <div className="field">
                  <label htmlFor="wlName">Full Name</label>
                  <input id="wlName" required value={wlName} onChange={(e) => setWlName(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wlEmail">Email Address</label>
                  <input id="wlEmail" type="email" required value={wlEmail} onChange={(e) => setWlEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="wlRole">Role</label>
                  <select id="wlRole" value={wlRole} onChange={(e) => setWlRole(e.target.value)}>
                    <option>Student / Developer</option>
                    <option>Founder / Executive</option>
                    <option>Investor</option>
                    <option>Cybersecurity Analyst</option>
                  </select>
                </div>
                {!wlDone ? (
                  <div className="modal-actions">
                    <button type="submit" className="btn">{ICONS.mail} Join TechVerse 2027 Waitlist</button>
                  </div>
                ) : (
                  <div className="banner ok">{ICONS.check}<span>You're on the list. We'll email you closer to the date.</span></div>
                )}
              </form>
            ) : (
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setWaitlist(true)}>{ICONS.check} Join Waitlist / Learn More</button>
                <button type="button" className="ghost-link" onClick={() => setShowModal(false)}>Maybe Later</button>
                <button type="button" className="ghost-link" onClick={dismissModalForever}>Don't show again</button>
              </div>
            )}
          </div>
        </div>
      )}

      {loginOpen && (
        <LoginDialog session={session} onClose={() => setLoginOpen(false)} />
      )}
      </div>

      <section className="print-sheet" aria-label="Scan history audit trail">
        <header className="print-head">
          <strong>Shield by AG Tech</strong>
          <span>Scan History Audit Trail</span>
        </header>
        <p className="print-meta">Generated {new Date().toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}</p>
        {history.length === 0 ? (
          <p className="print-empty">No scans on record.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Bank</th>
                <th>Verdict</th>
                <th>Tier</th>
                <th>Score</th>
                <th>When</th>
                <th>Reasons</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{maskAccount(item.result.account)}</td>
                  <td>{item.result.bank}</td>
                  <td>{VERDICT_LABEL[item.result.verdict] ?? item.result.verdict}</td>
                  <td>{item.result.tier}</td>
                  <td>{item.result.score}/100</td>
                  <td>{new Date(item.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{item.result.reasons.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="print-foot">Generated by Shield by AG Tech · the Truecaller for bank apps</p>
      </section>
    </>
  )
}