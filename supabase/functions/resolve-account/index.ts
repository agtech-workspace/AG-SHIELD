import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RESOLVE_PROVIDER = Deno.env.get('RESOLVE_PROVIDER') ?? 'auto' // 'auto' | 'nubapi' | 'paystack'
const CACHE_TTL_HOURS = parseInt(Deno.env.get('RESOLVE_CACHE_TTL_HOURS') ?? '24')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const NUBAPI_TOKEN = Deno.env.get('NUBAPI_TOKEN')
const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')

const PAYSTACK_BANK_CODES: Record<string, string> = {
  Access: '044',
  AccessBank: '044',
  GTBank: '058',
  Zenith: '057',
  UBA: '033',
  FirstBank: '011',
  Ecobank: '050',
  Stanbic: '221',
  Sterling: '232',
  Wema: '035',
  Fidelity: '070',
  FCMB: '214',
  Union: '032',
  Unity: '215',
  Keystone: '082',
  Polystar: '076',
  Jaiz: '301',
  Lotus: '303',
  TAJBank: '302',
  Suntrust: '100',
  Providus: '101',
  Parallex: '526',
  Neobank: '999',
  Moniepoint: '090405',
  Opay: '100004',
  PalmPay: '100033',
  Kuda: '090267',
}

function jsonBody(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

// Helper to normalize inputs
function normalizeAccountNumber(n: string | null | undefined): string | null {
  if (!n) return null
  const s = n.trim()
  const d = s.replace(/\D/g, '')
  if (d.length < 10) return null
  return d.slice(-10)
}

function normalizeBankCode(n: string | null | undefined): string | null {
  if (!n) return null
  const s = n.trim()
  if (s.length === 0) return null
  const d = s.replace(/\D/g, '')
  if (d.length > 0 && /^\d+$/.test(s)) {
    return d
  }
  return s
}