export type Verdict = 'safe' | 'review' | 'block'

export interface ScanResult {
  verdict: Verdict
  score: number
  tier: string
  maskedName: string | null
  reasons: string[]
  account: string
  bank: string
  source: 'live' | 'demo'
}

export const BANKS = [
  'Access', 'Zenith', 'GTB', 'UBA', 'FirstBank', 'Stanbic', 'Fidelity', 'Sterling',
  'Union', 'Wema', 'Polaris', 'Unity', 'OPay', 'PalmPay', 'Kuda', 'Moniepoint',
  'FairMoney', 'Carbon', 'VFD', 'Hope PSBank',
] as const

export const BANK_CODES: Record<string, string> = {
  Access: '044', Zenith: '057', GTB: '058', UBA: '033',
  FirstBank: '011', Stanbic: '221', Fidelity: '070', Sterling: '232',
  Union: '032', Wema: '035', Polaris: '076', Unity: '215',
  OPay: '100004', PalmPay: '100033', Kuda: '090267', Moniepoint: '090405',
  FairMoney: '090551', Carbon: '100026', VFD: '090110', 'Hope PSBank': '090005',
}

export function sanitizeAccount(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10)
}

export function maskAccount(n: string): string {
  const clean = n.replace(/\D/g, '')
  if (clean.length <= 4) return '*'.repeat(clean.length)
  return '*'.repeat(clean.length - 4) + clean.slice(-4)
}

export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return name
  return parts
    .map((p, i) => (i === parts.length - 1 ? p[0] + '*'.repeat(Math.max(1, p.length - 1)) : p[0] + '*'.repeat(Math.max(1, p.length - 1))))
    .join(' ')
}

const DEMO_FLAGGED: Record<string, { verdict: Verdict; reason: string }> = {
  '1234567890': { verdict: 'block', reason: 'This account is on the community blocklist with 9 reports.' },
  '0987654321': { verdict: 'review', reason: 'Multiple community reports flag this account — verify before paying.' },
  '9090909090': { verdict: 'review', reason: 'Reported as an Instagram vendor scam account.' },
  '1122334455': { verdict: 'block', reason: 'Flagged by a national registry for advance-fee fraud.' },
}

function scoreFor(verdict: Verdict): number {
  return verdict === 'block' ? 92 : verdict === 'review' ? 58 : 12
}

function reasonsFor(verdict: Verdict, reason?: string): string[] {
  if (reason) return [reason]
  if (verdict === 'block') return ['Account appears on risk registries.', 'Do not send money to this account.']
  if (verdict === 'review') return ['Some community reports are pending review.', 'Confirm the recipient before a large transfer.']
  return ['No risk indicators found for this account.']
}

function varsFor(reason: string): { tier: string; maskedName: string | null } {
  return {
    tier: reason.includes('blocklist') ? 'Watchlist — Official' : 'Watchlist — Community',
    maskedName: null,
  }
}

export function demoScan(account: string, bank: string): ScanResult {
  const hit = DEMO_FLAGGED[account]
  const verdict: Verdict = hit?.verdict ?? 'safe'
  const reason = hit?.reason
  const { tier, maskedName } = reason ? varsFor(reason) : {
    tier: verdict === 'safe' ? 'Clean' : verdict === 'review' ? 'Watchlist — Community' : 'Watchlist — Official',
    maskedName: null,
  }
  return {
    verdict,
    score: scoreFor(verdict),
    tier,
    maskedName,
    reasons: reasonsFor(verdict, reason),
    account,
    bank,
    source: 'demo',
  }
}

export interface LiveAccount {
  account_number: string
  bank_name: string
  overall_risk_level: 'safe' | 'warning' | 'high_risk' | null
  account_name: string | null
  flagged_reason: string | null
  total_reports: number | null
  is_verified_business: boolean | null
}

function liveToVerdict(level: LiveAccount['overall_risk_level']): Verdict {
  if (level === 'high_risk') return 'block'
  if (level === 'warning') return 'review'
  return 'safe'
}

export function liveToResult(row: LiveAccount, account: string, bank: string): ScanResult {
  const verdict = liveToVerdict(row.overall_risk_level)
  const blocked = verdict === 'block'
  const reasons: string[] = []
  if (row.flagged_reason) reasons.push(row.flagged_reason)
  if (row.total_reports && row.total_reports > 0) {
    reasons.push(blocked ? `Flagged by ${row.total_reports} community reports.` : `${row.total_reports} community report(s) reference this account.`)
  }
  if (reasons.length === 0) reasons.push('No risk indicators found for this account.')
  return {
    verdict,
    score: scoreFor(verdict),
    tier: blocked ? 'Watchlist — Official' : verdict === 'review' ? 'Watchlist — Community' : row.is_verified_business ? 'Verified Business' : 'Clean',
    maskedName: row.account_name ? maskName(row.account_name) : null,
    reasons,
    account,
    bank,
    source: 'live',
  }
}
