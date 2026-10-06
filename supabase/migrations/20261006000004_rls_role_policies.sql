-- Feature 3 / Step 5: RLS policies + role-management RPC (option b)
-- Decision (b): root_admin + moderator may change roles; only root_admin may
-- grant root_admin; no self-edits; last-standing root_admin protected.
-- Admins = root_admin | moderator (or legacy is_admin=true). 'support' is
-- deliberately excluded from moderation powers (see approve_report/reject_report).
-- POC lockdown (20261006000001) + sync_admin_flag_with_role (20261006000002)
-- run BEFORE these policies, so role/is_admin on the NEW row are coherent here.

-- ---------------------------------------------------------------------------
-- profiles: admin read (+ no admin UPDATE — see note below)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin = true or p.role in ('root_admin', 'moderator'))
    )
  );

--
-- NOTE: there is deliberately NO admin UPDATE policy on profiles. RLS policy
-- expressions cannot reference NEW/OLD pseudo-rows (only plain column names),
-- so a broad admin-update policy cannot express the option-(b) guards
-- (no self role-change, only root_admin grants root_admin, moderator maxes at
-- moderator, last-root_admin protected). Those guards live in the
-- SECURITY DEFINER RPC admin_set_user_role below (bypasses RLS). Non-role
-- profile edits by admins have no product need, so the surface stays closed.
-- This deviates from the earlier plan draft that listed an admin UPDATE policy.

-- ---------------------------------------------------------------------------
-- user_checks: admins may read all (own-row policies from 20260613000001 stay)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read all checks" ON public.user_checks;
CREATE POLICY "Admins read all checks" ON public.user_checks
  FOR SELECT TO authenticated USING (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin = true or p.role in ('root_admin', 'moderator'))
    )
  );

-- ---------------------------------------------------------------------------
-- global_risk_evaluations: elevate the legacy is_admin-only read policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read evaluations" ON public.global_risk_evaluations;
CREATE POLICY "Admin read evaluations" ON public.global_risk_evaluations
  FOR SELECT TO authenticated USING (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.is_admin = true or p.role in ('root_admin', 'moderator'))
    )
  );

-- ---------------------------------------------------------------------------
-- admin_set_user_role RPC (single write path for role changes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_target_role text;
  v_root_left int;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  IF p_user_id IS NULL OR p_role IS NULL THEN
    RAISE EXCEPTION 'Target user and role are required';
  END IF;

  v_caller_role := public.current_profile_role();

  IF v_caller_role NOT IN ('root_admin', 'moderator') THEN
    RAISE EXCEPTION 'Moderator or root_admin access required';
  END IF;

  IF p_role NOT IN ('user', 'support', 'moderator', 'root_admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF v_caller_role = 'moderator' AND p_role = 'root_admin' THEN
    RAISE EXCEPTION 'Only root_admin can grant root_admin';
  END IF;

  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Admins cannot change their own role';
  END IF;

  SELECT p.role INTO v_target_role
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target profile not found';
  END IF;

  -- Last-standing root_admin protection (block demote/downgrade, incl. self)
  IF v_target_role = 'root_admin' AND p_role <> 'root_admin' THEN
    SELECT count(*) INTO v_root_left
    FROM public.profiles
    WHERE role = 'root_admin' AND id <> p_user_id;
    IF v_root_left < 1 THEN
      RAISE EXCEPTION 'Cannot demote the last root_admin';
    END IF;
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      is_admin = (p_role <> 'user')
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;