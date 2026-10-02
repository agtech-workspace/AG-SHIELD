CREATE TABLE IF NOT EXISTS public.user_checks (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_id text,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  risk_level text CHECK (risk_level IN ('safe', 'warning', 'high_risk')),
  score integer DEFAULT 0,
  source text DEFAULT 'web' CHECK (source IN ('web', 'android')),
  ip_address text,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_checks_user ON public.user_checks (user_id);
CREATE INDEX IF NOT EXISTS idx_user_checks_account ON public.user_checks (account_number, bank_name);
CREATE INDEX IF NOT EXISTS idx_user_checks_created ON public.user_checks (created_at DESC);

ALTER TABLE public.user_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own checks" ON public.user_checks;
CREATE POLICY "Users can read own checks" ON public.user_checks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own checks" ON public.user_checks;
CREATE POLICY "Users can insert own checks" ON public.user_checks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow anon insert for android" ON public.user_checks;
CREATE POLICY "Allow anon insert for android" ON public.user_checks
  FOR INSERT TO anon WITH CHECK (device_id IS NOT NULL AND user_id IS NULL);
