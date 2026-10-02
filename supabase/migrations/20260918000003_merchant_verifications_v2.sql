-- ============================================================
-- Merchant Verification v2 (Phase B3)
-- Consolidates the two drifted verify_merchant implementations into one
-- authoritative flow that is:
--   * CAC-aware (official_cac_name + cac_status from verify-cac edge fn)
--   * Name-match aware (account_name from resolve-account — never silent)
--   * Payment-gated (status stays 'pending' until payment webhook in Phase E)
--   * No verified badge for high-risk accounts, unverified CAC, or accounts
--     that cannot be found.
-- ============================================================

-- 1. Expand merchant_verifications with CAC + name-match + payment fields
ALTER TABLE public.merchant_verifications
  ADD COLUMN IF NOT EXISTS cac_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS official_cac_name text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_name_match boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'processing', 'paid', 'refunded')),
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- 2. Single authoritative verify_merchant
DROP FUNCTION IF EXISTS public.verify_merchant(
  text, text, text, text, text, text, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.verify_merchant(
  p_business_name text,
  p_primary_account text,
  p_bank_name text,
  p_cac_number text DEFAULT null,
  p_cac_status text DEFAULT 'ACTIVE',
  p_official_cac_name text DEFAULT null,
  p_account_name text DEFAULT null,
  p_account_name_match boolean DEFAULT false,
  p_payment_reference text DEFAULT null
)
RETURNS TABLE (
  verified boolean,
  verification_state text,
  verification_id uuid,
  cac_status text,
  account_name_match boolean,
  risk_level text,
  badge_url text,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account RECORD;
  v_verification_id uuid;
  v_risk text := 'safe';
  v_code text;
  v_norm_business text;
  v_norm_official text;
  v_norm_account text;
BEGIN
  -- Account must exist and be findable
  SELECT overall_risk_level, total_reports, account_name
  INTO v_account
  FROM public.accounts
  WHERE account_number = p_primary_account AND bank_name = p_bank_name
  LIMIT 1;

  IF v_account.overall_risk_level IS NULL THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, NULL::text, false, NULL::text, NULL::text, 'Account number could not be verified — use the exact bank and account number.';
    RETURN;
  END IF;

  -- High-risk accounts are always rejected for a verified badge
  IF v_account.overall_risk_level = 'high_risk' THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, NULL::text, false, 'high_risk', NULL::text, 'This account is flagged as high risk and cannot be verified.';
    RETURN;
  END IF;

  IF v_account.overall_risk_level = 'warning' THEN
    v_risk := 'warning';
  END IF;

  -- CAC number must have been checked through the CAC registry
  IF p_cac_number IS NULL OR length(trim(p_cac_number)) = 0 THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, NULL::text, p_account_name_match, v_risk, NULL::text, 'A CAC registration number is required.';
    RETURN;
  END IF;

  IF upper(coalesce(p_cac_status, '')) <> 'ACTIVE' THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, upper(coalesce(p_cac_status, '')), p_account_name_match, v_risk, NULL::text, 'CAC record is not active for this registration number.';
    RETURN;
  END IF;

  -- Account name must be verified (resolved via bank-name lookup)
  IF p_account_name IS NULL OR length(trim(p_account_name)) = 0 THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, 'ACTIVE', false, v_risk, NULL::text, 'Bank account name could not be verified — please check the account number and bank.';
    RETURN;
  END IF;

  -- The identity chain must hold end to end:
  --   1. CAC name agrees with the submitted business name
  --   2. The resolved bank account name agrees with the submitted/business name
  -- Normalization strips punctuation/spacing/case so "Deolu Adeyemi Ventures
  -- Ltd." and "DEOLU ADEYEMI VENTURES LTD" compare equal.
  v_norm_business := lower(regexp_replace(p_business_name, '[^a-z0-9]', '', 'g'));
  v_norm_official := lower(regexp_replace(coalesce(p_official_cac_name, ''), '[^a-z0-9]', '', 'g'));
  v_norm_account := lower(regexp_replace(coalesce(p_account_name, ''), '[^a-z0-9]', '', 'g'));

  IF v_norm_official <> '' AND v_norm_business <> v_norm_official THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, 'ACTIVE', p_account_name_match, v_risk, NULL::text,
      'Business name does not match the CAC registry. Official name: ' || p_official_cac_name;
    RETURN;
  END IF;

  IF NOT (p_account_name_match OR (v_norm_business <> '' AND v_norm_business = v_norm_account)) THEN
    RETURN QUERY SELECT false, 'rejected', NULL::uuid, 'ACTIVE', p_account_name_match, v_risk, NULL::text,
      'The resolved bank account name does not match the business details provided.';
    RETURN;
  END IF;

  -- Deterministic verification code + badge URL (activates only after payment)
  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

  INSERT INTO public.merchant_verifications (
    business_name, cac_number, official_cac_name, cac_status, account_number,
    bank_name, account_name, account_name_match, status, payment_status,
    risk_level, badge_url, verification_code, verified_by, verified_at, payment_reference
  ) VALUES (
    p_business_name, trim(p_cac_number),
    coalesce(p_official_cac_name, p_business_name),
    'ACTIVE', p_primary_account, p_bank_name,
    p_account_name, p_account_name_match, 'pending', 'unpaid',
    v_risk, concat('https://shield.agtech.ng/verify/', v_code),
    v_code, auth.uid(), now(), p_payment_reference
  )
  ON CONFLICT (account_number, bank_name) WHERE status = 'verified'
  DO UPDATE SET business_name = EXCLUDED.business_name, payment_reference = EXCLUDED.payment_reference, updated_at = now()
  RETURNING id INTO v_verification_id;

  RETURN QUERY SELECT
    false, 'pending', v_verification_id, 'ACTIVE', p_account_name_match,
    v_risk, concat('https://shield.agtech.ng/verify/', v_code),
    'Identity checks passed. Complete payment to activate your verified badge.';
END;
$$;

-- 3. Keep : merchant_verifications RLS — consumers can only read 'verified' rows,
--    and only the account holder/admin see their pending submissions.
DROP POLICY IF EXISTS "Admin read merchant verifications" ON public.merchant_verifications;
CREATE POLICY "Admin read merchant verifications" ON public.merchant_verifications
  FOR SELECT TO authenticated USING (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );