-- Seed 100 accounts with EFCC data and behavioral patterns
-- SANDBOX TEST DATA: every row is source='sandbox' so the B2B API never returns it.
-- EFCC real flagged accounts (from court records)
insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, account_name, flagged_reason, source)
values
('0106661087', 'Access', 'high_risk', 12, 'Tamaraudeinyefa Brakekebebe', 'EFCC conviction - cybercrime/money laundering', 'sandbox'),
('2650121856', 'Zenith', 'high_risk', 12, 'Tamaraudeinyefa Brakekebebe', 'EFCC conviction - cybercrime/money laundering', 'sandbox'),
('4068151050', 'Zenith', 'high_risk', 8, 'Godday Brakekebebe', 'EFCC conviction - money laundering', 'sandbox'),
('2018650772', 'Kuda', 'high_risk', 6, 'Terhemba Josiah Asagh', 'EFCC conviction - romance fraud $300k', 'sandbox'),
('2400818519', 'Zenith', 'high_risk', 5, NULL, 'EFCC conviction - internet fraud', 'sandbox'),
('4883945011', 'FCMB', 'high_risk', 4, NULL, 'EFCC conviction - internet fraud', 'sandbox'),
('2253820008', 'Zenith', 'warning', 3, NULL, 'EFCC arraigned - romance fraud', 'sandbox'),
('2266267081', 'Zenith', 'warning', 2, NULL, 'EFCC arraigned - advance fee fraud', 'sandbox'),
-- Community reported high risk
('2089912234', 'OPay', 'high_risk', 15, NULL, 'Multiple Instagram vendor scams reported', 'sandbox'),
('1022237890', 'PalmPay', 'high_risk', 8, NULL, 'Crypto P2P fraud - victims lost ₦2.5M', 'sandbox'),
('3021987654', 'GTBank', 'warning', 4, NULL, 'Job phishing scheme reported', 'sandbox'),
('3045567812', 'Access', 'warning', 3, NULL, 'POS reversal scam reported', 'sandbox')
on conflict (account_number, bank_name) do nothing;

-- Generate 88 more synthetic accounts
-- Safe accounts (will be used for normal verification)
insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, source)
select 
  lpad((random() * 9000000000 + 1000000000)::bigint::text, 10, '0'),
  (ARRAY['Access', 'Zenith', 'GTBank', 'UBA', 'FirstBank', 'Stanbic', 'Fidelity', 'Sterling', 'Union', 'Wema', 'OPay', 'PalmPay', 'Kuda', 'Moniepoint'])[floor(random() * 14 + 1)],
  'safe',
  0,
  'sandbox'
from generate_series(1, 50);

-- Warning level accounts
insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, flagged_reason, source)
select 
  lpad((random() * 9000000000 + 1000000000)::bigint::text, 10, '0'),
  (ARRAY['Access', 'Zenith', 'GTBank', 'UBA', 'FirstBank', 'Stanbic', 'Fidelity', 'OPay', 'PalmPay', 'Kuda'])[floor(random() * 10 + 1)],
  'warning',
  floor(random() * 4 + 1)::int,
  'Multiple user reports - verify carefully',
  'sandbox'
from generate_series(1, 25);

-- High risk accounts (synthetic)
insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, flagged_reason, source)
select 
  lpad((random() * 9000000000 + 1000000000)::bigint::text, 10, '0'),
  (ARRAY['OPay', 'PalmPay', 'Kuda', 'Moniepoint'])[floor(random() * 4 + 1)],
  'high_risk',
  floor(random() * 10 + 6)::int,
  'Pattern-based risk - account flagged for suspicious activity',
  'sandbox'
from generate_series(1, 13);

-- Insert sample events
insert into public.events (title, description, event_date, location, event_type, seats_available)
values
('How Not To Get Scammed - Free Webinar', 'Learn the top 5 scams targeting Nigerians and how to protect yourself and your family. Live Q&A session.', now() + interval '7 days', 'Online (Zoom)', 'webinar', 100),
('Fraud Prevention for SMEs', 'Small business owners learn how to verify suppliers, protect customer payments, and spot red flags.', now() + interval '14 days', 'Lagos, Victoria Island', 'workshop', 30),
('Corporate Team Training', 'Customized fraud awareness training for your team. Learn social engineering, phishing, and payment verification.', now() + interval '21 days', 'On-site (Your Office)', 'corporate', 20),
('Market Community Outreach', 'Free fraud awareness session for market traders. Learn how to verify account numbers before transfers.', now() + interval '3 days', 'Balogun Market, Lagos', 'community', 50),
('Instagram Vendor Scams - Live Discussion', 'Deep dive into Instagram vendor scams with real case studies and how to stay safe.', now() + interval '10 days', 'Online (Instagram Live)', 'webinar', 200),
('Developer Workshop: Payment Integration', 'Learn how to integrate SafeGuard APIs into your fintech or e-commerce platform.', now() + interval '30 days', 'Virtual (Google Meet)', 'workshop', 25);