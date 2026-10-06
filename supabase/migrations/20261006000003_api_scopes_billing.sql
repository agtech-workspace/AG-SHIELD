-- Feature 3 / Steps 2-4: API key scopes enforcement, Postgres-only
-- rate limits / shadow billing, B2B key + tenant management RPCs,
-- and monthly batch aggregates. No Redis - counters live in Postgres.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Scope + lifetime enforcement in the gateway lookup
--    (revoked_at / expires_at added by 20261001000011 but never enforced)
-- NOTE: the pre-existing 20260918000001 lookup_api_key returns 5 columns;
-- PostgreSQL refuses to change a function's return type, so DROP first.
----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.lookup_api_key(text);
CREATE OR REPLACE FUNCTION public.lookup_api_key(p_key_hash text)
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  status text,
  monthly_quota int,
  burst_limit int,
  scopes text[],
  key_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.status, t.monthly_quota, k.burst_limit,
         k.scopes, k.id
  FROM public.api_keys k
  JOIN public.tenants t ON t.id = k.tenant_id
  WHERE k.key_hash = p_key_hash
    AND k.status = 'active'
    AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now())
    AND t.status <> 'suspended'
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 2) Shadow billing columns (rate kept at 0 until finance sets pricing)
-- ---------------------------------------------------------------------------
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS calls_this_month int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_period_start timestamptz NOT NULL DEFAULT date_trunc('month', now()),
  ADD COLUMN IF NOT EXISTS per_call_rate_naira numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3) Atomic per-key metering + monthly quota cutoff (Postgres-only)
--    Called by the risk-check gateway once per B2B request.
--    monthly_quota <= 0 means unlimited (shadow billing default).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_api_key_usage(p_key_hash text)
RETURNS TABLE (
  p_allowed boolean,
  p_calls_used int,
  p_quota int,
  p_rate_naira numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calls int;
  v_quota int;
  v_rate numeric;
BEGIN
  UPDATE public.api_keys k
     SET calls_this_month = CASE
           WHEN k.quota_period_start < date_trunc('month', now()) THEN 1
           ELSE k.calls_this_month + 1
         END,
         quota_period_start = CASE
           WHEN k.quota_period_start < date_trunc('month', now()) THEN now()
           ELSE k.quota_period_start
         END
   WHERE k.key_hash = p_key_hash
   RETURNING k.calls_this_month,
             COALESCE((SELECT t.monthly_quota FROM public.tenants t WHERE t.id = k.tenant_id), 0),
             k.per_call_rate_naira
        INTO v_calls, v_quota, v_rate;

  IF NOT FOUND THEN
    p_allowed := false;
    p_calls_used := 0;
    p_quota := 0;
    p_rate_naira := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  p_allowed := (v_quota <= 0) OR (v_calls <= v_quota);
  p_calls_used := v_calls;
  p_quota := v_quota;
  p_rate_naira := v_rate;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) B2B tenant + key management RPCs (hash-only; raw key returned ONCE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_tenant(
  p_name text,
  p_contact_email text DEFAULT NULL,
  p_monthly_quota int DEFAULT 100000
)
RETURNS TABLE (id uuid, name text, contact_email text, monthly_quota int, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.current_profile_role();
  v_id uuid;
BEGIN
  IF v_role NOT IN ('root_admin', 'moderator')
     AND NOT (v_role = 'user' AND EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
     )) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Tenant name is required';
  END IF;

  INSERT INTO public.tenants (name, contact_email, monthly_quota)
  VALUES (trim(p_name), nullif(trim(coalesce(p_contact_email, '')), ''), GREATEST(p_monthly_quota, 0))
  RETURNING tenants.id INTO v_id;

  RETURN QUERY
    SELECT t.id, t.name, t.contact_email, t.monthly_quota, t.status
    FROM public.tenants t WHERE t.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_issue_api_key(
  p_tenant_id uuid,
  p_name text DEFAULT 'Default key',
  p_scopes text[] DEFAULT ARRAY['verify:read']::text[],
  p_expires_at timestamptz DEFAULT NULL,
  p_burst_limit int DEFAULT 100
)
RETURNS TABLE (key_id uuid, raw_key text, key_prefix text, scopes text[], expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role text := public.current_profile_role();
  v_secret text;
  v_hash text;
  v_prefix text;
  v_id uuid;
BEGIN
  IF v_role NOT IN ('root_admin', 'moderator')
     AND NOT (v_role = 'user' AND EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
     )) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown tenant';
  END IF;

  -- raw secret: shown exactly once, never stored
  v_secret := encode(gen_random_bytes(24), 'hex');
  v_hash := encode(digest('sg_live.' || v_secret, 'sha256'), 'hex');
  v_prefix := 'sg_live_' || left(v_secret, 5);

  INSERT INTO public.api_keys (tenant_id, key_hash, key_prefix, scopes, expires_at, burst_limit)
  VALUES (p_tenant_id, v_hash, v_prefix, p_scopes, p_expires_at, GREATEST(p_burst_limit, 1))
  RETURNING api_keys.id INTO v_id;

  RETURN QUERY
    SELECT k.id, v_secret, k.key_prefix, k.scopes, k.expires_at
    FROM public.api_keys k WHERE k.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_api_key(p_key_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.current_profile_role();
BEGIN
  IF v_role NOT IN ('root_admin', 'moderator')
     AND NOT (v_role = 'user' AND EXISTS (
       SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true
     )) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  UPDATE public.api_keys
  SET status = 'revoked', revoked_at = now()
  WHERE id = p_key_id AND status = 'active';
END;
$$;

-- Rotate = revoke old key + issue a brand new one for the same tenant
CREATE OR REPLACE FUNCTION public.admin_rotate_api_key(
  p_key_id uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (key_id uuid, raw_key text, key_prefix text, scopes text[], expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_name text;
  v_scopes text[];
  v_burst int;
BEGIN
  SELECT k.tenant_id, COALESCE(k.name, 'Default key'), k.scopes, k.burst_limit
    INTO v_tenant, v_name, v_scopes, v_burst
  FROM public.api_keys k
  WHERE k.id = p_key_id AND k.status = 'active' AND k.revoked_at IS NULL;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Active key not found';
  END IF;

  PERFORM public.admin_revoke_api_key(p_key_id);

  RETURN QUERY
    SELECT * FROM public.admin_issue_api_key(v_tenant, v_name, v_scopes, p_expires_at, v_burst);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Batch aggregates (monthly usage per tenant) - metering/dashboards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_tenant_monthly_usage AS
SELECT
  t.id AS tenant_id,
  t.name AS tenant_name,
  date_trunc('month', g.created_at) AS usage_month,
  count(*) AS evaluations,
  count(*) FILTER (WHERE g.channel = 'API_B2B') AS b2b_calls,
  avg(g.execution_time_ms) AS avg_execution_ms
FROM public.tenants t
LEFT JOIN public.global_risk_evaluations g
  ON g.tenant_id = t.id
GROUP BY t.id, t.name, date_trunc('month', g.created_at);

GRANT SELECT ON public.v_tenant_monthly_usage TO authenticated;
