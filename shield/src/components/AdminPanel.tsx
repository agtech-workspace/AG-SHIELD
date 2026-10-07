import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ICONS } from '../lib/icons'
import { maskAccount } from '../lib/risk'

type DayCount = { day: string; count: number }

type ShieldStats = {
  logins_total: number
  logins_today: number
  logins_week: DayCount[]
  searches_total: number
  searches_today: number
  searches_week: DayCount[]
  searches_by_verdict: Record<string, number>
  reports_total: number
  reports_today: number
  reports_pending: number
  reports_approved: number
  reports_rejected: number
  reports_week: DayCount[]
  users_total: number
}

type InboxAccount = { account_number: string; bank_name: string }

type InboxReport = {
  id: string
  reason_category: string
  description: string | null
  status: string
  evidence_url: string | null
  created_at: string
  reporter_id: string | null
  account: InboxAccount | InboxAccount[] | null
}

type Filter = 'all' | 'pending' | 'approved' | 'rejected'

const VERDICT_LABEL: Record<string, string> = { safe: 'Safe', review: 'Review', block: 'Block' }
const FILTERS: Filter[] = ['all', 'pending', 'approved', 'rejected']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function last7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10))
}

function toMap(rows: DayCount[] | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) out[r.day] = r.count
  return out
}

function acctLabel(r: InboxReport): string {
  const a = Array.isArray(r.account) ? r.account[0] : r.account
  return a ? `${maskAccount(a.account_number)} · ${a.bank_name}` : 'Account unavailable'
}

