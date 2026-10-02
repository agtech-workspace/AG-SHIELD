-- Drop old CHECK constraint and add expanded categories list + Other support
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_category_check;

ALTER TABLE public.reports ADD CONSTRAINT reports_reason_category_check
  CHECK (
    reason_category IN (
      'Instagram Vendor Scam',
      'Crypto P2P Fraud',
      'Facebook Marketplace',
      'Job/Visa Phishing',
      'POS Withdrawal Error',
      'Fake Giveaway',
      'Impersonation',
      'Social Media Report',
      'Rental / Housing Scam',
      'Fake Supplier / Invoice',
      'Romance Scam',
      'Advance Fee Fraud',
      'Business Email Compromise',
      'Other'
    )
  );
