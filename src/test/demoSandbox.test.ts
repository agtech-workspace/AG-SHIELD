import { describe, it, expect, beforeEach } from 'vitest'
import {
  createDemoSession,
  setDemoSession,
  getDemoSession,
  clearDemoSession,
} from '../lib/demoAuth'
import {
  sandboxCacLookup,
  demoVerifyMerchant,
  type MerchantResult,
} from '../lib/cacSandbox'

describe('demo auth (VITE_AUTH_MODE=demo)', () => {
  beforeEach(() => localStorage.clear())

  it('creates a usable mock session with nickname from metadata', () => {
    const session = createDemoSession('ada@shield.local', 'Ada Okafor')
    expect(session.user.id).toBe('demo-user-id')
    expect(session.user.email).toBe('ada@shield.local')
    expect(session.user.user_metadata?.nickname).toBe('Ada Okafor')
    expect(session.access_token).toBeTruthy()
  })

  it('persists and restores the demo session across reloads', () => {
    setDemoSession(createDemoSession('ada@shield.local'))
    const restored = getDemoSession()
    expect(restored?.user.email).toBe('ada@shield.local')
    clearDemoSession()
    expect(getDemoSession()).toBeNull()
  })
})

describe('CAC sandbox (verify-cac offline mirror)', () => {
  it('finds an ACTIVE company by numbers in RC format', () => {
    const out = sandboxCacLookup('number', '1234567', 'RC', '')
    expect(out.status).toBe('found')
    expect(out.results[0].company_name).toBe('Deolu Adeyemi Ventures Ltd')
    expect(out.results[0].status).toBe('ACTIVE')
  })

  it('returns not_found for unknown numbers', () => {
    const out = sandboxCacLookup('number', '0000000', 'RC', '')
    expect(out.status).toBe('not_found')
    expect(out.count).toBe(0)
  })

  it('searches names and surfaces DISSOLVED registrations', () => {
    const out = sandboxCacLookup('search', '', 'ALL', 'WestBridge')
    expect(out.count).toBe(1)
    expect(out.results[0].status).toBe('DISSOLVED')
  })
})

describe('demo verify_merchant mirror (migration 20260918000003 gate)', () => {
  const happyInput = {
    business_name: 'Deolu Adeyemi Ventures Ltd',
    primary_account: '9876543210',
    bank_name: 'GTB',
    cac_number: 'RC1234567',
    cac_status: 'ACTIVE',
    official_cac_name: 'Deolu Adeyemi Ventures Ltd',
    account_name: 'Deolu Adeyemi Ventures Ltd',
  }

  it('holds an identity-matching merchant pending until payment', () => {
    const result = demoVerifyMerchant(happyInput)
    expect(result.verification_state).toBe('pending')
    expect(result.account_name_match).toBe(true)
    expect(result.risk_level).toBe('safe')
    expect(result.badge_url).toMatch(/shield\.agtech\.ng\/verify\//)
    expect(result.verification_id).toBeTruthy()
  })

  it('rejects a high-risk account even with valid CAC', () => {
    const result = demoVerifyMerchant({
      ...happyInput,
      primary_account: '0106661087',
      bank_name: 'Access',
    })
    expect(result.verification_state).toBe('rejected')
    expect(result.risk_level).toBe('high_risk')
  })

  it('rejects a non-active CAC registration', () => {
    const result = demoVerifyMerchant({
      ...happyInput,
      cac_status: 'DISSOLVED',
    })
    expect(result.verification_state).toBe('rejected')
    expect(result.cac_status).toBe('DISSOLVED')
  })

  it('rejects when the submitted name differs from the CAC registry', () => {
    const result = demoVerifyMerchant({
      ...happyInput,
      business_name: 'Totally Different Name',
    })
    expect(result.verification_state).toBe('rejected')
    expect(result.reason).toContain('CAC registry')
  })

  it('rejects an account that cannot be verified', () => {
    const result = demoVerifyMerchant({
      ...happyInput,
      primary_account: '0000000000',
      bank_name: 'GTB',
      account_name: '',
    })
    expect(result.verification_state).toBe('rejected')
    expect(result.reason).toContain('could not be verified')
  })

  it('rejects when the resolved bank account name does not match', () => {
    const result: MerchantResult = demoVerifyMerchant({
      ...happyInput,
      primary_account: '1234567890',
      bank_name: 'OPay',
      account_name: 'Chisom Okafor',
    })
    expect(result.verification_state).toBe('rejected')
    expect(result.reason).toContain('bank account name')
  })
})