export function AdminPanel() {
  const [stats, setStats] = useState<ShieldStats | null>(null)
  const [reports, setReports] = useState<InboxReport[]>([])
  const [reporters, setReporters] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadAll = useCallback(
    async (quiet = false) => {
      if (!supabase) {
        setError('Supabase backend not configured.')
        setLoading(false)
        return
      }
      if (!quiet) setLoading(true)

      let inboxQuery = supabase
        .from('reports')
        .select(
          'id, reason_category, description, status, evidence_url, created_at, reporter_id, account:accounts(account_number, bank_name)',
        )
        .order('created_at', { ascending: false })
        .limit(50)
      if (filter !== 'all') inboxQuery = inboxQuery.eq('status', filter)

      const [statsRes, reportsRes] = await Promise.all([supabase.rpc('shield_admin_stats'), inboxQuery])

      if (statsRes.error) setError(statsRes.error.message)
      else {
        setStats(statsRes.data as ShieldStats)
        setError('')
      }
      if (reportsRes.error) setError(reportsRes.error.message)
      else setReports((reportsRes.data ?? []) as InboxReport[])

      const ids = [...new Set(((reportsRes.data ?? []) as InboxReport[]).map((r) => r.reporter_id).filter(Boolean))] as string[]
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, email, nickname').in('id', ids)
        const map: Record<string, string> = {}
        for (const p of (profs ?? []) as { id: string; email: string | null; nickname: string | null }[]) {
          map[p.id] = p.email || p.nickname || 'Unknown user'
        }
        setReporters(map)
      }

      setLoading(false)
    },
    [filter],
  )

  useEffect(() => {
    const t = window.setTimeout(() => { void loadAll() }, 0)
    return () => window.clearTimeout(t)
  }, [loadAll])

  async function decide(id: string, kind: 'approve' | 'reject') {
    if (!supabase) return
    setBusyId(id)
    const { error: rpcError } = await supabase.rpc(kind === 'approve' ? 'approve_report' : 'reject_report', {
      p_report_id: id,
    })
    setBusyId(null)
    if (rpcError) setError(rpcError.message)
    else await loadAll(true)
  }

  const days = last7Days()
  const searchMap = toMap(stats?.searches_week)
  const loginMap = toMap(stats?.logins_week)
  const max = Math.max(1, ...days.map((d) => Math.max(searchMap[d] ?? 0, loginMap[d] ?? 0)))
  const verdicts = Object.entries(stats?.searches_by_verdict ?? {})

  if (loading && !stats) {
    return (
      <section className="hero">
        <div className="spinner" aria-label="Loading admin stats" />
      </section>
    )
  }

  return (
    <>
      <section className="hero adm-head">
        <div>
          <h1>Admin Console</h1>
          <p>
            Platform activity and community report moderation for AG SHIELD. Daily counts are in UTC and start from
            today.
          </p>
        </div>
        <div className="adm-tools">
          {error && (
            <span className="banner err" role="alert">
              {ICONS.alert}
              <span>{error}</span>
            </span>
          )}
          <button type="button" className="btn" onClick={() => void loadAll()} disabled={loading}>
            {ICONS.clock}
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      <div className="adm-stats">
        <div className="adm-stat">
          <div className="k">Logins</div>
          <div className="v">{stats?.logins_total ?? 0}</div>
          <div className="s">{stats?.logins_today ?? 0} today</div>
        </div>
        <div className="adm-stat">
          <div className="k">Searches</div>
          <div className="v teal">{stats?.searches_total ?? 0}</div>
          <div className="s">{stats?.searches_today ?? 0} today</div>
        </div>
        <div className="adm-stat">
          <div className="k">Reports</div>
          <div className="v">{stats?.reports_total ?? 0}</div>
          <div className="s">{stats?.reports_pending ?? 0} pending · {stats?.reports_today ?? 0} today</div>
        </div>
        <div className="adm-stat">
          <div className="k">Registered users</div>
          <div className="v">{stats?.users_total ?? 0}</div>
          <div className="s">Profiles on the platform</div>
        </div>
      </div>

      <div className="adm-cols">
        <div className="card">
          <h2>Last 7 days</h2>
          <div className="adm-bars">
            {days.map((d) => {
              const s = searchMap[d] ?? 0
              const l = loginMap[d] ?? 0
              return (
                <div className="adm-bar" key={d}>
                  <b>{s + l > 0 ? s + l : ''}</b>
                  <div className="adm-bar-pair">
                    <i style={{ height: `${(s / max) * 100}%` }} title={`${s} searches`} />
                    <i className="l" style={{ height: `${(l / max) * 100}%` }} title={`${l} logins`} />
                  </div>
                  <span>{WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                </div>
              )
            })}
          </div>
          <div className="adm-legend">
            <span>
              <i className="s" /> Searches
            </span>
            <span>
              <i className="l" /> Logins
            </span>
          </div>
        </div>

        <div className="card">
          <h2>Verdict split</h2>
          <p className="sub" style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>
            Outcome of all recorded scans.
          </p>
          {verdicts.length === 0 ? (
            <p className="adm-empty">No scans recorded yet.</p>
          ) : (
            <div className="adm-verdicts">
              {verdicts.map(([v, c]) => (
                <span className="adm-vchip" key={v}>
                  <span className="dot" style={{ background: v === 'safe' ? 'var(--safe-fg)' : v === 'review' ? 'var(--review-fg)' : 'var(--block-fg)' }} />
                  {VERDICT_LABEL[v] ?? v} · {c}
                </span>
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 22 }}>Report outcomes</h2>
          <div className="adm-split">
            <span className="adm-badge pending">Pending {stats?.reports_pending ?? 0}</span>
            <span className="adm-badge approved">Approved {stats?.reports_approved ?? 0}</span>
            <span className="adm-badge rejected">Rejected {stats?.reports_rejected ?? 0}</span>
          </div>
        </div>
      </div>

      <section className="card adm-inbox">
        <div className="adm-inbox-head">
          <h2>Reports inbox</h2>
          <div className="chip-grid">
            {FILTERS.map((f) => (
              <button key={f} type="button" className={`chip ${filter === f ? 'sel' : ''}`} onClick={() => setFilter(f)}>
                {filter === f && ICONS.check}
                {f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {reports.length === 0 ? (
          <p className="adm-empty">{loading ? 'Loading…' : 'No reports in this view.'}</p>
        ) : (
          reports.map((r) => {
            const who = r.reporter_id ? (reporters[r.reporter_id] ?? '…') : 'Signed-out user'
            const acct = acctLabel(r)
            return (
              <article className="adm-row" key={r.id}>
                <div className="adm-row-top">
                  <h4>
                    {ICONS.flag}
                    {r.reason_category}
                  </h4>
                  <span className={`adm-badge ${r.status}`}>{r.status}</span>
                </div>
                <p className="sub">
                  {acct} · from {who}
                </p>
                {r.description && <p className="desc">{r.description}</p>}
                <div className="foot">
                  <span className="adm-when">
                    {new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <div className="adm-actions">
                    {r.evidence_url && (
                      <a className="ghost-link" href={r.evidence_url} target="_blank" rel="noreferrer">
                        {ICONS.link} Evidence
                      </a>
                    )}
                    {r.status !== 'approved' && (
                      <button
                        type="button"
                        className="btn approve"
                        disabled={busyId === r.id}
                        onClick={() => void decide(r.id, 'approve')}
                      >
                        {ICONS.check} Approve
                      </button>
                    )}
                    {r.status !== 'rejected' && (
                      <button
                        type="button"
                        className="btn reject"
                        disabled={busyId === r.id}
                        onClick={() => void decide(r.id, 'reject')}
                      >
                        {ICONS.x} Reject
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </section>
    </>
  )
}
