import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Global IP burst limiter (per instance)
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_PER_IP = 30
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

// Per-tenant token buckets: Map<tenantId, Map<prefix, {tokens, refill}>>
const bucketMap = new Map<string, Map<string, { tokens: number; updated: number }>>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX_PER_IP) return false
  entry.count++
  return true
}

// Simple token bucket: burst_limit tokens refilling 1 every 60s/burst_limit
function checkBucket(tenantId: string, prefix: string, burstLimit: number): boolean {
  const now = Date.now()
  let tenant = bucketMap.get(tenantId)
  if (!tenant) {
    tenant = new Map()
    bucketMap.set(tenantId, tenant)
  }
  let bucket = tenant.get(prefix)
  if (!bucket) {
    bucket = { tokens: burstLimit, updated: now }
    tenant.set(prefix, bucket)
  }
  const elapsed = now - bucket.updated
  const refillPerMs = burstLimit > 0 ? burstLimit / RATE_LIMIT_WINDOW_MS : 0
  bucket.tokens = Math.min(burstLimit, bucket.tokens + elapsed * refillPerMs)
  bucket.updated = now
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }
  return false
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  ...extra,
})

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-sandbox',
      },
    })
  }

  const start = Date.now()
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
      { status: 429, headers: jsonHeaders({ 'Retry-After': '60' }) }
    )
  }

  type RiskCheckBody = {
    account_number?: unknown
    bank_name?: unknown
    amount?: unknown
    is_new_recipient?: unknown
    holder_name?: unknown
  }

  let payload: RiskCheckBody | null
  try {
    payload = await req.json() as RiskCheckBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders() })
  }

  const account_number = typeof payload?.account_number === 'string' ? payload.account_number.trim() : ''
  const bank_name = typeof payload?.bank_name === 'string' ? payload.bank_name : ''
  const amount = typeof payload?.amount === 'number' ? payload.amount : 0
  const is_new_recipient = payload?.is_new_recipient !== false
  const holder_name = typeof payload?.holder_name === 'string' ? payload.holder_name.trim() : ''
  if (!account_number) {
    return new Response(
      JSON.stringify({ error: 'account_number is required', risk_level: 'safe' }),
      { status: 400, headers: jsonHeaders() }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ---- Gateway auth: B2B (X-API-Key) or B2C (session token) ----
  const apiKey = req.headers.get('x-api-key')
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const sandboxHeader = req.headers.get('x-sandbox')

  let channel: 'API_B2B' | 'NATIVE_B2C' = 'NATIVE_B2C'
  let tenantId: string | null = null
  let includeSandbox = true

  if (apiKey) {
    // B2B path — tenant auth key + quota enforcement
    const keyHash = await sha256(`sg_live.${apiKey}`)
    const { data: tenant, error: tenantErr } = await supabase.rpc('lookup_api_key', { p_key_hash: keyHash })
    if (tenantErr || !tenant || tenant.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid or revoked API key' }),
        { status: 401, headers: jsonHeaders() }
      )
    }
    const t = tenant[0]
    channel = 'API_B2B'
    tenantId = t.tenant_id
    includeSandbox = sandboxHeader === 'true'
    const burst = t.burst_limit ?? 100
    if (!checkBucket(tenantId, apiKey.slice(0, 8), burst)) {
      return new Response(
        JSON.stringify({ error: 'Tenant rate limit exceeded', retry_after_seconds: 60 }),
        { status: 429, headers: jsonHeaders({ 'Retry-After': '60' }) }
      )
    }
  } else if (token && token !== 'undefined') {
    // B2C path — verified user session
    const { data: user, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid session token' }),
        { status: 401, headers: jsonHeaders() }
      )
    }
    channel = 'NATIVE_B2C'
    includeSandbox = true
  }

  try {
    // Server-side holder resolution: if the client did not supply a name,
    // pull the last cached holder for this account so screening still runs
    // (and cannot be spoofed). Cache reads are Postgres-only, not upstream.
    let resolvedHolder = holder_name
    if (!resolvedHolder) {
      const { data: cachedHolder } = await supabase
        .from('bank_lookup_cache')
        .select('holder_name')
        .eq('account_number', account_number)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      resolvedHolder = cachedHolder?.holder_name ?? ''
    }

    const rpcParams: any = {
      p_account_number: account_number,
      p_bank_name: bank_name ?? '',
      p_amount: amount || 0,
      p_is_new_recipient: is_new_recipient ?? true,
      p_include_sandbox: includeSandbox,
      p_holder_name: resolvedHolder,
    }
    if (channel === 'API_B2B') {
      rpcParams.p_include_osint = false
    }
    const { data, error } = await supabase.rpc('assess_transfer_risk', rpcParams)
    if (error) throw error

    const execution_time_ms = Date.now() - start

    // Persistent verdict log -> metering + audit (Phase F measures FP/FN here)
    const result = data?.[0] ?? {
      risk_level: 'safe',
      risk_score: 0,
      confidence: 0.75,
      reasons: ['No risk data found for this account'],
      source_registry: [],
      primary_match_flags: [],
      recommended_action: 'ALLOW',
      social_proof: null,
    }

    await supabase.from('global_risk_evaluations').insert({
      channel,
      tenant_id: tenantId,
      queried_name: account_number,
      bank_name: bank_name ?? null,
      evaluated_score: result.risk_score ?? 0,
      verdict_level: result.risk_level,
      reasons: result.reasons ?? [],
      recommended_action: result.recommended_action ?? null,
      source_registry: result.source_registry ?? [],
      execution_time_ms,
    }).then(() => {}).catch(() => {})

    // B2B raw payload == B2C payload: one authoritative response
    return new Response(
      JSON.stringify({
        status: result.risk_level,
        risk_level: result.risk_level,
        risk_score: result.risk_score,
        confidence_interval: result.confidence,
        source_registry: result.source_registry,
        primary_match_flags: result.primary_match_flags,
        recommended_action: result.recommended_action,
        reasons: result.reasons,
        social_proof: result.social_proof,
        execution_time_ms,
      }),
      { status: 200, headers: jsonHeaders() }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message, risk_level: 'safe' }),
      { status: 500, headers: jsonHeaders() }
    )
  }
})