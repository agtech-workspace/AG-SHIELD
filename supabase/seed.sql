-- SafeGuard Seed Data (SANDBOX TEST DATA — source='sandbox', quarantined from B2B)
-- Real EFCC flagged accounts (from court convictions)
-- https://www.efcc.gov.ng/

-- EFCC Convicted Fraudsters
INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business, source)
VALUES
  ('0106661087', 'Access Bank', 'high_risk', 10, false, 'sandbox'),
  ('2650121856', 'Zenith Bank', 'high_risk', 10, false, 'sandbox'),
  ('4068151050', 'Zenith Bank', 'high_risk', 8, false, 'sandbox'),
  ('2018650772', 'Kuda Bank', 'high_risk', 12, false, 'sandbox'),
  ('2400818519', 'Zenith Bank', 'high_risk', 6, false, 'sandbox'),
  ('4883945011', 'FCMB', 'high_risk', 5, false, 'sandbox'),
  ('2253820008', 'Zenith Bank', 'high_risk', 7, false, 'sandbox'),
  ('2266267081', 'Zenith Bank', 'warning', 3, false, 'sandbox')
ON CONFLICT (account_number, bank_name) DO UPDATE SET
  overall_risk_level = EXCLUDED.overall_risk_level,
  total_reports = EXCLUDED.total_reports,
  source = 'sandbox',
  last_checked = now();

-- Safe/Verified Business Accounts (for demo - clean accounts)
INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business, source)
VALUES
  ('0112345678', 'First Bank', 'safe', 0, true, 'sandbox'),
  ('0581234567', 'GTBank', 'safe', 0, false, 'sandbox'),
  ('0441234567', 'Access Bank', 'safe', 0, false, 'sandbox'),
  ('0571234567', 'Zenith Bank', 'safe', 0, false, 'sandbox'),
  ('0331234567', 'UBA', 'safe', 0, false, 'sandbox'),
  ('0902671234', 'Kuda', 'safe', 0, false, 'sandbox'),
  ('1000041234', 'OPay', 'safe', 0, false, 'sandbox'),
  ('2141234567', 'FirstBank', 'safe', 0, false, 'sandbox')
ON CONFLICT (account_number, bank_name) DO UPDATE SET
  overall_risk_level = 'safe',
  is_verified_business = EXCLUDED.is_verified_business,
  source = 'sandbox',
  last_checked = now();