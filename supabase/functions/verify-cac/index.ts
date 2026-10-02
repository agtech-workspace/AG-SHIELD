// verify-cac — Nigerian Corporate Affairs Commission verification.
// Provider-agnostic: Prembly by default, Dojah as fallback.
// Two modes:
//   { mode: "number", company_number: "1234567", company_type: "RC" }  -> single company lookup
//   { mode: "search", company_name: "Deolu Ventures" }                 -> name search (match list)
// Responses are normalized to { rc_number, company_name, company_type, status,
// registered_at, office_address }.
// Env (set in Edge Function secrets):
//   CAC_PROVIDER   = prembly (default) | dojah
//   PREMBLY_API_URL / DOJAH_API_URL     (optional overrides)
//   PREMBLY_API_TOKEN / DOJAH_APP_ID + DOJAH_API_SECRET
//   CAC_SANDBOX = true  -> run against canned sandbox data (no token needed)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const PROVIDER = Deno.env.get('CAC_PROVIDER') ?? 'prembly'
const PREMBLY_URL = (Deno.env.get('PREMBLY_API_URL') ?? 'https://api.prembly.com').replace(/\/+$/, '')
const DOJAH_URL = (Deno.env.get('DOJAH_API_URL') ?? 'https://api.dojah.io').replace(/\/+$/, '')
const PREMBLY_TOKEN = Deno.env.get('PREMBLY_API_TOKEN')
const DOJAH_APP_ID = Deno.env.get('DOJAH_APP_ID')
const DOJAH_SECRET = Deno.env.get('DOJAH_API_SECRET')
const SANDBOX = Deno.env.get('CAC_SANDBOX') === 'true'

const COMPANY_TYPES = ['BN', 'RC', 'IT', 'LP', 'LLP'] as const

type CompanyType = typeof COMPANY_TYPES[number]

interface CACResult {
  rc_number: string
  company_name: string
  company_type: CompanyType
  status: string
  registered_at?: string | null
  office_address?: string | null
}

const jsonHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
}

const ok = (body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { ...jsonHeaders, ...extra } })

const bad = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), { status, headers: jsonHeaders })

// ---------------------------------------------------------------------------
// Sandbox canned data (used with CAC_SANDBOX=true or when no token configured)
// ---------------------------------------------------------------------------
function sandboxLookup(mode: string, companyNumber: string, companyType: string, companyName: string): CACResult[] {
  const seed: CACResult[] = [
    { rc_number: '1234567', company_name: 'Deolu Adeyemi Ventures Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2019-04-12', office_address: 'Lagos Island, Lagos' },
    { rc_number: '7654321', company_name: 'Deolu Adeyemi Ventures Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2019-04-12', office_address: 'Lagos Island, Lagos' },
    { rc_number: '9021045', company_name: 'Obada Global Concepts', company_type: 'BN', status: 'ACTIVE', registered_at: '2021-11-03', office_address: 'Ikeja, Lagos' },
    { rc_number: '3418876', company_name: 'WestBridge Integrated Services Ltd', company_type: 'RC', status: 'DISSOLVED', registered_at: '2008-01-22', office_address: 'Victoria Island, Lagos' },
    { rc_number: '5112230', company_name: 'BrightPath Foods Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2016-05-30', office_address: 'Surulere, Lagos' },
    { rc_number: '6110092', company_name: 'Titan Gate Logistics', company_type: 'BN', status: 'ACTIVE', registered_at: '2020-02-14', office_address: 'Port Harcourt, Rivers' },
  ]
  if (mode === 'number') {
    return seed.filter((c) => c.rc_number === companyNumber && (companyType === 'ALL' || c.company_type === companyType))
  }
  const q = companyName.toLowerCase()
  return seed.filter((c) => c.company_name.toLowerCase().includes(q))
}

// ---------------------------------------------------------------------------
// Prembly
// Lookup: https://docs.prembly.com/docs/advance-cac
// ---------------------------------------------------------------------------
async function premblyLookup(mode: string, companyNumber: string, companyType: string): Promise<CACResult[]> {
  const headers = { 'X-API-Key': PREMBLY_TOKEN!, 'Accept': 'application/json' }

  if (mode === 'number') {
    const res = await fetch(`${PREMBLY_URL}/verification/cac/advance`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rc_number: companyNumber, company_type: companyType }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) throw new Error(`Prembly returned ${res.status}`)
    const data = await res.json() as { data?: unknown[] }
    const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data as unknown[] : []
    return rawList.map((entryRaw) => {
      const entry = entryRaw as Record<string, unknown>
      return {
        rc_number: String(entry.rc_number ?? entry.registration_number ?? companyNumber),
        company_name: String(entry.company_name ?? entry.companyName ?? ''),
        company_type: (entry.company_type ?? companyType ?? 'RC') as CompanyType,
        status: String(entry.status ?? entry.registration_status ?? 'UNKNOWN').toUpperCase(),
        registered_at: entry.date_of_registration ?? entry.registered_at ?? null,
        office_address: entry.office_address ?? entry.address ?? null,
      }
    })
  }

  // Search: return empty for Prembly (no documented name-search endpoint);
  // the gateway falls back to Dojah for name search.
  return []
}

