-- Add status column to reports for admin review workflow
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));

-- Add is_admin column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Create function to approve report
CREATE OR REPLACE FUNCTION public.approve_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  UPDATE public.reports
  SET status = 'approved', approved_by = v_user_id, approved_at = now()
  WHERE id = p_report_id;
END;
$$;

-- Create function to reject report
CREATE OR REPLACE FUNCTION public.reject_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_is_admin boolean;
BEGIN
  v_user_id := auth.uid();
  
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM public.profiles p
  WHERE p.id = v_user_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  
  UPDATE public.reports
  SET status = 'rejected', approved_by = v_user_id, approved_at = now()
  WHERE id = p_report_id;
END;
$$;

-- Create function to update account risk when report is approved
CREATE OR REPLACE FUNCTION public.update_account_on_report_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  report_total integer;
  next_risk text;
BEGIN
  IF NEW.status = 'approved' AND OLD.status = 'pending' THEN
    SELECT count(*) INTO report_total
    FROM public.reports
    WHERE account_id = NEW.account_id
      AND (status IS NULL OR status = 'approved');

    next_risk := CASE
      WHEN report_total >= 6 THEN 'high_risk'
      WHEN report_total >= 1 THEN 'warning'
      ELSE 'safe'
    END;

    UPDATE public.accounts
    SET total_reports = report_total,
        overall_risk_level = next_risk,
        last_checked = now()
    WHERE id = NEW.account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_account_on_report_approval ON public.reports;
CREATE TRIGGER trg_update_account_on_report_approval
AFTER UPDATE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.update_account_on_report_approval();

-- Add approved columns
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone;