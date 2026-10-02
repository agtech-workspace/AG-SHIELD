-- ============================================================
-- Core platform schema (Phase A1)
-- risk_config, registry_blacklist (+ fuzzystrmatch), global_risk_evaluations,
-- tenants / api_keys, account performance index, sandbox quarantine.
-- ============================================================

-- 0. Enable fuzzy string matching for blacklist evader detection
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 1. risk_config — single source of truth for scoring (tunable, no redeploy)
CREATE TABLE IF NOT EXISTS public.risk_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.risk_config (key, value, description) VALUES
  ('band_warning_min',    '31',  'Minimum score for warning level'),
  ('band_high_min',       '61',  'Minimum score for high_risk level'),
  ('points_report_0',     '0',   'Points for 0 reports'),
  ('points_report_1_2',   '20',  'Points for 1-2 reports'),
  ('points_report_3_5',   '40',  'Points for 3-5 reports'),
  ('points_report_ge6',   '65',  'Points for 6+ reports'),
  ('points_flagged',      '20',  'Points when a flagged_reason exists'),
  ('points_name_unverified', '15', 'Points when name cannot be verified'),
  ('points_new_recipient','10',  'Points for a new recipient'),
  ('points_high_amount',  '15',  'Points when amount >= high_amount_threshold'),
  ('discount_verified_business', '-10', 'Score discount for verified business profiles'),
  ('high_amount_threshold', '150000', 'Amount (NGN) that triggers high-amount points'),
  ('escalation_reports',  '6',   'Reports threshold for community escalation'),
  ('hard_trigger_reports', '6',  'Reports threshold for automatic hard block'),
  ('velocity_window_days', '30', 'Report recency window for live-risk signals'),
  ('confidence_default',  '0.9', 'Default confidence when account data is present'),
  ('confidence_low',      '0.75','Confidence when no account row exists'),
  ('max_flags',           '4',   'Max primary_match_flags returned'),
  ('fuzzy_edit_distance', '2',   'Levenshtein distance for fuzzy blacklist match')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.risk_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read risk_config" ON public.risk_config;
CREATE POLICY "Admin read risk_config" ON public.risk_config
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

DROP POLICY IF EXISTS "Admin write risk_config" ON public.risk_config;
CREATE POLICY "Admin write risk_config" ON public.risk_config
  FOR ALL TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Helper to read a config value as an integer with a fallback
