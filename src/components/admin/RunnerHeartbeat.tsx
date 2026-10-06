import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Activity, Loader2 } from 'lucide-react'

interface HeartbeatRow {
  service: string
  last_run_at: string
  status: string | null
}

interface DisplayRow {
  service: string
  status: string
  ago: string
  stale: boolean
}

function timeAgo(iso: string, now: number): string {
  const diff = now - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

async function fetchRows(): Promise<DisplayRow[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('runner_heartbeat')
    .select('service, last_run_at, status')
    .order('last_run_at', { ascending: false })
  const now = Date.now()
  return ((data as HeartbeatRow[]) || []).map((row) => ({
    service: row.service,
    status: row.status ?? 'ok',
    ago: timeAgo(row.last_run_at, now),
    stale: now - new Date(row.last_run_at).getTime() > 72 * 3600 * 1000,
  }))
}

export default function RunnerHeartbeat() {
  const [rows, setRows] = useState<DisplayRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const next = await fetchRows()
      if (!cancelled) setRows(next)
    }
    void load()
    const timer = setInterval(() => void load(), 60000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return (
    <div className="bg-white p-6 rounded-2xl shadow max-w-3xl mt-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5 text-green-600" /> Runner Heartbeat
      </h2>
      {rows === null ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin h-4 w-4" /> Loading heartbeat…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-gray-500 text-sm">
          No heartbeat recorded yet. The cron runner writes one on every task cycle.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.service} className="flex items-center justify-between text-sm">
              <span className="font-mono text-xs text-gray-700">{row.service}</span>
              <span className="flex items-center gap-2">
                <span className={row.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                  {row.status}
                </span>
                <span className={row.stale ? 'text-amber-600' : 'text-gray-400'}>
                  {row.ago}
                  {row.stale ? ' (stale)' : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
