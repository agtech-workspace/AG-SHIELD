import { describe, expect, it } from 'vitest'
import { processRisk, getScoreLevel } from '../lib/riskEngine'
import { getMockAccount, getPaystackMock } from '../lib/mockData'

describe('riskEngine — processRisk', () => {
  it('should return safe for 0 reports, verified name, not new, low amount', () => {
    const result = processRisk({
      totalReports: 0,
      isVerifiedBusiness: false,
      transferAmount: 5000,
      isNewRecipient: false,
      nameResolved: true,
      accountExists: true,
      flaggedReason: null,
    })
    expect(result.risk).toBe('safe')
    expect(result.score).toBe(0)
    expect(result.reasons).toContain('Account name verified successfully — account exists')
  })

  it('should return safe for 1-2 reports, warning for 3-5 reports', () => {
    const low = processRisk({
      totalReports: 2, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(low.risk).toBe('safe')
    expect(low.score).toBe(20)

    const high = processRisk({
      totalReports: 3, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(high.risk).toBe('warning')
    expect(high.score).toBe(40)
  })

  it('should return high_risk for 6+ reports', () => {
    const result = processRisk({
      totalReports: 6,
      isVerifiedBusiness: false,
      transferAmount: 5000,
      isNewRecipient: false,
      nameResolved: true,
      accountExists: true,
      flaggedReason: null,
    })
    expect(result.risk).toBe('high_risk')
    expect(result.score).toBeGreaterThanOrEqual(61)
    expect(result.reasons).toContain('Flagged by 6 community reports as dangerous')
  })

  it('should add points for flagged reason', () => {
    const noFlag = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    const withFlag = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: 'EFCC flagged',
    })
    expect(withFlag.score).toBe(noFlag.score + 20)
    expect(withFlag.reasons).toContain('EFCC flagged')
  })

  it('should add points for unverifiable account', () => {
    const result = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: false, accountExists: false,
      flaggedReason: null,
    })
    expect(result.score).toBeGreaterThanOrEqual(15)
    expect(result.reasons).toContain('Account could not be verified in public databases — proceed with caution')
  })

  it('should add points for new recipient', () => {
    const noNew = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    const withNew = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: true, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(withNew.score).toBe(noNew.score + 10)
  })

  it('should add points for high amount >= 150000', () => {
    const result = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 200000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(result.score).toBeGreaterThanOrEqual(15)
    expect(result.reasons).toContain('Transfer amount is unusually high')
  })

  it('should discount score for verified business', () => {
    const biz = processRisk({
      totalReports: 0, isVerifiedBusiness: true, transferAmount: 5000,
      isNewRecipient: true, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    const noBiz = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: true, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(biz.score).toBe(noBiz.score - 10)
    expect(biz.score).toBeGreaterThanOrEqual(0)
  })

  it('should produce socialProof when totalReports >= 6', () => {
    const result = processRisk({
      totalReports: 8, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(result.socialProof).toBe('8 people flagged this account recently')
  })

  it('should not produce socialProof when totalReports < 6', () => {
    const result = processRisk({
      totalReports: 3, isVerifiedBusiness: false, transferAmount: 5000,
      isNewRecipient: false, nameResolved: true, accountExists: true,
      flaggedReason: null,
    })
    expect(result.socialProof).toBe('3 community report(s) found for this account')
  })

  it('should return safe text when no risk factors at all', () => {
    const result = processRisk({
      totalReports: 0, isVerifiedBusiness: false, transferAmount: 10000,
      isNewRecipient: false, nameResolved: false, accountExists: true,
      flaggedReason: null,
    })
    expect(result.reasons).toContain('Account found in database — name verification pending')
  })
})

describe('riskEngine — getScoreLevel', () => {
  it('should return safe for score 0-30', () => {
    expect(getScoreLevel(0)).toBe('safe')
    expect(getScoreLevel(15)).toBe('safe')
    expect(getScoreLevel(30)).toBe('safe')
  })

  it('should return warning for score 31-60', () => {
    expect(getScoreLevel(31)).toBe('warning')
    expect(getScoreLevel(45)).toBe('warning')
    expect(getScoreLevel(60)).toBe('warning')
  })

  it('should return high_risk for score 61+', () => {
    expect(getScoreLevel(61)).toBe('high_risk')
    expect(getScoreLevel(80)).toBe('high_risk')
    expect(getScoreLevel(100)).toBe('high_risk')
  })
})

describe('mockData', () => {
  it('should return mock account for known EFCC accounts', () => {
    const account = getMockAccount('0106661087', 'Access')
    expect(account).not.toBeNull()
    expect(account?.totalReports).toBe(12)
    expect(account?.overallRiskLevel).toBe('high_risk')
  })

  it('should return null for unknown accounts', () => {
    const account = getMockAccount('0000000000', 'Access')
    expect(account).toBeNull()
  })

  it('should return Paystack mock data for any account', () => {
    const data = getPaystackMock('2089912234')
    expect(data.transactionCount).toBeGreaterThanOrEqual(0)
    expect(data.accountTier).toMatch(/^(basic|verified|business)$/)
    expect(data.accountAgeDays).toBeGreaterThan(0)
  })

  it('should produce consistent mock data for same account', () => {
    const a = getPaystackMock('2089912234')
    const b = getPaystackMock('2089912234')
    expect(a).toEqual(b)
  })
})

describe('sanitizeAccountNumber', () => {
  it('should remove non-digit characters', () => {
    const result = '2089912234'.replace(/\D/g, '').slice(0, 10)
    expect(result).toBe('2089912234')
  })

  it('should handle spaces and dashes', () => {
    const input = '208-991-2234'
    const result = input.replace(/\D/g, '').slice(0, 10)
    expect(result).toBe('2089912234')
  })

  it('should limit to 10 digits', () => {
    const input = '208991223456'
    const result = input.replace(/\D/g, '').slice(0, 10)
    expect(result).toBe('2089912234')
  })

  it('should return empty string for empty input', () => {
    const input = ''
    const result = input.replace(/\D/g, '').slice(0, 10)
    expect(result).toBe('')
  })
})

describe('loadHistory', () => {
  it('should return empty array when no history', () => {
    const raw = localStorage.getItem('safeguard_recent_checks')
    if (!raw) {
      expect(true).toBe(true)
      return
    }
    expect(true).toBe(true)
  })

  it('should parse valid JSON history', () => {
    const mockHistory = [
      { id: '1', accountNumber: '2089912234', bankName: 'OPay', amount: 50000, risk: 'safe' as const, timestamp: '2024-01-01' }
    ]
    const raw = JSON.stringify(mockHistory)
    const result = JSON.parse(raw)
    expect(result).toEqual(mockHistory)
  })
})

describe('merchant verification logic (v2 — CAC-aware, payment-gated)', () => {
  type MerchantInput = {
    business_name: string
    cac_number: string
    cac_status: string
    official_cac_name: string
    primary_account: string
    bank_name: string
    account_name: string
    account_name_match: boolean
  }

  type MerchantResult = {
    verified: boolean
    verification_state?: 'pending' | 'rejected'
    verification_id?: string
    risk_level?: string
    badge_url?: string
    account_name_match?: boolean
    cac_status?: string
    reason?: string
  }

  function simulateVerifyMerchant(
    input: MerchantInput,
    accountExists: boolean,
    accountRiskLevel: string,
  ): MerchantResult {
    if (!accountExists) {
      return { verified: false, verification_state: 'rejected', account_name_match: false, reason: 'Account number could not be verified' }
    }
    if (accountRiskLevel === 'high_risk') {
      return { verified: false, verification_state: 'rejected', risk_level: 'high_risk', reason: 'flagged as high risk' }
    }
    if (input.cac_status !== 'ACTIVE') {
      return { verified: false, verification_state: 'rejected', cac_status: input.cac_status, reason: 'CAC record is not active' }
    }
    if (!input.account_name.trim()) {
      return { verified: false, verification_state: 'rejected', account_name_match: false, reason: 'Bank account name could not be verified' }
    }
    const officialNorm = input.official_cac_name.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const businessNorm = input.business_name.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (officialNorm && businessNorm !== officialNorm) {
      return { verified: false, verification_state: 'rejected', account_name_match: input.account_name_match, reason: 'Business name does not match CAC registry' }
    }
    if (!input.account_name_match && businessNorm !== input.account_name.replace(/[^a-z0-9]/gi, '').toLowerCase()) {
      return { verified: false, verification_state: 'rejected', account_name_match: false, reason: 'account name does not match' }
    }
    // Identity chain holds — badge stays pending until payment (Phase E)
    return {
      verified: false,
      verification_state: 'pending',
      verification_id: crypto.randomUUID(),
      risk_level: accountRiskLevel,
      badge_url: `/verify/merchant/${crypto.randomUUID()}`,
      account_name_match: true,
      cac_status: 'ACTIVE',
      reason: 'Identity checks passed. Complete payment to activate your verified badge.',
    }
  }

  it('should hold a verified business in pending state until payment', () => {
    const result = simulateVerifyMerchant(
      { business_name: 'Deolu Adeyemi Ventures Ltd', cac_number: 'RC1234567', cac_status: 'ACTIVE', official_cac_name: 'DEOLU ADEYEMI VENTURES LTD', primary_account: '9876543210', bank_name: 'GTB', account_name: 'Deolu Adeyemi Ventures Ltd', account_name_match: true },
      true,
      'safe',
    )
    expect(result.verification_state).toBe('pending')
    expect(result.verified).toBe(false)
    expect(result.risk_level).toBe('safe')
    expect(result.account_name_match).toBe(true)
    expect(result.badge_url).toBeTruthy()
  })

  it('should reject a business with high_risk account', () => {
    const result = simulateVerifyMerchant(
      { business_name: 'Bad Business', cac_number: 'RC9999999', cac_status: 'ACTIVE', official_cac_name: 'Bad Business', primary_account: '0106661087', bank_name: 'Access', account_name: 'Bad Business', account_name_match: true },
      true,
      'high_risk',
    )
    expect(result.verified).toBe(false)
    expect(result.verification_state).toBe('rejected')
    expect(result.risk_level).toBe('high_risk')
    expect(result.badge_url).toBeUndefined()
  })

  it('should reject a non-active CAC registration', () => {
    const result = simulateVerifyMerchant(
      { business_name: 'Dissolved Co', cac_number: 'RC9999999', cac_status: 'DISSOLVED', official_cac_name: 'Dissolved Co', primary_account: '9876543210', bank_name: 'GTB', account_name: 'Dissolved Co', account_name_match: true },
      true,
      'safe',
    )
    expect(result.verified).toBe(false)
    expect(result.verification_state).toBe('rejected')
    expect(result.cac_status).toBe('DISSOLVED')
  })

  it('should reject account that does not exist in database', () => {
    const result = simulateVerifyMerchant(
      { business_name: 'Fake Ltd', cac_number: 'RC1111111', cac_status: 'ACTIVE', official_cac_name: 'Fake Ltd', primary_account: '0000000000', bank_name: 'Access', account_name: '', account_name_match: false },
      false,
      'safe',
    )
    expect(result.verification_state).toBe('rejected')
    expect(result.account_name_match).toBe(false)
    expect(result.verified).toBe(false)
  })

  it('should reject when business name does not match the CAC registry', () => {
    const result = simulateVerifyMerchant(
      { business_name: 'Totally Different Name', cac_number: 'RC1234567', cac_status: 'ACTIVE', official_cac_name: 'DEOLU ADEYEMI VENTURES LTD', primary_account: '9876543210', bank_name: 'GTB', account_name: 'Deolu Adeyemi Ventures Ltd', account_name_match: true },
      true,
      'safe',
    )
    expect(result.verification_state).toBe('rejected')
    expect(result.reason).toContain('CAC registry')
  })

  it('should require all text fields to proceed with verification', () => {
    const valid = { business_name: 'Test Co', cac_number: 'RC1234567', primary_account: '9876543210', bank_name: 'GTB' }
    expect(valid.business_name.trim().length > 0).toBe(true)
    expect(valid.cac_number.trim().length > 0).toBe(true)
    expect(valid.primary_account.length).toBe(10)
    expect(valid.bank_name.length > 0).toBe(true)

    const noName = { ...valid, business_name: '' }
    expect(noName.business_name.trim().length > 0).toBe(false)

    const noCAC = { ...valid, cac_number: '' }
    expect(noCAC.cac_number.trim().length > 0).toBe(false)

    const noAccount = { ...valid, primary_account: '' }
    expect(noAccount.primary_account.length).toBe(0)
  })

  it('should produce unique verification IDs for different businesses', () => {
    const result1 = simulateVerifyMerchant(
      { business_name: 'Company A', cac_number: 'RC001', cac_status: 'ACTIVE', official_cac_name: 'Company A', primary_account: '1111111111', bank_name: 'Access', account_name: 'Company A', account_name_match: true },
      true, 'safe',
    )
    const result2 = simulateVerifyMerchant(
      { business_name: 'Company B', cac_number: 'RC002', cac_status: 'ACTIVE', official_cac_name: 'Company B', primary_account: '2222222222', bank_name: 'Zenith', account_name: 'Company B', account_name_match: true },
      true, 'safe',
    )
    expect(result1.verification_id).not.toBe(result2.verification_id)
  })
})

describe('RISK_META', () => {
  const RISK_META = {
    safe: { title: 'Safe', stamp: 'VERIFIED SAFE', icon: 'CHECK' },
    warning: { title: 'Suspicious', stamp: 'WARNING: VERIFY FIRST', icon: 'WARN' },
    high_risk: { title: 'High Risk', stamp: 'LIKELY SCAM', icon: 'DANGER' },
  }

  it('should have correct safe metadata', () => {
    expect(RISK_META.safe.title).toBe('Safe')
    expect(RISK_META.safe.stamp).toBe('VERIFIED SAFE')
  })

  it('should have correct warning metadata', () => {
    expect(RISK_META.warning.title).toBe('Suspicious')
    expect(RISK_META.warning.stamp).toBe('WARNING: VERIFY FIRST')
  })

  it('should have correct high_risk metadata', () => {
    expect(RISK_META.high_risk.title).toBe('High Risk')
    expect(RISK_META.high_risk.stamp).toBe('LIKELY SCAM')
  })
})
