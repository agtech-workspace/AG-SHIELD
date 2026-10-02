-- Input invariants and shared normalization
CREATE OR REPLACE FUNCTION public.normalize_cache_key_account(p_acct TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN public.normalize_account_number(p_acct);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.normalize_cache_key_bankcode(p_code TEXT)
RETURNS TEXT AS $$
DECLARE
  c TEXT;
BEGIN
  c := public.normalize_bank_code(p_code);
  IF c IS NOT NULL THEN RETURN c; END IF;
  -- Fallback: keep empty string semantics consistent
  IF p_code IS NULL THEN RETURN ''; END IF;
  RETURN trim(p_code);
END;
$$ LANGUAGE plpgsql IMMUTABLE;
