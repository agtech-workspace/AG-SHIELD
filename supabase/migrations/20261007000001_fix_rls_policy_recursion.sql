-- Hotfix: all inline `exists (select 1 from public.profiles where ...)`
-- policy expressions recurse as the authenticated role (42P17 "infinite
-- recursion detected in policy for relation \"profiles\""). A policy's USING /
-- WITH CHECK subquery runs under the caller's role, so SELECTing from profiles
-- inside a profiles policy (or any policy) re-enters profiles RLS.
--
-- Fix: every such expression becomes a SECURITY DEFINER helper call. The
-- helper's inner SELECT runs as the function owner (bypasses RLS, no
-- recursion). RLS policies are the only place these helpers are allowed to be
-- used from (do NOT call them from client code and then trust the boolean).
--
-- Helper semantics = decision (b): admins are root_admin | moderator.
-- 'support' deliberately excluded from elevated read/write regardless of the
-- legacy is_admin flag (which now just mirrors role).

CREATE OR REPLACE FUNCTION public.is_moderator_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('root_admin', 'moderator')
  );
$$;

REVOKE ALL ON FUNCTION public.is_moderator_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_moderator_user() TO authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- reports
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins moderate reports" ON public.reports;
CREATE POLICY "Admins moderate reports" ON public.reports
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- merchants / events (20260519000001)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can update merchants" ON public.merchants;
CREATE POLICY "Admin can update merchants" ON public.merchants
  FOR UPDATE TO authenticated USING (public.is_moderator_user());

DROP POLICY IF EXISTS "Admin can manage events" ON public.events;
CREATE POLICY "Admin can manage events" ON public.events
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- risk_config
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read risk_config" ON public.risk_config;
CREATE POLICY "Admin read risk_config" ON public.risk_config
  FOR SELECT TO authenticated USING (public.is_moderator_user());

DROP POLICY IF EXISTS "Admin write risk_config" ON public.risk_config;
CREATE POLICY "Admin write risk_config" ON public.risk_config
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- registry_blacklist (world-readable stays; only the admin write path changes)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin write blacklist" ON public.registry_blacklist;
CREATE POLICY "Admin write blacklist" ON public.registry_blacklist
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- global_risk_evaluations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read evaluations" ON public.global_risk_evaluations;
CREATE POLICY "Admin read evaluations" ON public.global_risk_evaluations
  FOR SELECT TO authenticated USING (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- tenants / api_keys
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read tenants" ON public.tenants;
CREATE POLICY "Admin read tenants" ON public.tenants
  FOR SELECT TO authenticated USING (public.is_moderator_user());

DROP POLICY IF EXISTS "Admin write tenants" ON public.tenants;
CREATE POLICY "Admin write tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

DROP POLICY IF EXISTS "Admin read api_keys" ON public.api_keys;
CREATE POLICY "Admin read api_keys" ON public.api_keys
  FOR SELECT TO authenticated USING (public.is_moderator_user());

DROP POLICY IF EXISTS "Admin write api_keys" ON public.api_keys;
CREATE POLICY "Admin write api_keys" ON public.api_keys
  FOR ALL TO authenticated
  USING (public.is_moderator_user())
  WITH CHECK (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- merchant_verifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin read merchant verifications" ON public.merchant_verifications;
CREATE POLICY "Admin read merchant verifications" ON public.merchant_verifications
  FOR SELECT TO authenticated USING (public.is_moderator_user());

-- ---------------------------------------------------------------------------
-- user_checks (added by 20261006000004)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins read all checks" ON public.user_checks;
CREATE POLICY "Admins read all checks" ON public.user_checks
  FOR SELECT TO authenticated USING (public.is_moderator_user());