import { processRisk, type RiskInput, type RiskOutput } from './riskEngine'

export type TrueClass = 'risky' | 'safe'

export interface LabeledRecord {
  id: string
  input: RiskInput
  trueClass: TrueClass
}

export interface ConfusionRow {
  id: string
  trueClass: TrueClass
  predicted: RiskOutput['risk']
  score: number
  isTruePositive: boolean
  isTrueNegative: boolean
  isFalsePositive: boolean
  isFalseNegative: boolean
}

export interface ConfusionMatrix {
  truePositives: number
  trueNegatives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  f1: number
  falsePositiveRate: number
  rows: ConfusionRow[]
}

export function isDangerous(risk: string): boolean {
  return risk === 'high_risk' || risk === 'warning'
}

function baseInput(over: Partial<RiskInput>): RiskInput {
  return {
    totalReports: 0,
    isVerifiedBusiness: false,
    accountName: null,
    flaggedReason: null,
    transferAmount: 5000,
    isNewRecipient: false,
    nameResolved: true,
    accountExists: true,
    ...over,
  }
}

/**
 * Sandbox ground-truth set. "Risky" records are known-flag accounts
 * (EFCC / community escalation); "safe" records are clean accounts that
 * must NOT be wrongly flagged. Used by the confusion-matrix regression
 * tests to guarantee the engine treats FP and FN correctly.
 */
export const SANDBOX_LABELED_SET: LabeledRecord[] = [
  // ---- risky: EFCC conviction / community escalation ----
  { id: 'efcc-0106661087', trueClass: 'risky', input: baseInput({ totalReports: 12, flaggedReason: 'EFCC conviction - cybercrime/money laundering', accountName: 'Tamaraudeinyefa Brakekebebe' }) },
  { id: 'efcc-2650121856', trueClass: 'risky', input: baseInput({ totalReports: 12, flaggedReason: 'EFCC conviction - cybercrime/money laundering' }) },
  { id: 'efcc-4068151050', trueClass: 'risky', input: baseInput({ totalReports: 8, flaggedReason: 'EFCC conviction - money laundering' }) },
  { id: 'efcc-2018650772', trueClass: 'risky', input: baseInput({ totalReports: 6, flaggedReason: 'EFCC conviction - romance fraud $300k' }) },
  { id: 'efcc-2400818519', trueClass: 'risky', input: baseInput({ totalReports: 5, flaggedReason: 'EFCC conviction - internet fraud' }) },
  { id: 'efcc-4883945011', trueClass: 'risky', input: baseInput({ totalReports: 4, flaggedReason: 'EFCC conviction - internet fraud' }) },
  { id: 'comm-2089912234', trueClass: 'risky', input: baseInput({ totalReports: 15, flaggedReason: 'Multiple Instagram vendor scams reported' }) },
  { id: 'comm-1022237890', trueClass: 'risky', input: baseInput({ totalReports: 8, flaggedReason: 'Crypto P2P fraud - victims lost ₦2.5M' }) },
  { id: 'efcc-arraigned-2253820008', trueClass: 'risky', input: baseInput({ totalReports: 3, flaggedReason: 'EFCC arraigned - romance fraud' }) },
  { id: 'efcc-arraigned-2266267081', trueClass: 'risky', input: baseInput({ totalReports: 2, flaggedReason: 'EFCC arraigned - advance fee fraud' }) },
  { id: 'comm-3021987654', trueClass: 'risky', input: baseInput({ totalReports: 4, flaggedReason: 'Job phishing scheme reported' }) },
  { id: 'comm-3045567812', trueClass: 'risky', input: baseInput({ totalReports: 3, flaggedReason: 'POS reversal scam reported' }) },
  // risky with zero negative history is impossible in reality — omitted by design.

  // ---- safe: clean accounts that must not be flagged ----
  { id: 'safe-1234567890', trueClass: 'safe', input: baseInput({ totalReports: 0, accountName: 'Chisom Okafor' }) },
  { id: 'safe-9876543210', trueClass: 'safe', input: baseInput({ totalReports: 0, isVerifiedBusiness: true, accountName: 'Deolu Adeyemi Ventures Ltd' }) },
  // high-value transfer to a clean, verified recipient must stay safe (FP trap)
  { id: 'safe-highamount', trueClass: 'safe', input: baseInput({ totalReports: 0, transferAmount: 200000, isVerifiedBusiness: true, accountName: 'Deolu Adeyemi Ventures Ltd' }) },
  // new recipient but clean verified account stays safe
  { id: 'safe-newrecipient', trueClass: 'safe', input: baseInput({ totalReports: 0, isNewRecipient: true, accountName: 'Chisom Okafor' }) },
  // account exists in DB but name not yet resolved — informational, not a flag
  { id: 'safe-nameless', trueClass: 'safe', input: baseInput({ totalReports: 0, accountName: null, nameResolved: false, accountExists: true }) },
]

export function buildMatrix(records: LabeledRecord[]): ConfusionMatrix {
  let truePositives = 0
  let trueNegatives = 0
  let falsePositives = 0
  let falseNegatives = 0

  const rows: ConfusionRow[] = records.map((record) => {
    const out = processRisk(record.input)
    const dangerous = isDangerous(out.risk)
    const isTP = record.trueClass === 'risky' && dangerous
    const isFP = record.trueClass === 'safe' && dangerous
    const isTN = record.trueClass === 'safe' && !dangerous
    const isFN = record.trueClass === 'risky' && !dangerous
    if (isTP) truePositives += 1
    else if (isFP) falsePositives += 1
    else if (isTN) trueNegatives += 1
    else if (isFN) falseNegatives += 1
    return {
      id: record.id,
      trueClass: record.trueClass,
      predicted: out.risk,
      score: out.score,
      isTruePositive: isTP,
      isTrueNegative: isTN,
      isFalsePositive: isFP,
      isFalseNegative: isFN,
    }
  })

  const precision = truePositives + falsePositives === 0 ? 1 : truePositives / (truePositives + falsePositives)
  const recall = truePositives + falseNegatives === 0 ? 1 : truePositives / (truePositives + falseNegatives)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  const falsePositiveRate = trueNegatives + falsePositives === 0 ? 0 : falsePositives / (trueNegatives + falsePositives)

  return {
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    falsePositiveRate: round(falsePositiveRate),
    rows,
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}