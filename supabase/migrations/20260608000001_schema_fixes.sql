-- ============================================================
-- Schema fixes & additions for auto-population pipeline
-- ============================================================

-- 1. Add missing columns to accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS mono_verified_name text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS mono_verified_at timestamp with time zone;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS search_count integer DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS flag_count integer DEFAULT 0;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS scam_type text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_risk ON public.accounts (overall_risk_level);
CREATE INDEX IF NOT EXISTS idx_accounts_source ON public.accounts (source);
CREATE INDEX IF NOT EXISTS idx_accounts_verified ON public.accounts (is_verified);
CREATE INDEX IF NOT EXISTS idx_accounts_last4 ON public.accounts (substr(account_number, 7, 4));
CREATE INDEX IF NOT EXISTS idx_reports_account ON public.reports (account_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status);

-- 3. Create get_escalation_candidates RPC for community auto-escalation
CREATE OR REPLACE FUNCTION public.get_escalation_candidates()
RETURNS TABLE(account_number text, unique_reporters bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.account_number, COUNT(DISTINCT r.reporter_id)::bigint as unique_reporters
  FROM public.reports r
  JOIN public.accounts a ON a.id = r.account_id
  WHERE r.status = 'approved'
  GROUP BY a.account_number
  HAVING COUNT(DISTINCT r.reporter_id) >= 6;
$$;

-- 4. Update submit_user_report to return uuid (consistent with base schema)
--    Legacies defined this with RETURNS void; drop first so the return-type
--    change below is legal regardless of the previously applied definition.
DROP FUNCTION IF EXISTS public.submit_user_report(text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.submit_user_report(
  p_account_number text,
  p_bank_name text,
  p_reason_category text,
  p_description text DEFAULT null,
  p_evidence_url text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a report';
  END IF;

  INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
  VALUES (p_account_number, p_bank_name, 'safe', 0, false)
  ON CONFLICT (account_number, bank_name) DO UPDATE
  SET last_checked = now()
  RETURNING id INTO v_account_id;

  INSERT INTO public.reports (account_id, reason_category, description, reporter_id, evidence_url)
  VALUES (v_account_id, p_reason_category, p_description, v_user_id, p_evidence_url);

  RETURN v_account_id;
END;
$$;

-- 5. Add updated assess_transfer_risk that uses the new columns
CREATE OR REPLACE FUNCTION public.assess_transfer_risk(
  p_account_number text,
  p_bank_name text,
  p_amount numeric default 0,
  p_is_new_recipient boolean default true
)
RETURNS table (
  risk_level text,
  reasons text[],
  total_reports integer,
  social_proof text,
  account_name text,
  flagged_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reports integer := 0;
  v_risk text := 'safe';
  v_reasons text[] := '{}';
  v_is_verified_business boolean := false;
  v_account_name text;
  v_flagged_reason text;
begin
  select
    coalesce(a.total_reports, 0),
    coalesce(a.overall_risk_level, 'safe'),
    coalesce(a.is_verified_business, false),
    a.account_name,
    a.flagged_reason
  into v_reports, v_risk, v_is_verified_business, v_account_name, v_flagged_reason
  from public.accounts a
  where a.account_number = p_account_number
    and (p_bank_name = '' OR a.bank_name = p_bank_name)
  order by a.overall_risk_level desc
  limit 1;

  if v_reports >= 6 then
    v_risk := 'high_risk';
  elsif v_reports >= 1 and v_risk = 'safe' then
    v_risk := 'warning';
  end if;

  if v_flagged_reason is not null then
    v_reasons := array_append(v_reasons, v_flagged_reason);
  end if;

  if p_is_new_recipient then
    v_reasons := array_append(v_reasons, 'New recipient');
    if v_risk = 'safe' then
      v_risk := 'warning';
    end if;
  end if;

  if p_amount >= 150000 then
    v_reasons := array_append(v_reasons, 'Amount unusually high');
    if v_risk = 'safe' then
      v_risk := 'warning';
    end if;
  end if;

  if v_reports > 0 then
    v_reasons := array_append(v_reasons, 'Account recently flagged');
  end if;

  if v_is_verified_business and v_risk <> 'high_risk' then
    v_reasons := array_append(v_reasons, 'Verified business profile found');
  end if;

  if array_length(v_reasons, 1) is null and v_risk = 'safe' then
    v_reasons := array_append(v_reasons, 'No negative history found');
  end if;

  return query
  select
    v_risk,
    v_reasons,
    v_reports,
    case when v_reports >= 6 then concat(v_reports, ' people flagged this account recently.') else null end,
    v_account_name,
    v_flagged_reason;
end;
$$;

-- 6. Add trigger to increment search_count on account lookup
CREATE OR REPLACE FUNCTION public.increment_search_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.accounts
  SET search_count = COALESCE(search_count, 0) + 1,
      last_checked = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_increment_search_count
  AFTER INSERT OR UPDATE OF account_number ON public.accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_search_count();

-- 7. Device session tracking for max-2-devices enforcement
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_name text,
  last_active_at timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  unique(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions (user_id);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sessions" ON public.user_sessions;
CREATE POLICY "Users can read own sessions" ON public.user_sessions
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.user_sessions;
CREATE POLICY "Users can insert own sessions" ON public.user_sessions
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.user_sessions;
CREATE POLICY "Users can delete own sessions" ON public.user_sessions
FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RPC to check and register device session
CREATE OR REPLACE FUNCTION public.register_device_session(
  p_device_id text,
  p_device_name text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_count integer;
  v_existing_id uuid;
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  END IF;

  -- Check if this device already registered
  SELECT id INTO v_existing_id
  FROM public.user_sessions
  WHERE user_id = v_user_id AND device_id = p_device_id;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET last_active_at = now()
    WHERE id = v_existing_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'existing_device');
  END IF;

  -- Count current sessions
  SELECT count(*) INTO v_session_count
  FROM public.user_sessions
  WHERE user_id = v_user_id;

  IF v_session_count >= 2 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Max 2 devices allowed. Sign out from another device first.');
  END IF;

  INSERT INTO public.user_sessions (user_id, device_id, device_name)
  VALUES (v_user_id, p_device_id, p_device_name);

  RETURN jsonb_build_object('allowed', true, 'reason', 'new_device');
END;
$$;
