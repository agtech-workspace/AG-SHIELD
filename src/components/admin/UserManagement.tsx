import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { AlertCircle, CheckCircle, Loader2, RefreshCw, Users } from 'lucide-react'

interface UserRow {
  id: string
  nickname?: string | null
  email?: string | null
  full_name?: string | null
  is_admin: boolean
  role?: string | null
  created_at: string
}

const PAGE_SIZE = 10

const ROLE_OPTIONS = [
  { value: 'root_admin', label: 'Root Admin', badge: 'bg-purple-100 text-purple-700' },
  { value: 'moderator', label: 'Moderator', badge: 'bg-blue-100 text-blue-700' },
  { value: 'support', label: 'Support', badge: 'bg-amber-100 text-amber-700' },
  { value: 'user', label: 'User', badge: 'bg-gray-100 text-gray-600' },
]

function roleStyle(role?: string | null) {
  return (
    ROLE_OPTIONS.find((r) => r.value === role) ?? {
      value: 'unknown',
      label: role || 'Unknown',
      badge: 'bg-gray-100 text-gray-600',
    }
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

export default function UserManagement({ currentRole }: { currentRole?: string }) {
  const privileged = currentRole === 'root_admin' || currentRole === 'moderator'
  const canGrantRoot = currentRole === 'root_admin'

  const [users, setUsers] = useState<UserRow[]>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    if (!supabase) return null
    const { data: sessionData } = await supabase.auth.getSession()
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, nickname, email, full_name, is_admin, role, created_at')
      .order('created_at')
    return {
      selfId: sessionData?.session?.user.id ?? null,
      rows: (data as UserRow[]) || [],
      error: err?.message ?? null,
    }
  }, [])

  useEffect(() => {
    if (!privileged) return
    let active = true
    void (async () => {
      const result = await load()
      if (!active || !result) return
      setError(result.error)
      setSelfId(result.selfId)
      setUsers(result.rows)
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [privileged, load])

  const refresh = useCallback(() => {
    setLoading(true)
    void (async () => {
      const result = await load()
      if (!result) return
      setError(result.error)
      setSelfId(result.selfId)
      setUsers(result.rows)
      setLoading(false)
    })()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageUsers = users.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  const changeRole = async (user: UserRow, role: string) => {
    if (role === (user.role ?? null)) return
    if (!supabase) return
    setBusyId(user.id)
    setError(null)
    setNotice(null)
    const { error: err } = await supabase.rpc('admin_set_user_role', {
      p_user_id: user.id,
      p_role: role,
    })
    setBusyId(null)
    if (err) {
      setError(err.message)
      return
    }
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id ? { ...u, role, is_admin: role !== 'user' && role !== 'support' } : u
      )
    )
    setNotice(`Role for ${user.nickname || user.email || 'user'} updated to ${role}`)
  }

  if (!privileged) return null

  return (
    <div className="bg-white p-6 rounded-2xl shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-green-600" /> User Management
        </h2>
        <button
          onClick={() => void refresh()}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
          <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> {notice}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <Loader2 className="animate-spin h-4 w-4" /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <p className="text-gray-500 text-center py-6">No users found.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b">
                <th className="py-1">Name</th>
                <th className="py-1">Email</th>
                <th className="py-1">Role</th>
                <th className="py-1">Joined</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map((user) => {
                const style = roleStyle(user.role)
                const isSelf = user.id === selfId
                const label = user.nickname || user.full_name || '—'
                return (
                  <tr key={user.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{label}</td>
                    <td className="py-2 text-xs text-gray-500">{user.email || '—'}</td>
                    <td className="py-2">
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium mr-2 ${style.badge}`}>
                        {style.label}
                      </span>
                      {isSelf ? (
                        <span className="text-xs text-gray-400">(you)</span>
                      ) : (
                        <select
                          value={user.role ?? ''}
                          onChange={(e) => void changeRole(user, e.target.value)}
                          disabled={busyId !== null}
                          className="text-xs border rounded px-1.5 py-1 text-gray-700 bg-white disabled:opacity-50"
                        >
                          {ROLE_OPTIONS.filter((r) => r.value !== 'root_admin' || canGrantRoot).map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="py-2 text-xs text-gray-500">{formatDate(user.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
            <span>
              Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, users.length)} of{' '}
              {users.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}