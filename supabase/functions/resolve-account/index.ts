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

// Strip everything except digits, then require a 10-digit NUBAN.
function normalizeAccountNumber(n: string | null | undefined): string | null {
  if (!n) return null
  const digits = n.trim().replace(/\D/g, '')
  if (digits.length < 10) return null
  const nub = digits.slice(-10)
  return nub.length === 10 ? nub : null
}

// Digits pass through unchanged (leading zeros stripped); names fall back to a
// trimmed string so the DB-side normalize_bank_code() can map aliases.
function normalizeBankCode(n: string | null | undefined): string | null {
  if (!n) return null
  const s = n.trim()
  if (s.length === 0) return null
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, '')
  return s
}

async function readCache(accountNumber: string, bankCode: string) {
  const { data } = await supabase
    .from('bank_lookup_cache')
    .select('holder_name, ok, checked_at')
    .eq('account_number', accountNumber)
    .eq('bank_code', bankCode || '')
  return data?.[0] ?? null
}

async function writeCache(
  accountNumber: string,
  bankCode: string,
  holderName: string | null,
  provider: string,
  ok: boolean,
  lastError?: string | null,
) {
  const { error } = await supabase.rpc('upsert_bank_lookup_cache', {
    p_account_number: accountNumber,
    p_bank_code: bankCode,
    p_holder_name: holderName,
    p_provider: provider,
    p_ok: ok,
    p_last_error: lastError ?? null,
  })
  if (error) console.error('cache write failed', error)
}

async function resolveWithNubapi(accountNumber: string, bankCode: string): Promise<string | null> {
  if (!NUBAPI_TOKEN || !bankCode) return null
  try {
    const url = `https://nubapi.com/api/verify?account_number=${accountNumber}&bank_code=${bankCode}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${NUBAPI_TOKEN}` } })
    if (!res.ok) return null
    const payload = await res.json()
    return payload.account_name.trim() || null
  } catch {
    return null
  }
}

async function resolveWithPaystack(
  accountNumber: string,
  bankCode: string | null,
  bankName: string | null,
): Promise<string | null> {
  if (!PAYSTACK_SECRET_KEY) return null
  try {
    const resolvedCode = bankCode || (bankName ? PAYSTACK_BANK_CODES[bankName] ?? null : null)
    if (!resolvedCode) return null
    const url =
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${resolvedCode}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    })
    if (!res.ok) return null
    const payload = await res.json()
    if (!payload?.status) return null
    return payload.data.account_name.trim() || null
  } catch {
    // provider unreachable — fall through
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const payload = await req.json()
    const account_number = normalizeAccountNumber(payload?.account_number as string | undefined)
    if (!account_number) {
      return jsonBody({ error: 'account_number must be a 10-digit NUBAN', account_name: null }, 400)
    }

    const bank_code = normalizeBankCode(payload?.bank_code as string | undefined)
    const bank_name = typeof payload?.bank_name === 'string' ? payload.bank_name : null

    // Cache-first: a fresh entry avoids the upstream (rate-limited) leg entirely.
    const cached = await readCache(account_number, bank_code ?? '')
    if (cached?.ok && cached.holder_name) {
      const ageHours = (Date.now() - new Date(cached.checked_at).getTime()) / 3_600_000
      if (ageHours <= CACHE_TTL_HOURS) {
        return jsonBody({
          account_name: cached.holder_name,
          provider: 'cache',
          fallback_used: false,
        })
      }
    }

    // Provider list based on RESOLVE_PROVIDER: 'auto' tries both, in order.
    const providers: string[] =
      RESOLVE_PROVIDER === 'auto'
        ? ['nubapi', 'paystack']
        : RESOLVE_PROVIDER === 'nubapi'
        ? ['nubapi']
        : ['paystack']

    let name: string | null = null
    let activeProvider: string | null = null

    for (const provider of providers) {
      const resolved =
        provider === 'nubapi'
          ? await resolveWithNubapi(account_number, bank_code ?? '')
          : await resolveWithPaystack(account_number, bank_code, bank_name)
      if (resolved) {
        name = resolved
        activeProvider = provider
        break
      }
    }

    await writeCache(account_number, bank_code ?? '', name, activeProvider ?? 'none', name !== null)

    return jsonBody({
      account_name: name,
      provider: activeProvider,
      fallback_used: providers.length > 1 && activeProvider !== null && activeProvider !== providers[0],
    })
  } catch (err) {
    return jsonBody({ error: (err as Error).message, account_name: null }, 500)
  }
})