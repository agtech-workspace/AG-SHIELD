import { ESCALATION_THRESHOLD, HIGH_AMOUNT_THRESHOLD, RISK_THRESHOLDS } from './constants'

export type RiskLevel = 'safe' | 'warning' | 'high_risk'

export interface RiskInput {
  totalReports: number
  isVerifiedBusiness: boolean
  accountName?: string | null
  flaggedReason?: string | null
  transferAmount: number
  isNewRecipient: boolean
  nameResolved: boolean
  accountExists: boolean
}

export interface RiskOutput {
  risk: RiskLevel
  score: number
  reasons: string[]
  socialProof?: string
}

const REPORT_THRESHOLDS = [
  { max: 0, points: 0 },
  { max: 2, points: 20 },
  { max: 5, points: 40 },
  { max: Infinity, points: RISK_THRESHOLDS.REPORT_MAX_POINTS },
] as const

function reportsToPoints(count: number): number {
  for (const t of REPORT_THRESHOLDS) {
    if (count <= t.max) return t.points
  }
  return RISK_THRESHOLDS.REPORT_MAX_POINTS
}

export function getScoreLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.HIGH_RISK_MIN) return 'high_risk'
  if (score >= RISK_THRESHOLDS.WARNING_MIN) return 'warning'
  return 'safe'
}

export function processRisk(input: RiskInput): RiskOutput {
  const reasons: string[] = []
  let score = 0

  const reportPoints = reportsToPoints(input.totalReports)
  if (reportPoints > 0) {
    score += reportPoints
    if (input.totalReports >= ESCALATION_THRESHOLD) {
      reasons.push(`Flagged by ${input.totalReports} community reports as dangerous`)
    } else {
      reasons.push(`Account has ${input.totalReports} community report(s)`)
    }
  }

  if (input.flaggedReason) {
    score += RISK_THRESHOLDS.FLAGGED_POINTS
    reasons.push(input.flaggedReason)
  }

  if (!input.nameResolved && !input.accountExists) {
    score += RISK_THRESHOLDS.NAME_UNVERIFIED_POINTS
    if (input.totalReports > 0) {
      reasons.push('Account flagged in community reports — names could not be verified')
    } else {
      reasons.push('Account could not be verified in public databases — proceed with caution')
    }
  } else if (input.nameResolved && reportPoints === 0 && !input.flaggedReason) {
    reasons.push('Account name verified successfully — account exists')
  } else if (!input.nameResolved && input.accountExists) {
    reasons.push('Account found in database — name verification pending')
  }

  if (input.isNewRecipient) {
    score += RISK_THRESHOLDS.NEW_RECIPIENT_POINTS
    reasons.push('New recipient — no prior history with this account')
  }

  if (input.transferAmount >= HIGH_AMOUNT_THRESHOLD) {
    score += RISK_THRESHOLDS.HIGH_AMOUNT_POINTS
    reasons.push('Transfer amount is unusually high')
  }

  if (input.isVerifiedBusiness) {
    score = Math.max(0, score + RISK_THRESHOLDS.VERIFIED_BUSINESS_DISCOUNT)
    reasons.push('Verified business profile — adds credibility')
  }

  if (!reasons.length) {
    reasons.push('No negative history found — account appears safe')
  }

  const risk = getScoreLevel(score)
  const socialProof = input.totalReports >= ESCALATION_THRESHOLD
    ? `${input.totalReports} people flagged this account recently`
    : input.totalReports > 0
    ? `${input.totalReports} community report(s) found for this account`
    : input.accountExists
    ? 'Account has no negative history in our database'
    : 'No reports found — first time this account has been checked'

  return { risk, score, reasons, socialProof }
}
