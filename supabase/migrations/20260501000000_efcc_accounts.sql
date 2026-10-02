-- Add EFCC flagged accounts to blacklist
INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
VALUES
  ('0106661087', 'Access Bank', 'high_risk', 10, false),
  ('2650121856', 'Zenith Bank', 'high_risk', 10, false),
  ('4068151050', 'Zenith Bank', 'high_risk', 8, false),
  ('2018650772', 'Kuda Bank', 'high_risk', 12, false),
  ('2400818519', 'Zenith Bank', 'high_risk', 6, false),
  ('4883945011', 'FCMB', 'high_risk', 5, false),
  ('2253820008', 'Zenith Bank', 'high_risk', 7, false),
  ('2266267081', 'Zenith Bank', 'warning', 3, false)
ON CONFLICT (account_number, bank_name) DO UPDATE SET
  overall_risk_level = EXCLUDED.overall_risk_level,
  total_reports = EXCLUDED.total_reports,
  last_checked = now();

-- Add safe/verified accounts for demo
INSERT INTO public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
VALUES
  ('0112345678', 'First Bank', 'safe', 0, true),
  ('0581234567', 'GTBank', 'safe', 0, false),
  ('0441234567', 'Access Bank', 'safe', 0, false),
  ('0571234567', 'Zenith Bank', 'safe', 0, false),
  ('0331234567', 'UBA', 'safe', 0, false),
  ('0902671234', 'Kuda', 'safe', 0, false),
  ('1000041234', 'OPay', 'safe', 0, false)
ON CONFLICT (account_number, bank_name) DO UPDATE SET
  overall_risk_level = 'safe',
  is_verified_business = EXCLUDED.is_verified_business;