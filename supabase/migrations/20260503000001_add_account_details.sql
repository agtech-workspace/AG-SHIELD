-- Add account_name column to accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS account_name text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS flagged_reason text;

-- Update existing EFCC flagged accounts with reasons
UPDATE public.accounts SET 
  flagged_reason = 'Cybercrime / Money Laundering - EFCC Conviction',
  account_name = 'Tamaraudeinyefa Brakekebebe'
WHERE account_number = '0106661087';

UPDATE public.accounts SET 
  flagged_reason = 'Cybercrime / Money Laundering - EFCC Conviction',
  account_name = 'Tamaraudeinyefa Brakekebebe'
WHERE account_number = '2650121856';

UPDATE public.accounts SET 
  flagged_reason = 'Money Laundering - EFCC Conviction',
  account_name = 'Godday Brakekebebe'
WHERE account_number = '4068151050';

UPDATE public.accounts SET 
  flagged_reason = 'Romance Fraud (Fake UN Soldier) - $300k - EFCC Conviction',
  account_name = 'Terhemba Josiah Asagh'
WHERE account_number = '2018650772';

UPDATE public.accounts SET 
  flagged_reason = 'Internet Fraud - EFCC Conviction',
  account_name = 'Unknown'
WHERE account_number = '2400818519';

UPDATE public.accounts SET 
  flagged_reason = 'Internet Fraud - FCMB',
  account_name = 'Unknown'
WHERE account_number = '4883945011';

UPDATE public.accounts SET 
  flagged_reason = 'Romance Fraud / Catfishing',
  account_name = 'Unknown'
WHERE account_number = '2253820008';