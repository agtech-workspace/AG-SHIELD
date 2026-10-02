import { getMockAccount } from './mockData'

export type CACMatch = {
  rc_number: string
  company_name: string
  company_type: string
  status: string
  registered_at?: string | null
  office_address?: string | null
}

export type MerchantResult = {
  verified: boolean
  verification_state?: 'pending' | 'rejected' | 'verified'
  verification_id?: string
  cac_status?: string
  account_name_match?: boolean
  risk_level?: string
  badge_url?: string
  reason?: string
}

// Mirrors the canned data in supabase/functions/verify-cac/index.ts so demo
// mode exercises the same flow offline (no provider keys, no edge deploy).
const SANDBOX_COMPANIES: CACMatch[] = [
  { rc_number: '1234567', company_name: 'Deolu Adeyemi Ventures Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2019-04-12', office_address: 'Lagos Island, Lagos' },
  { rc_number: '7654321', company_name: 'Deolu Adeyemi Ventures Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2019-04-12', office_address: 'Lagos Island, Lagos' },
  { rc_number: '9021045', company_name: 'Obada Global Concepts', company_type: 'BN', status: 'ACTIVE', registered_at: '2021-11-03', office_address: 'Ikeja, Lagos' },
  { rc_number: '3418876', company_name: 'WestBridge Integrated Services Ltd', company_type: 'RC', status: 'DISSOLVED', registered_at: '2008-01-22', office_address: 'Victoria Island, Lagos' },
  { rc_number: '5112230', company_name: 'BrightPath Foods Ltd', company_type: 'RC', status: 'ACTIVE', registered_at: '2016-05-30', office_address: 'Surulere, Lagos' },
  { rc_number: '6110092', company_name: 'Titan Gate Logistics', company_type: 'BN', status: 'ACTIVE', registered_at: '2020-02-14', office_address: 'Port Harcourt, Rivers' },
]

export function sandboxCacLookup(
  mode: 'number' | 'search',
  companyNumber: string,
  companyType: string,
  companyName: string,
): { results: CACMatch[]; status: string; count: number } {
  let results: CACMatch[]
  if (mode === 'number') {
    results = SANDBOX_COMPANIES.filter(
      (c) => c.rc_number === companyNumber && (companyType === 'ALL' || c.company_type === companyType),
    )
  } else {
    const q = companyName.toLowerCase()
    results = SANDBOX_COMPANIES.filter((c) => c.company_name.toLowerCase().includes(q))
  }
  const clean = results.filter((r) => r.company_name.trim().length > 0)
  return { results: clean, status: clean.length > 0 ? 'found' : 'not_found', count: clean.length }
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

type DemoVerifyInput = {
  business_name: string
  primary_account: string
  bank_name: string
  cac_number: string
  cac_status: string
  official_cac_name: string
  account_name: string
}

// Mirrors the gating logic in verify_merchant (migration 20260918000003) so
// demo mode returns the same pending/rejected outcomes without the DB.
export function demoVerifyMerchant(input: DemoVerifyInput): MerchantResult {
  const account = getMockAccount(input.primary_account, input.bank_name)
  if (!account) {
    return { verified: false, verification_state: 'rejected', account_name_match: false, reason: 'Account number could not be verified — use the exact bank and account number.' }
  }

  const riskLevel = account.overallRiskLevel
  if (riskLevel === 'high_risk') {
    return { verified: false, verification_state: 'rejected', account_name_match: false, risk_level: 'high_risk', reason: 'This account is flagged as high risk and cannot be verified.' }
  }

  if (!input.cac_number.trim()) {
    return { verified: false, verification_state: 'rejected', account_name_match: false, risk_level: riskLevel, reason: 'A CAC registration number is required.' }
  }

  if (input.cac_status.toUpperCase() !== 'ACTIVE') {
    return { verified: false, verification_state: 'rejected', cac_status: input.cac_status, account_name_match: false, risk_level: riskLevel, reason: 'CAC record is not active for this registration number.' }
  }

  if (!input.account_name.trim()) {
    return { verified: false, verification_state: 'rejected', cac_status: 'ACTIVE', account_name_match: false, risk_level: riskLevel, reason: 'Bank account name could not be verified — please check the account number and bank.' }
  }

  const normBusiness = normalize(input.business_name)
  const normOfficial = normalize(input.official_cac_name)
  const normAccount = normalize(account.accountName ?? '')

  if (normOfficial && normBusiness !== normOfficial) {
    return { verified: false, verification_state: 'rejected', cac_status: 'ACTIVE', account_name_match: false, risk_level: riskLevel, reason: 'Business name does not match the CAC registry. Official name: ' + input.official_cac_name }
  }

  const accountNameMatches = normBusiness !== '' && normBusiness === normAccount
  if (!accountNameMatches) {
    return { verified: false, verification_state: 'rejected', cac_status: 'ACTIVE', account_name_match: false, risk_level: riskLevel, reason: 'The resolved bank account name does not match the business details provided.' }
  }

  const code = Math.random().toString(36).slice(2, 10).toUpperCase()
  return {
    verified: false,
    verification_state: 'pending',
    verification_id: crypto.randomUUID(),
    cac_status: 'ACTIVE',
    account_name_match: true,
    risk_level: riskLevel,
    badge_url: `https://shield.agtech.ng/verify/${code}`,
    reason: 'Identity checks passed. Complete payment to activate your verified badge.',
  }
}