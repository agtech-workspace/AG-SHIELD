import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AlertCircle, Check, Copy, Key, Loader2, Plus, RefreshCw, X } from 'lucide-react'

interface Tenant {
  id: string
  name: string
  contact_email: string | null
  monthly_quota: number | null
  status: string
  created_at: string
}

interface ApiKey {
  id: string
  tenant_id: string
  key_prefix: string
  name: string | null
  scopes: string[] | null
  status: string
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  calls_this_month?: number
}

interface UsageRow {
  tenant_id: string
  usage_month: string
  evaluations: number
  b2b_calls: number
}

const SCOPE_OPTIONS = ['verify:read', 'verify:write'] as const

export default function B2BTenantsKeys() {
  const client = () => {
    if (!supabase) throw new Error('Supabase is not configured.')
    return supabase
  }

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newTenantName, setNewTenantName] = useState('')
  const [newTenantEmail, setNewTenantEmail] = useState('')
  const [newTenantQuota, setNewTenantQuota] = useState('100000')

  const [issueForTenant, setIssueForTenant] = useState<string | null>(null)
  const [issueName, setIssueName] = useState('Default key')
  const [issueScopes, setIssueScopes] = useState<string[]>(['verify:read'])
  const [issueExpiry, setIssueExpiry] = useState('')

  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!supabase) return { error: null, tenants: [] as Tenant[], keys: [] as ApiKey[], usage: [] as UsageRow[] }
    const [t, k, u] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at'),
      supabase
        .from('api_keys')
        .select(
          'id, tenant_id, key_prefix, name, scopes, status, expires_at, revoked_at, created_at, calls_this_month'
        )
        .order('created_at'),
      supabase.from('v_tenant_monthly_usage').select('*'),
    ])
    if (t.error || k.error || u.error) {
      return {
        error: t.error?.message || k.error?.message || u.error?.message || 'Failed to load B2B data',
        tenants: [] as Tenant[],
        keys: [] as ApiKey[],
        usage: [] as UsageRow[],
      }
    }
    return {
      error: null,
      tenants: (t.data as Tenant[]) || [],
      keys: (k.data as ApiKey[]) || [],
      usage: (u.data as UsageRow[]) || [],
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      const result = await fetchAll()
      if (!active) return
      setError(result.error)
      setTenants(result.tenants)
      setKeys(result.keys)
      setUsage(result.usage)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [fetchAll])

  const load = useCallback(async () => {
    const result = await fetchAll()
    setError(result.error)
    setTenants(result.tenants)
    setKeys(result.keys)
    setUsage(result.usage)
    setLoading(false)
  }, [fetchAll])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      if (!supabase) throw new Error('Supabase is not configured.')
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
    } finally {
      setBusy(false)
    }
  }

  const createTenant = () =>
    run(async () => {
      if (!newTenantName.trim()) {
        setError('Tenant name is required')
        return
      }
      const { error: rpcErr } = await client().rpc('admin_create_tenant', {
        p_name: newTenantName.trim(),
        p_contact_email: newTenantEmail.trim() || null,
        p_monthly_quota: Number(newTenantQuota) || 100000,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      setNewTenantName('')
      setNewTenantEmail('')
      setNewTenantQuota('100000')
      await load()
    })

  const issueKey = (tenantId: string) =>
    run(async () => {
      const { data, error: rpcErr } = await client().rpc('admin_issue_api_key', {
        p_tenant_id: tenantId,
        p_name: issueName.trim() || 'Default key',
        p_scopes: issueScopes.length ? issueScopes : ['verify:read'],
        p_expires_at: issueExpiry ? new Date(issueExpiry).toISOString() : null,
        p_burst_limit: 100,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      const row = Array.isArray(data) ? data[0] : data
      setIssueForTenant(null)
      setIssueName('Default key')
      setIssueScopes(['verify:read'])
      setIssueExpiry('')
      setFreshKey(row?.raw_key ?? null)
      setCopied(false)
      await load()
    })

  const revokeKey = (keyId: string) =>
    run(async () => {
      const { error: rpcErr } = await client().rpc('admin_revoke_api_key', { p_key_id: keyId })
      if (rpcErr) throw new Error(rpcErr.message)
      await load()
    })

  const rotateKey = (keyId: string) =>
    run(async () => {
      const { data, error: rpcErr } = await client().rpc('admin_rotate_api_key', {
        p_key_id: keyId,
        p_expires_at: null,
      })
      if (rpcErr) throw new Error(rpcErr.message)
      const row = Array.isArray(data) ? data[0] : data
      setFreshKey(row?.raw_key ?? null)
      setCopied(false)
      await load()
    })

  const copyFreshKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(`sg_live.${freshKey}`)
      setCopied(true)
    } catch {
      setError('Clipboard unavailable - copy the key manually')
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7)
  const usageFor = (tenantId: string) =>
    usage.find((u) => u.tenant_id === tenantId && u.usage_month.slice(0, 7) === currentMonth)

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="animate-spin h-4 w-4" /> Loading B2B tenants and keys…
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Key className="h-5 w-5 text-green-600" /> B2B Tenants &amp; API Keys
        </h2>
        <button
          onClick={() => void load()}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {freshKey && (
        <div className="border border-green-300 bg-green-50 rounded-lg p-4">
          <p className="text-sm font-medium text-green-800 mb-2">
            New API key created - copy it now, it will not be shown again:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono break-all bg-white border rounded px-2 py-2">
              sg_live.{freshKey}
            </code>
            <button
              onClick={() => void copyFreshKey()}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setFreshKey(null)}
              className="p-2 text-gray-500 hover:text-gray-700"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">New Tenant</h3>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col text-xs text-gray-500">
            Tenant name
            <input
              value={newTenantName}
              onChange={(e) => setNewTenantName(e.target.value)}
              placeholder="Acme Bank"
              className="mt-1 border rounded px-2 py-1.5 text-sm text-gray-800 w-44"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Contact email
            <input
              value={newTenantEmail}
              onChange={(e) => setNewTenantEmail(e.target.value)}
              placeholder="ops@acme.com"
              className="mt-1 border rounded px-2 py-1.5 text-sm text-gray-800 w-48"
            />
          </label>
          <label className="flex flex-col text-xs text-gray-500">
            Monthly quota
            <input
              value={newTenantQuota}
              onChange={(e) => setNewTenantQuota(e.target.value)}
              inputMode="numeric"
              className="mt-1 border rounded px-2 py-1.5 text-sm text-gray-800 w-28"
            />
          </label>
          <button
            onClick={() => void createTenant()}
            disabled={busy}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Tenant
          </button>
        </div>
      </div>

      {tenants.length === 0 ? (
        <p className="text-gray-500 text-center py-6">No tenants yet. Create one above.</p>
      ) : (
        <div className="space-y-4">
          {tenants.map((tenant) => {
            const tenantKeys = keys.filter((k) => k.tenant_id === tenant.id)
            const monthUsage = usageFor(tenant.id)
            return (
              <div key={tenant.id} className="border rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="text-xs text-gray-500">
                      {tenant.contact_email || 'No contact email'} · quota{' '}
                      {tenant.monthly_quota?.toLocaleString() ?? '—'} calls/mo ·{' '}
                      <span
                        className={
                          tenant.status === 'active' ? 'text-green-600' : 'text-amber-600'
                        }
                      >
                        {tenant.status}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      This month: {(monthUsage?.evaluations ?? 0).toLocaleString()} evaluations
                      {monthUsage ? ` · ${monthUsage.b2b_calls.toLocaleString()} B2B calls` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setIssueForTenant(issueForTenant === tenant.id ? null : tenant.id)}
                    disabled={busy}
                    className="px-3 py-1 border border-green-300 text-green-700 text-sm rounded hover:bg-green-50 disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" /> Issue Key
                  </button>
                </div>

                {issueForTenant === tenant.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    <div className="flex flex-wrap gap-3 items-end">
                      <label className="flex flex-col text-xs text-gray-500">
                        Key name
                        <input
                          value={issueName}
                          onChange={(e) => setIssueName(e.target.value)}
                          className="mt-1 border rounded px-2 py-1.5 text-sm text-gray-800 w-40"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-gray-500">
                        Expires (optional)
                        <input
                          type="date"
                          value={issueExpiry}
                          onChange={(e) => setIssueExpiry(e.target.value)}
                          className="mt-1 border rounded px-2 py-1.5 text-sm text-gray-800"
                        />
                      </label>
                      <div className="flex flex-col text-xs text-gray-500">
                        Scopes
                        <div className="mt-1 flex gap-3">
                          {SCOPE_OPTIONS.map((scope) => (
                            <label key={scope} className="flex items-center gap-1 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={issueScopes.includes(scope)}
                                onChange={(e) =>
                                  setIssueScopes((prev) =>
                                    e.target.checked
                                      ? [...prev, scope]
                                      : prev.filter((s) => s !== scope)
                                  )
                                }
                              />
                              {scope}
                            </label>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => void issueKey(tenant.id)}
                        disabled={busy}
                        className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Key'}
                      </button>
                    </div>
                  </div>
                )}

                {tenantKeys.length === 0 ? (
                  <p className="text-sm text-gray-400 mt-3">No API keys for this tenant yet.</p>
                ) : (
                  <table className="w-full text-sm mt-3">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 border-b">
                        <th className="py-1">Name</th>
                        <th className="py-1">Prefix</th>
                        <th className="py-1">Scopes</th>
                        <th className="py-1">Used / Quota</th>
                        <th className="py-1">Status</th>
                        <th className="py-1 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenantKeys.map((key) => {
                        const expired = !!key.expires_at && new Date(key.expires_at) < new Date()
                        const revoked = key.status === 'revoked' || !!key.revoked_at
                        return (
                          <tr key={key.id} className="border-b last:border-0">
                            <td className="py-1.5">{key.name || '—'}</td>
                            <td className="py-1.5 font-mono text-xs">{key.key_prefix}…</td>
                            <td className="py-1.5 text-xs">{(key.scopes || []).join(', ') || '—'}</td>
                            <td className="py-1.5 text-xs">
                              {(key.calls_this_month ?? 0).toLocaleString()} /{' '}
                              {tenant.monthly_quota?.toLocaleString() ?? '∞'}
                            </td>
                            <td className="py-1.5">
                              <span
                                className={
                                  revoked
                                    ? 'text-red-600'
                                    : expired
                                      ? 'text-amber-600'
                                      : 'text-green-600'
                                }
                              >
                                {revoked ? 'revoked' : expired ? 'expired' : key.status}
                              </span>
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              {!revoked && (
                                <>
                                  <button
                                    onClick={() => void rotateKey(key.id)}
                                    disabled={busy}
                                    className="text-xs text-blue-600 hover:underline mr-3 disabled:opacity-50"
                                  >
                                    Rotate
                                  </button>
                                  <button
                                    onClick={() => void revokeKey(key.id)}
                                    disabled={busy}
                                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                                  >
                                    Revoke
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
