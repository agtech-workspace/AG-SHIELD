-- Add evidence_url column to reports
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS evidence_url text;

-- Update submit_user_report function to accept evidence_url
CREATE OR REPLACE FUNCTION public.submit_user_report(
  p_account_number text,
  p_bank_name text,
  p_reason_category text,
  p_description text DEFAULT null,
  p_evidence_url text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to submit a report';
  END IF;

  INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
  VALUES (p_account_number, p_bank_name, 'safe', 0, false)
  ON CONFLICT (account_number, bank_name) DO UPDATE
  SET last_checked = now()
  RETURNING id INTO v_account_id;

  INSERT INTO public.reports (account_id, reason_category, description, reporter_id, evidence_url)
  VALUES (v_account_id, p_reason_category, p_description, v_user_id, p_evidence_url);

  RETURN v_account_id;
END;
$$;