CREATE OR REPLACE FUNCTION public.risk_cfg_int(p_key text, p_fallback int)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  select coalesce(
    (select (value #>> '{}')::int from public.risk_config where key = p_key),
    p_fallback
  );
$$;

-- Helper to read a config value as numeric with a fallback
CREATE OR REPLACE FUNCTION public.risk_cfg_numeric(p_key text, p_fallback numeric)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  select coalesce(
    (select (value #>> '{}')::numeric from public.risk_config where key = p_key),
    p_fallback
  );
$$;

-- 2. registry_blacklist — normalized regulatory/registry entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blacklist_source') THEN
    CREATE TYPE public.blacklist_source AS ENUM ('EFCC', 'ICP_NIGERIA', 'CAC', 'CIPC_SA', 'INTERPOL');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    CREATE TYPE public.entity_type AS ENUM ('INDIVIDUAL', 'BUSINESS');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.registry_blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name varchar(255) NOT NULL,
  entity_identifier varchar(100),          -- RC number, BVN hash, passport, account number
  identifier_type text,                     -- 'account_number' | 'rc' | 'bvn_hash' | 'passport'
  type entity_type NOT NULL,
  source_agency blacklist_source NOT NULL,
  reason_flagged text,
  source_url text,
  listed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_identifier, source_agency, type)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_normalized_name ON public.registry_blacklist (LOWER(entity_name));
CREATE INDEX IF NOT EXISTS idx_blacklist_identifier ON public.registry_blacklist (entity_identifier);
CREATE INDEX IF NOT EXISTS idx_blacklist_agency ON public.registry_blacklist (source_agency);
CREATE INDEX IF NOT EXISTS idx_blacklist_listed_at ON public.registry_blacklist (listed_at DESC);

ALTER TABLE public.registry_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read blacklist" ON public.registry_blacklist;
CREATE POLICY "Read blacklist" ON public.registry_blacklist
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admin write blacklist" ON public.registry_blacklist;
CREATE POLICY "Admin write blacklist" ON public.registry_blacklist
  FOR ALL TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- 3. global_risk_evaluations — metering + audit log for every live verdict
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consumer_channel') THEN
    CREATE TYPE public.consumer_channel AS ENUM ('API_B2B', 'NATIVE_B2C');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.global_risk_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel consumer_channel NOT NULL,
  tenant_id uuid,                             -- NULL for native B2C app
  queried_name text NOT NULL,                 -- account number (or business name)
  bank_name text,
  evaluated_score int NOT NULL,
  verdict_level varchar(50) NOT NULL,
  reasons jsonb,
  recommended_action text,
  source_registry text[] DEFAULT '{}',
  execution_time_ms real NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_tenant_channel ON public.global_risk_evaluations (tenant_id, channel);
CREATE INDEX IF NOT EXISTS idx_eval_created ON public.global_risk_evaluations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_queried ON public.global_risk_evaluations (queried_name);

ALTER TABLE public.global_risk_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read evaluations" ON public.global_risk_evaluations;
CREATE POLICY "Admin read evaluations" ON public.global_risk_evaluations
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

DROP POLICY IF EXISTS "System write evaluations" ON public.global_risk_evaluations;
CREATE POLICY "System write evaluations" ON public.global_risk_evaluations
  FOR INSERT TO authenticated, anon WITH CHECK (true);

-- 4. tenants + api_keys — B2B enterprise gateway
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  monthly_quota int DEFAULT 100000,           -- metered usage ceiling
  status text DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read tenants" ON public.tenants;
CREATE POLICY "Admin read tenants" ON public.tenants
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

DROP POLICY IF EXISTS "Admin write tenants" ON public.tenants;
CREATE POLICY "Admin write tenants" ON public.tenants
  FOR ALL TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,              -- sha-256 hex of the raw key
  key_prefix text NOT NULL,                   -- e.g. sg_live_<5 chars> for display
  status text DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  burst_limit int DEFAULT 100,                -- requests per 60s window
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON public.api_keys (key_prefix);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read api_keys" ON public.api_keys;
CREATE POLICY "Admin read api_keys" ON public.api_keys
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

DROP POLICY IF EXISTS "Admin write api_keys" ON public.api_keys;
CREATE POLICY "Admin write api_keys" ON public.api_keys
  FOR ALL TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  ) WITH CHECK (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- Lookup tenant by key hash (used by the gateway edge function)
CREATE OR REPLACE FUNCTION public.lookup_api_key(p_key_hash text)
RETURNS TABLE (tenant_id uuid, tenant_name text, status text, monthly_quota int, burst_limit int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select t.id, t.name, t.status, t.monthly_quota, k.burst_limit
  from public.api_keys k
  join public.tenants t on t.id = k.tenant_id
  where k.key_hash = p_key_hash
    and k.status = 'active'
    and t.status <> 'suspended'
  limit 1;
$$;

-- 5. Performance index for the hot path (account lookup by number + history)
CREATE INDEX IF NOT EXISTS idx_accounts_account_created
  ON public.accounts (account_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounts_account_bank_source
  ON public.accounts (account_number, bank_name, source);

-- 6. Sandbox quarantine — existing seeded test rows are test data, never real
--    Live on a fresh instance: this flags any legacy rows created before this
--    migration as sandbox so B2B callers (x-sandbox absent) never see them.
UPDATE public.accounts
SET source = 'sandbox'
WHERE source IS NULL;

-- 7. Track which reports happen INSIDE a recency window (velocity signals)
CREATE INDEX IF NOT EXISTS idx_reports_account_created
  ON public.reports (account_id, created_at DESC);