// ---------------------------------------------------------------------------
// Dojah
// Lookup: POST /api/v1/kyc/cac/verify  -> Search: POST /api/v1/kyc/cac/name_ava
// ---------------------------------------------------------------------------
async function dojahLookup(mode: string, companyNumber: string, companyType: string, companyName: string): Promise<CACResult[]> {
  const headers = {
    'Authorization': DOJAH_SECRET!,
    'AppId': DOJAH_APP_ID!,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  if (mode === 'number') {
    const res = await fetch(`${DOJAH_URL}/api/v1/kyc/cac/verify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rc_number: companyNumber, company_type: companyType }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) throw new Error(`Dojah returned ${res.status}`)
    const data = await res.json() as { entity?: Record<string, unknown> }
    const entity = data?.entity ?? {}
    return [{
      rc_number: String(entity.registration_number ?? entity.rc_number ?? companyNumber),
      company_name: String(entity.company_name ?? ''),
      company_type: (companyType ?? 'RC') as CompanyType,
      status: String(entity.status ?? 'UNKNOWN').toUpperCase(),
      registered_at: entity.date_of_registration ?? null,
      office_address: entity.address ?? entity.office_address ?? null,
    }]
  }

  const res = await fetch(`${DOJAH_URL}/api/v1/kyc/cac/name_ava`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ search: companyName, no_of_results: 8 }),
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Dojah returned ${res.status}`)
  const data = await res.json() as { entity?: unknown[] }
  const list = Array.isArray(data?.entity) ? data.entity : []
  return list.map((entryRaw) => {
    const entry = entryRaw as Record<string, unknown>
    return {
      rc_number: String(entry.rc_number ?? entry.registration_number ?? ''),
      company_name: String(entry.company_name ?? ''),
      company_type: (entry.company_type ?? 'RC') as CompanyType,
      status: String(entry.status ?? 'UNKNOWN').toUpperCase(),
      registered_at: entry.date_of_registration ?? null,
      office_address: entry.address ?? null,
    }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sandbox',
      },
    })
  }

  let payload: {
    mode?: string
    company_type?: string
    company_number?: string
    company_name?: string
  } | null
  try {
    payload = await req.json() as typeof payload
  } catch {
    return bad('Invalid JSON body')
  }

  const mode = payload?.mode === 'search' ? 'search' : 'number'
  const companyType = String(payload?.company_type ?? 'RC').toUpperCase()
  if (!COMPANY_TYPES.includes(companyType as CompanyType) && companyType !== 'ALL') {
    return bad(`company_type must be one of ${COMPANY_TYPES.join(', ')}`)
  }

  const companyNumber = String(payload?.company_number ?? '').trim()
  const companyName = String(payload?.company_name ?? '').trim()

  if (mode === 'number' && companyNumber.length < 6) {
    return bad('company_number is required (e.g. 1234567 for RC1234567)')
  }
  if (mode === 'search' && companyName.length < 3) {
    return bad('company_name must be at least 3 characters')
  }

  const useSandbox = SANDBOX || (PROVIDER === 'prembly' && !PREMBLY_TOKEN) || (PROVIDER === 'dojah' && (!DOJAH_SECRET || !DOJAH_APP_ID))

  try {
    let results: CACResult[] = []
    if (useSandbox) {
      results = sandboxLookup(mode, companyNumber, companyType, companyName)
    } else if (PROVIDER === 'dojah') {
      results = await dojahLookup(mode, companyNumber, companyType, companyName)
    } else {
      results = await premblyLookup(mode, companyNumber, companyType)
      // Prembly has no name-search; fall back to Dojah for search mode.
      if (mode === 'search' && results.length === 0 && DOJAH_SECRET && DOJAH_APP_ID) {
        results = await dojahLookup('search', '', 'RC', companyName)
      }
    }

    const clean = results.filter((r) => r.company_name.trim().length > 0)
    return ok({
      provider: PROVIDER,
      mode,
      sandbox: useSandbox,
      count: clean.length,
      status: clean.length > 0 ? 'found' : 'not_found',
      results: clean,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `CAC verification failed: ${error.message}` }),
      { status: 502, headers: jsonHeaders }
    )
  }
})