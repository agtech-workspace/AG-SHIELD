CREATE TABLE IF NOT EXISTS public.merchant_verifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_name text NOT NULL,
  cac_number text,
  account_number text NOT NULL,
  bank_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  risk_level text CHECK (risk_level IN ('safe', 'warning', 'high_risk')),
  badge_url text,
  verification_code text UNIQUE,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_verifications_account_bank
  ON public.merchant_verifications (account_number, bank_name)
  WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS idx_merchant_verifications_status ON public.merchant_verifications (status);
CREATE INDEX IF NOT EXISTS idx_merchant_verifications_account ON public.merchant_verifications (account_number);
CREATE INDEX IF NOT EXISTS idx_merchant_verifications_business ON public.merchant_verifications (business_name);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_verifications_updated_at ON public.merchant_verifications;
CREATE TRIGGER trg_merchant_verifications_updated_at
  BEFORE UPDATE ON public.merchant_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.merchant_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read verified merchants" ON public.merchant_verifications;
CREATE POLICY "Anyone can read verified merchants" ON public.merchant_verifications
  FOR SELECT TO anon, authenticated USING (status = 'verified');

DROP POLICY IF EXISTS "Users can read own verifications" ON public.merchant_verifications;
CREATE POLICY "Users can read own verifications" ON public.merchant_verifications
  FOR SELECT TO authenticated USING (verified_by = auth.uid());

DROP POLICY IF EXISTS "Users can insert merchant verifications" ON public.merchant_verifications;
CREATE POLICY "Users can insert merchant verifications" ON public.merchant_verifications
  FOR INSERT TO authenticated WITH CHECK (verified_by = auth.uid());

DROP FUNCTION IF EXISTS public.verify_merchant CASCADE;

CREATE OR REPLACE FUNCTION public.verify_merchant(
  p_business_name text,
  p_primary_account text,
  p_bank_name text,
  p_cac_number text DEFAULT null
)
RETURNS TABLE(verified boolean, verification_id uuid, risk_level text, badge_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account RECORD;
  v_verification_id uuid;
  v_risk text := 'safe';
  v_code text;
BEGIN
  SELECT overall_risk_level, total_reports INTO v_account
  FROM public.accounts
  WHERE account_number = p_primary_account AND bank_name = p_bank_name
  LIMIT 1;

  IF v_account.overall_risk_level = 'high_risk' THEN
    v_risk := 'high_risk';
    RETURN QUERY SELECT false, NULL::uuid, v_risk, NULL::text;
    RETURN;
  END IF;

  IF v_account.overall_risk_level = 'warning' THEN
    v_risk := 'warning';
  END IF;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.merchant_verifications (
    business_name, cac_number, account_number, bank_name,
    status, risk_level, badge_url, verification_code, verified_by, verified_at
  ) VALUES (
    p_business_name, p_cac_number, p_primary_account, p_bank_name,
    'verified', v_risk,
    concat('https://shield.agtech.ng/verify/', v_code),
    v_code, auth.uid(), now()
  )
  RETURNING id INTO v_verification_id;

  RETURN QUERY SELECT true, v_verification_id, v_risk, concat('https://shield.agtech.ng/verify/', v_code);
END;
$$;
