-- Feature 3 / Step 1: POC lockdown (DB-level, app-level alone is insufficient)
-- Blocks the POC accounts from EVER holding an elevated role or admin flag.
-- Elevated == anything above 'user'; POC accounts are locked to the user tier.
-- Emails: shield.poc.125047@gmail.com, shield.poc.125000@gmail.com

CREATE OR REPLACE FUNCTION public.prevent_poc_elevated_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.id;

  IF v_email IN ('shield.poc.125047@gmail.com', 'shield.poc.125000@gmail.com') THEN
    IF NEW.role IS DISTINCT FROM 'user' THEN
      NEW.role := 'user';
    END IF;
    IF NEW.is_admin IS DISTINCT FROM false THEN
      NEW.is_admin := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_poc_lockdown ON public.profiles;
CREATE TRIGGER trg_profiles_poc_lockdown
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_poc_elevated_access();

-- Demote any POC row that already carries an elevated role/flag
UPDATE public.profiles p
SET role = 'user',
    is_admin = false
WHERE EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = p.id
      AND lower(u.email) IN ('shield.poc.125047@gmail.com', 'shield.poc.125000@gmail.com')
  )
  AND (p.role <> 'user' OR p.is_admin IS DISTINCT FROM false);

-- Verification (returns 0 rows when lockdown is effective)
-- SELECT p.id, u.email, p.role, p.is_admin
-- FROM public.profiles p JOIN auth.users u ON u.id = p.id
-- WHERE lower(u.email) LIKE 'shield.poc.%';
