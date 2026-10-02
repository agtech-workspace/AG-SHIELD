export const ACCOUNT_NUMBER_LENGTH = 10
export const HISTORY_MAX_ITEMS = 8
export const HIGH_AMOUNT_THRESHOLD = 150000
export const ESCALATION_THRESHOLD = 6
export const COUNTDOWN_DURATION = 5
export const OVERLAY_COUNTDOWN_SECONDS = 5

export const BANKS = [
  'Access', 'Zenith', 'GTB', 'UBA', 'FirstBank', 'Stanbic', 'Fidelity', 'Sterling',
  'Union', 'Wema', 'Polaris', 'Unity', 'OPay', 'PalmPay', 'Kuda', 'Moniepoint',
  'FairMoney', 'Carbon', 'VFD', 'Hope PSBank',
] as const

export const BANK_CODES: Record<string, string> = {
  'Access': '044', 'Zenith': '057', 'GTB': '058', 'UBA': '033',
  'FirstBank': '011', 'Stanbic': '221', 'Fidelity': '070', 'Sterling': '232',
  'Union': '032', 'Wema': '035', 'Polaris': '076', 'Unity': '215',
  'OPay': '100004', 'PalmPay': '100033', 'Kuda': '090267', 'Moniepoint': '090405',
  'FairMoney': '090551', 'Carbon': '100026', 'VFD': '090110', 'Hope PSBank': '090005',
}

export const REPORT_CATEGORIES = [
  'Instagram Vendor Scam', 'Crypto P2P Fraud', 'Facebook Marketplace',
  'Job/Visa Phishing', 'POS Withdrawal Error', 'Fake Giveaway', 'Impersonation',
  'Social Media Report', 'Rental / Housing Scam', 'Fake Supplier / Invoice',
  'Romance Scam', 'Advance Fee Fraud', 'Business Email Compromise', 'Other',
]

export const RISK_THRESHOLDS = {
  HIGH_RISK_MIN: 61,
  WARNING_MIN: 31,
  REPORT_MAX_POINTS: 65,
  FLAGGED_POINTS: 20,
  NAME_UNVERIFIED_POINTS: 15,
  NEW_RECIPIENT_POINTS: 10,
  HIGH_AMOUNT_POINTS: 15,
  VERIFIED_BUSINESS_DISCOUNT: -10,
}
