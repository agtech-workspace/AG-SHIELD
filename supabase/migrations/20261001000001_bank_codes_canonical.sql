-- Bank codes canonicalization and normalization helpers (non-destructive)
CREATE TABLE IF NOT EXISTS public.bank_codes (
  id SERIAL PRIMARY KEY,
  canonical_code TEXT NOT NULL,
  nip3 TEXT,
  nip6 TEXT,
  provider_codes TEXT[] NOT NULL DEFAULT '{}',
  aliases TEXT[] NOT NULL DEFAULT '{}',
  bank_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_codes_canonical_code_key'
  ) THEN
    ALTER TABLE public.bank_codes ADD CONSTRAINT bank_codes_canonical_code_key UNIQUE (canonical_code);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_bank_codes_nip3 ON public.bank_codes (nip3);
CREATE INDEX IF NOT EXISTS idx_bank_codes_nip6 ON public.bank_codes (nip6);
CREATE INDEX IF NOT EXISTS idx_bank_codes_provider_codes ON public.bank_codes USING GIN (provider_codes);
CREATE INDEX IF NOT EXISTS idx_bank_codes_aliases ON public.bank_codes USING GIN (aliases);

-- Upsert common NG banks
INSERT INTO public.bank_codes (canonical_code, nip3, nip6, provider_codes, aliases, bank_name)
VALUES
  ('044', '044', '000014', '{"044","000014"}', '{"ACCESS BANK","ACCESS","ACCESSBANK"}', 'Access Bank'),
  ('011', '011', '000016', '{"011","000016"}', '{"FIRST BANK","FIRSTBANK","FBN"}', 'First Bank'),
  ('033', '033', '000004', '{"033","000004"}', '{"UBA","UNITED BANK FOR AFRICA"}', 'UBA'),
  ('057', '057', '000015', '{"057","000015"}', '{"ZENITH BANK","ZENITH"}', 'Zenith Bank'),
  ('221', '221', NULL, '{"221"}', '{"STANBIC IBTC","STANBIC"}', 'Stanbic IBTC'),
  ('232', '232', NULL, '{"232"}', '{"STERLING BANK","STERLING"}', 'Sterling Bank'),
  ('035', '035', '000017', '{"035","000017"}', '{"WEMA BANK","WEMA"}', 'Wema Bank'),
  ('070', '070', NULL, '{"070"}', '{"FIDELITY BANK","FIDELITY"}', 'Fidelity Bank'),
  ('090405', '090405', NULL, '{"090405"}', '{"MONIEPOINT","MONIE POINT"}', 'Moniepoint'),
  ('090267', '090267', NULL, '{"090267"}', '{"KUDA","KUDA BANK"}', 'Kuda Bank'),
  ('100004', '100004', NULL, '{"100004"}', '{"OPAY"}', 'OPay'),
  ('100033', '100033', NULL, '{"100033"}', '{"PALMPAY","PALM PAY"}', 'PalmPay')
ON CONFLICT (canonical_code) DO UPDATE SET
  nip3 = COALESCE(EXCLUDED.nip3, bank_codes.nip3),
  nip6 = COALESCE(EXCLUDED.nip6, bank_codes.nip6),
  provider_codes = ARRAY(SELECT DISTINCT unnest(COALESCE(bank_codes.provider_codes, '{}') || COALESCE(EXCLUDED.provider_codes, '{}'))),
  aliases = ARRAY(SELECT DISTINCT unnest(COALESCE(bank_codes.aliases, '{}') || COALESCE(EXCLUDED.aliases, '{}'))),
  bank_name = COALESCE(EXCLUDED.bank_name, bank_codes.bank_name),
  updated_at = NOW();

-- Normalize account number: returns 10-digit NUBAN string or NULL
CREATE OR REPLACE FUNCTION public.normalize_account_number(p_acct TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT;
BEGIN
  IF p_acct IS NULL OR length(trim(p_acct)) = 0 THEN
    RETURN NULL;
  END IF;
  v := regexp_replace(trim(p_acct), '[^0-9]', '', 'g');
  IF length(v) < 10 THEN
    RETURN NULL;
  END IF;
  v := right(v, 10);
  IF length(v) <> 10 THEN
    RETURN NULL;
  END IF;
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Normalize bank code: returns canonical_code or NULL
CREATE OR REPLACE FUNCTION public.normalize_bank_code(p_code TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT;
  c TEXT;
BEGIN
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;
  v := trim(p_code);
  -- Try exact canonical
  SELECT canonical_code INTO c FROM public.bank_codes WHERE canonical_code = v LIMIT 1;
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Try nip3
  SELECT canonical_code INTO c FROM public.bank_codes WHERE nip3 = v LIMIT 1;
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Try nip6
  SELECT canonical_code INTO c FROM public.bank_codes WHERE nip6 = v LIMIT 1;
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Try provider_codes
  SELECT canonical_code INTO c FROM public.bank_codes WHERE v = ANY(provider_codes) LIMIT 1;
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Try aliases (case-insensitive)
  SELECT canonical_code INTO c FROM public.bank_codes WHERE lower(v) = ANY(ARRAY(SELECT lower(x) FROM unnest(aliases) x)) LIMIT 1;
  IF c IS NOT NULL THEN RETURN c; END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
