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

// Allow only explicitly configured browser Origins; no browser API keys by default.
// Server-to-server clients do not send Origin and are unaffected by CORS.
const allowedOrigins = new Set(
  (Deno.env.get('AG_SHIELD_ALLOWED_ORIGINS') ?? '')
    .split(',').map(value => value.trim()).filter(Boolean)
)

serve(async (req) => {
  const origin = req.headers.get('origin')
  const originAllowed = origin !== null && allowedOrigins.has(origin)
  const corsHeaders: Record<string, string> = {
    'Vary': 'Origin',
    ...(originAllowed ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
  const jsonHeaders = (extra: Record<string, string> = {}) => ({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, private',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders,
    ...extra,
  })

  // Reject disallowed Origin even when a non-browser HTTP client sends it.
  if (origin && !originAllowed) {
    return new Response(JSON.stringify({ error: 'Origin not permitted' }),
      { status: 403, headers: jsonHeaders() })
  }
  if (req.method === 'OPTIONS') {
    if (!originAllowed) return new Response(null, { status: 403, headers: jsonHeaders() })
    return new Response(null, {
      status: 204,
      headers: jsonHeaders({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
        'Access-Control-Max-Age': '600',
      }),
    })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: jsonHeaders({ 'Allow': 'POST, OPTIONS' }) })
  }

  const start = Date.now()
  // Forwarded-IP headers are spoofable unless the ingress strips/replaces them.
  // Only enable this defense-in-depth limiter behind a verified trusted proxy.
  const trustedProxy = Deno.env.get('AG_SHIELD_TRUST_PROXY_IP_HEADERS') === 'true'
  const clientIp = trustedProxy
    ? (req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim())
    : null

  if (clientIp && !checkRateLimit(clientIp)) {
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

  // Cap request bytes even when Content-Length is missing or dishonest.
  const MAX_JSON_BYTES = 8192
  let payload: RiskCheckBody | null
  const declaredLength = req.headers.get('content-length')
  if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > MAX_JSON_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), { status: 413, headers: jsonHeaders() })
  }
  try {
    if (!req.body) throw new Error('No request body')
    const reader = req.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_JSON_BYTES) {
          void reader.cancel().catch(() => {})
          return new Response(JSON.stringify({ error: 'Request body too large' }), { status: 413, headers: jsonHeaders() })
        }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const bodyBytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bodyBytes.set(chunk, offset); offset += chunk.length }
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes)) as RiskCheckBody
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: jsonHeaders() })
  }

if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  return new Response(
    JSON.stringify({ error: 'Invalid risk-check request' }),
    { status: 400, headers: jsonHeaders() }
  )
}

const account_number =
  typeof payload?.account_number === 'string'
    ? payload.account_number.trim()
    : ''

const bank_name =
  typeof payload?.bank_name === 'string'
    ? payload.bank_name.trim()
    : ''

const amount = payload?.amount === undefined ? 0 : payload.amount
const is_new_recipient =
  payload?.is_new_recipient === undefined
    ? true
    : payload.is_new_recipient

const holder_name =
  typeof payload?.holder_name === 'string'
    ? payload.holder_name.trim()
    : ''

const invalid =
  !/^\d{10}$/.test(account_number) ||
  !bank_name ||
  bank_name.length > 100 ||
  (payload?.bank_name !== undefined &&
    typeof payload.bank_name !== 'string') ||
  typeof amount !== 'number' ||
  !Number.isFinite(amount) ||
  amount < 0 ||
  typeof is_new_recipient !== 'boolean' ||
  (payload?.holder_name !== undefined &&
    (typeof payload.holder_name !== 'string' ||
      holder_name.length > 150))

