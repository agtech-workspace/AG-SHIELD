-- Shield (scanner) admin dashboard analytics
-- Covers: daily/total logins, daily/total searches, reports summary for the
-- Shield admin panel. Stats start from this migration onward (no backfill).
-- Days are counted in UTC. Admin gating = is_moderator_user() (decision (b)).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shield_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shield_logins_created
  ON public.shield_logins (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shield_logins_user_created
  ON public.shield_logins (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shield_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  account_number text,
  bank_name text,
  verdict text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shield_searches_created
  ON public.shield_searches (created_at DESC);

ALTER TABLE public.shield_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shield_searches ENABLE ROW LEVEL SECURITY;

-- No direct client writes (inserts go through SECURITY DEFINER functions).
DROP POLICY IF EXISTS "Admins read shield_logins" ON public.shield_logins;
CREATE POLICY "Admins read shield_logins" ON public.shield_logins
  FOR SELECT TO authenticated USING (public.is_moderator_user());

DROP POLICY IF EXISTS "Admins read shield_searches" ON public.shield_searches;
CREATE POLICY "Admins read shield_searches" ON public.shield_searches
  FOR SELECT TO authenticated USING (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- 2. Event recording (SECURITY DEFINER, authenticated only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_shield_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  -- One login row per user per UTC day (daily-login dedupe).
  IF EXISTS (
    SELECT 1 FROM public.shield_logins l
    WHERE l.user_id = v_uid
      AND (l.created_at AT TIME ZONE 'utc') >= date_trunc('day', now() AT TIME ZONE 'utc')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.shield_logins (user_id) VALUES (v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.record_shield_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_shield_login() TO authenticated;

CREATE OR REPLACE FUNCTION public.record_shield_search(
  p_account_number text,
  p_bank_name text,
  p_verdict text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  INSERT INTO public.shield_searches (user_id, account_number, bank_name, verdict)
  VALUES (
    v_uid,
    left(regexp_replace(coalesce(p_account_number, ''), '\D', '', 'g'), 10),
    left(coalesce(p_bank_name, ''), 80),
    left(coalesce(p_verdict, ''), 20)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_shield_search(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_shield_search(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin stats RPC (gated by is_moderator_user)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shield_admin_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day_utc timestamp := date_trunc('day', now() AT TIME ZONE 'utc');
  v_result jsonb;
BEGIN
  IF NOT public.is_moderator_user() THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  SELECT jsonb_build_object(
    'logins_total', (SELECT count(*) FROM public.shield_logins),
    'logins_today', (
      SELECT count(*) FROM public.shield_logins
      WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc
    ),
    'logins_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d, 'count', c) ORDER BY d)
      FROM (
        SELECT (created_at AT TIME ZONE 'utc')::date AS d, count(*) AS c
        FROM public.shield_logins
        WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc - interval '6 days'
        GROUP BY 1
      ) t
    ), '[]'::jsonb),

    'searches_total', (SELECT count(*) FROM public.shield_searches),
    'searches_today', (
      SELECT count(*) FROM public.shield_searches
      WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc
    ),
    'searches_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d, 'count', c) ORDER BY d)
      FROM (
        SELECT (created_at AT TIME ZONE 'utc')::date AS d, count(*) AS c
        FROM public.shield_searches
        WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc - interval '6 days'
        GROUP BY 1
      ) t
    ), '[]'::jsonb),
    'searches_by_verdict', COALESCE((
      SELECT jsonb_object_agg(v, c)
      FROM (
        SELECT coalesce(nullif(verdict, ''), 'unknown') AS v, count(*) AS c
        FROM public.shield_searches
        GROUP BY 1
      ) t
    ), '{}'::jsonb),

    'reports_total', (SELECT count(*) FROM public.reports),
    'reports_today', (
      SELECT count(*) FROM public.reports
      WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc
    ),
    'reports_pending', (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'reports_approved', (SELECT count(*) FROM public.reports WHERE status = 'approved'),
    'reports_rejected', (SELECT count(*) FROM public.reports WHERE status = 'rejected'),
    'reports_week', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', d, 'count', c) ORDER BY d)
      FROM (
        SELECT (created_at AT TIME ZONE 'utc')::date AS d, count(*) AS c
        FROM public.reports
        WHERE (created_at AT TIME ZONE 'utc') >= v_day_utc - interval '6 days'
        GROUP BY 1
      ) t
    ), '[]'::jsonb),

    'users_total', (SELECT count(*) FROM public.profiles),
    'generated_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.shield_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shield_admin_stats() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bootstrap: agtechrelations@gmail.com is THE admin sign-in address.
--    Existing rows are promoted now; the trigger promotes future sign-ups.
--    (sync_admin_flag_with_role keeps is_admin in lock-step afterwards.)
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET role = 'root_admin',
    is_admin = true
FROM auth.users u
WHERE u.id = p.id
  AND lower(u.email) = 'agtechrelations@gmail.com'
  AND p.role IS DISTINCT FROM 'root_admin';

CREATE OR REPLACE FUNCTION public.promote_agtech_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF (SELECT lower(u.email) FROM auth.users u WHERE u.id = NEW.id)
       = 'agtechrelations@gmail.com' THEN
    NEW.role := 'root_admin';
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_promote_agtech_admin ON public.profiles;
CREATE TRIGGER trg_profiles_promote_agtech_admin
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_agtech_admin();
