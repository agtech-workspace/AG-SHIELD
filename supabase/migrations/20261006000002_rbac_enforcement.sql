-- Feature 3 / Step 2: RBAC enforcement
-- Roles: root_admin, moderator, support, user (enforced by 20261001000010 check).
-- role is the SOURCE OF TRUTH. The legacy is_admin boolean is kept in lock-step
-- so every existing `is_admin = true` RLS policy automatically becomes
-- role-enforcing without rewriting dozens of policies.

-- Current caller's role (security definer so RLS/policies can use it safely)
CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()),
    'user'
  );
$$;

-- Any elevated role (root_admin / moderator / support) OR legacy admin flag
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (p.is_admin = true OR p.role IN ('root_admin', 'moderator', 'support'))
  );
$$;

-- Keep is_admin mirroring role so legacy policies follow RBAC
CREATE OR REPLACE FUNCTION public.sync_admin_flag_with_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('root_admin', 'moderator', 'support') THEN
    NEW.is_admin := true;
  ELSIF NEW.role = 'user' THEN
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_admin_flag ON public.profiles;
CREATE TRIGGER trg_profiles_sync_admin_flag
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_flag_with_role();

-- Backfill: reconcile existing rows with the new source of truth
UPDATE public.profiles
SET is_admin = (role IN ('root_admin', 'moderator', 'support'))
WHERE is_admin IS DISTINCT FROM (role IN ('root_admin', 'moderator', 'support'));

-- ---------------------------------------------------------------------------
-- Moderation RPCs: require moderator or root_admin.
-- 'support' is deliberately excluded from moderation powers.
-- Legacy admins (is_admin = true but role not yet migrated) are still honoured.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT COALESCE(p.role, 'user'), COALESCE(p.is_admin, false)
    INTO v_role, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_role NOT IN ('root_admin', 'moderator')
     AND NOT (v_role = 'user' AND v_is_admin) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  UPDATE public.reports
  SET status = 'approved', approved_by = v_user_id, approved_at = now()
  WHERE id = p_report_id;

  -- Approved community report -> OSINT / CROWDSOURCED registry entry
  -- (data_tier + blacklist_source per Feature 3 step 4; dedup via unique key)
  INSERT INTO public.registry_blacklist (
    entity_name, entity_identifier, identifier_type, type,
    source_agency, reason_flagged, listed_at, data_tier
  )
  SELECT
    COALESCE(NULLIF(trim(a.account_name), ''), 'Account ending ' || right(a.account_number, 4)),
    a.account_number,
    'account_number',
    CASE WHEN a.is_verified_business THEN 'BUSINESS'::entity_type ELSE 'INDIVIDUAL'::entity_type END,
    'CROWDSOURCED'::blacklist_source,
    'Community report approved: ' || r.reason_category ||
      COALESCE(' - ' || left(r.description, 120), ''),
    now(),
    'OSINT'
  FROM public.accounts a
  JOIN public.reports r ON r.id = p_report_id AND r.account_id = a.id
  ON CONFLICT (entity_identifier, source_agency, type) DO UPDATE
    SET reason_flagged = EXCLUDED.reason_flagged,
        listed_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_role text;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT COALESCE(p.role, 'user'), COALESCE(p.is_admin, false)
    INTO v_role, v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF v_role NOT IN ('root_admin', 'moderator')
     AND NOT (v_role = 'user' AND v_is_admin) THEN
    RAISE EXCEPTION 'Moderator access required';
  END IF;

  UPDATE public.reports
  SET status = 'rejected', approved_by = v_user_id, approved_at = now()
  WHERE id = p_report_id;
END;
$$;