if (invalid) {
  return new Response(
    JSON.stringify({ error: 'Invalid risk-check request' }),
    { status: 400, headers: jsonHeaders() }
  )
}




  const supabase = createClient(supabaseUrl, supabaseKey)


  // ---- Gateway auth: B2B (X-API-Key) or B2C (session token) ----
  const apiKey = req.headers.get('x-api-key')
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  let tenantId: string | null = null
  let includeSandbox: boolean

  if (apiKey) {
    if (apiKey.length > 512 || /[\s,]/.test(apiKey)) {
      return new Response(JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: jsonHeaders() })
    }
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
    tenantId = t.tenant_id
    if (typeof tenantId !== 'string' || tenantId.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key tenant configuration' }),
        { status: 503, headers: jsonHeaders() }
      )
    }
    includeSandbox = false

    // Scope enforcement (Feature 3): verify:read is the default B2B scope
    const scopes: string[] = Array.isArray(t.scopes) ? t.scopes : []
    if (!scopes.includes('verify:read')) {
      return new Response(
        JSON.stringify({ error: 'API key missing required scope: verify:read' }),
        { status: 403, headers: jsonHeaders() }
      )
    }

    const burst = t.burst_limit ?? 100
    if (!Number.isSafeInteger(burst) || burst < 1 || burst > 10000) {
      return new Response(JSON.stringify({ error: 'Invalid tenant rate limit configuration' }),
        { status: 503, headers: jsonHeaders() })
    }
    // Full hash prevents collisions between unrelated keys with a shared prefix.
    if (!checkBucket(tenantId, keyHash, burst)) {
      return new Response(
        JSON.stringify({ error: 'Tenant rate limit exceeded', retry_after_seconds: 60 }),
        { status: 429, headers: jsonHeaders({ 'Retry-After': '60' }) }
      )
    }

    // Postgres-only metering + monthly quota cutoff (Feature 3, shadow billing)
    const { data: usageData, error: usageErr } = await supabase.rpc('bump_api_key_usage', {
      p_key_hash: keyHash,
    })
    if (usageErr) {
      return new Response(
        JSON.stringify({ error: 'Usage metering unavailable' }),
        { status: 503, headers: jsonHeaders() }
      )
    }
    const usage = Array.isArray(usageData) ? usageData[0] : usageData
    if (!usage || usage.p_allowed !== true) {
      return new Response(
        JSON.stringify({
          error: 'Monthly quota reached. Contact support to increase your limit.',
          calls_used: usage?.p_calls_used ?? null,
          monthly_quota: usage?.p_quota ?? null,
        }),
        { status: 429, headers: jsonHeaders() }
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
    includeSandbox = true
  } else {
    // No API key and no session token: refuse before touching the risk engine
    return new Response(
      JSON.stringify({ error: 'Authentication required (X-API-Key or Bearer token)' }),
      { status: 401, headers: jsonHeaders() }
    )
  }


   const channel = tenantId ? 'API_B2B' : 'NATIVE_B2C'

    try {
    // Do not trust an account-number-only cache lookup: the same account number
    // may occur at multiple banks. A submitted holder_name is merely an
    // unverified hint for screening, NEVER proof of account ownership.
    // Bank-specific verified holder resolution requires a reviewed DB schema.
    const resolvedHolder = holder_name

    const rpcParams: Record<string, unknown> = {
      p_account_number: account_number,
      p_bank_name: bank_name ?? '',
      p_amount: amount || 0,
      p_is_new_recipient: is_new_recipient ?? true,
      p_include_sandbox: includeSandbox,
      p_holder_name: resolvedHolder,
    }
    const { data, error } = await supabase.rpc('assess_transfer_risk', rpcParams)
    if (error) throw error

    const execution_time_ms = Date.now() - start

    // Persistent verdict log -> metering + audit (Phase F measures FP/FN here)

    const result = Array.isArray(data) ? data[0] : null

    if (!result) {
      throw new Error('Risk assessment returned no result')
    }

if (
  !result ||
  !['safe', 'warning', 'high_risk'].includes(result.risk_level) ||
  typeof result.risk_score !== 'number' ||
  !Number.isFinite(result.risk_score) ||
  result.risk_score < 0 ||
  result.risk_score > 100 ||
  !Number.isInteger(result.risk_score) ||
  !['ALLOW', 'REVIEW', 'BLOCK', 'FORCE_MANDATORY_SECONDARY_OTP'].includes(result.recommended_action) ||
  !Array.isArray(result.reasons) ||
  !Array.isArray(result.source_registry) ||
  !result.reasons.every((reason: unknown) => typeof reason === 'string') ||
  !result.source_registry.every((source: unknown) => typeof source === 'string') ||
  (result.confidence !== undefined && result.confidence !== null &&
    (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) ||
      result.confidence < 0 || result.confidence > 1)) ||
  (result.primary_match_flags !== undefined &&
    !Array.isArray(result.primary_match_flags))
) {
  throw new Error('Invalid risk assessment response')
}




const { error: auditError } = await supabase
  .from('global_risk_evaluations')
  .insert({

      channel,
      tenant_id: tenantId,
      queried_name: account_number,
      bank_name: bank_name ?? null,
      evaluated_score: result.risk_score,
      verdict_level: result.risk_level,
      reasons: result.reasons,
      recommended_action: result.recommended_action ?? null,
      source_registry: result.source_registry,
      execution_time_ms,

})

if (auditError) {
  throw new Error('AUDIT_LOG_UNAVAILABLE')
}


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
    const auditUnavailable = error instanceof Error && error.message === 'AUDIT_LOG_UNAVAILABLE'
    return new Response(
      JSON.stringify({ error: 'Risk assessment unavailable', code: auditUnavailable ? 'AUDIT_LOG_UNAVAILABLE' : 'RISK_ASSESSMENT_UNAVAILABLE' }),
      { status: 503, headers: jsonHeaders() }
    )
  }
})