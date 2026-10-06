import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BarChart3, Building2, Key, Loader2, TrendingUp } from 'lucide-react'

interface UsageRow {
  tenant_id: string
  usage_month: string
  evaluations: number
  b2b_calls: number
}

interface Stats {
  tenants: number
  activeTenants: number
  keys: number
  monthEvaluations: number
  monthB2bCalls: number
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-semibold text-gray-800">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AdminStatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!supabase) return
      const [tenantsRes, keysRes, usageRes] = await Promise.all([
        supabase.from('tenants').select('status'),
        supabase.from('api_keys').select('id'),
        supabase.from('v_tenant_monthly_usage').select('usage_month, evaluations, b2b_calls'),
      ])
      if (cancelled) return
      if (tenantsRes.error || keysRes.error || usageRes.error) {
        setError(
          tenantsRes.error?.message ||
            keysRes.error?.message ||
            usageRes.error?.message ||
            'Failed to load admin stats'
        )
        return
      }
      const tenants = (tenantsRes.data as { status: string }[]) || []
      const usage = (usageRes.data as UsageRow[]) || []
      const currentMonth = new Date().toISOString().slice(0, 7)
      const month = usage.filter((u) => u.usage_month.slice(0, 7) === currentMonth)
      setError(null)
      setStats({
        tenants: tenants.length,
        activeTenants: tenants.filter((t) => t.status === 'active').length,
        keys: (keysRes.data as unknown[])?.length ?? 0,
        monthEvaluations: month.reduce((sum, u) => sum + u.evaluations, 0),
        monthB2bCalls: month.reduce((sum, u) => sum + u.b2b_calls, 0),
      })
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="bg-white p-6 rounded-2xl shadow">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-green-600" /> B2B Overview
      </h2>
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {stats === null && !error ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin h-4 w-4" /> Loading stats…
        </div>
      ) : (
        stats && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={<Building2 className="h-4 w-4 text-green-600" />}
              label="Tenants"
              value={stats.tenants.toLocaleString()}
              sub={`${stats.activeTenants.toLocaleString()} active`}
            />
            <StatCard
              icon={<Key className="h-4 w-4 text-green-600" />}
              label="API Keys"
              value={stats.keys.toLocaleString()}
            />
            <StatCard
              icon={<TrendingUp className="h-4 w-4 text-green-600" />}
              label="Evaluations this month"
              value={stats.monthEvaluations.toLocaleString()}
            />
            <StatCard
              icon={<Key className="h-4 w-4 text-green-600" />}
              label="B2B API calls this month"
              value={stats.monthB2bCalls.toLocaleString()}
            />
          </div>
        )
      )}
    </div>
  )
}