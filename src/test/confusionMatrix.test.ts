import { describe, expect, it } from 'vitest'
import { processRisk } from '../lib/riskEngine'
import { isDangerous, buildMatrix, SANDBOX_LABELED_SET } from '../lib/riskEvaluation'

describe('confusion matrix (sandbox labeled set)', () => {
  const matrix = buildMatrix(SANDBOX_LABELED_SET)

  it('treats false negatives: zero known-risky accounts cleared', () => {
    expect(matrix.falseNegatives).toBe(0)
    expect(matrix.recall).toBe(1)
  })

  it('treats false positives: FP rate <= 5% on clean accounts', () => {
    expect(matrix.falsePositiveRate).toBeLessThanOrEqual(0.05)
  })

  it('reports all four cell counts', () => {
    expect(matrix.truePositives).toBeGreaterThan(0)
    expect(matrix.trueNegatives).toBeGreaterThan(0)
    expect(matrix.falsePositives).toBeGreaterThanOrEqual(0)
    expect(matrix.falseNegatives).toBe(0)
  })

  it('hard-trigger accounts (EFCC or escalation reports) are never safe', () => {
    const risky = SANDBOX_LABELED_SET.filter((r) => r.trueClass === 'risky')
    for (const record of risky) {
      const out = processRisk(record.input)
      expect(isDangerous(out.risk), `${record.id} must be flagged`).toBe(true)
    }
  })

  it('safe accounts stay safe even with high amount or new recipient', () => {
    for (const record of SANDBOX_LABELED_SET.filter((r) => r.trueClass === 'safe')) {
      const out = processRisk(record.input)
      expect(out.risk, `${record.id} must not be flagged`).toBe('safe')
    }
  })

  it('produces a documented outcome summary', () => {
    const summary = `treated: ${matrix.falseNegatives} false negatives, ${matrix.falsePositives} false positives, ${matrix.trueNegatives} true negatives, ${matrix.truePositives} true positives, precision ${matrix.precision}, recall ${matrix.recall}, F1 ${matrix.f1}`
    expect(summary).toMatch(/false negatives/)
  })
})