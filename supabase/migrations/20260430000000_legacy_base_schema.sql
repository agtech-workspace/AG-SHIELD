-- ============================================================
-- Legacy base schema (baseline for the NEW project instance)
-- The OLD project (gzdulztdlmngqsomyzkv) scaffolded these tables
-- manually on the dashboard; they were never captured as a
-- migration. Every later migration (and the v2 engine) assumes
-- profiles / accounts / reports already exist, so this baseline
-- must be the FIRST migration in the chain (dated before the
-- 20260501xxx seed/alter files).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- On hosted Supabase the uuid-ossp objects live in the `extensions` schema,
-- which is not on the public search_path. Provide a public wrapper so the
-- legacy migrations that call uuid_generate_v4() resolve correctly.
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
AS $$ SELECT gen_random_uuid() $$;

-- 1. profiles — mirrors auth.users; admin flag gates the admin UI + RLS
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  is_admin boolean DEFAULT false,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Auto-create a profile row for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', null)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. accounts — flagged accounts + verification state consumed by the
--    risk engine (v1 and v2 assess_transfer_risk), report aggregation,
--    and sandbox quarantine (source = 'sandbox').
CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_number text NOT NULL,
  bank_name text NOT NULL,
  overall_risk_level text NOT NULL DEFAULT 'safe',
  total_reports integer DEFAULT 0,
  account_name text,
  flagged_reason text,
  is_verified_business boolean DEFAULT false,
  is_verified boolean DEFAULT false,
  mono_verified_name text,
  mono_verified_at timestamptz,
  search_count integer DEFAULT 0,
  flag_count integer DEFAULT 0,
  scam_type text,
  source_url text,
  source text,
  created_at timestamptz DEFAULT now(),
  last_checked timestamptz,
  CONSTRAINT accounts_account_number_bank_name_key UNIQUE (account_number, bank_name)
);

CREATE INDEX IF NOT EXISTS idx_accounts_number ON public.accounts (account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_bank_name ON public.accounts (bank_name);

-- 3. reports — community fraud reports driving the velocity signals
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  reason_category text NOT NULL,
  description text,
  reporter_id uuid REFERENCES auth.users(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  evidence_url text,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_account_id ON public.reports (account_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON public.reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_status_idx ON public.reports (status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reports readable by all authenticated" ON public.reports;
CREATE POLICY "Reports readable by all authenticated" ON public.reports
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users submit reports" ON public.reports;
CREATE POLICY "Authenticated users submit reports" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins moderate reports" ON public.reports;
CREATE POLICY "Admins moderate reports" ON public.reports
  FOR ALL TO authenticated USING (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  ) WITH CHECK (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );