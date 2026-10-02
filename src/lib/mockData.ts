import type { RiskLevel } from './riskEngine'

export interface MockAccountRecord {
  accountNumber: string
  bankName: string
  totalReports: number
  overallRiskLevel: RiskLevel
  isVerifiedBusiness: boolean
  accountName?: string | null
  flaggedReason?: string | null
}

const MOCK_ACCOUNTS: MockAccountRecord[] = [
  { accountNumber: '0106661087', bankName: 'Access', totalReports: 12, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: 'Tamaraudeinyefa Brakekebebe', flaggedReason: 'EFCC conviction - cybercrime/money laundering' },
  { accountNumber: '2650121856', bankName: 'Zenith', totalReports: 12, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: 'Tamaraudeinyefa Brakekebebe', flaggedReason: 'EFCC conviction - cybercrime/money laundering' },
  { accountNumber: '4068151050', bankName: 'Zenith', totalReports: 8, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: 'Godday Brakekebebe', flaggedReason: 'EFCC conviction - money laundering' },
  { accountNumber: '2018650772', bankName: 'Kuda', totalReports: 6, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: 'Terhemba Josiah Asagh', flaggedReason: 'EFCC conviction - romance fraud $300k' },
  { accountNumber: '2400818519', bankName: 'Zenith', totalReports: 5, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: null, flaggedReason: 'EFCC conviction - internet fraud' },
  { accountNumber: '4883945011', bankName: 'FCMB', totalReports: 4, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: null, flaggedReason: 'EFCC conviction - internet fraud' },
  { accountNumber: '2253820008', bankName: 'Zenith', totalReports: 3, overallRiskLevel: 'warning', isVerifiedBusiness: false, accountName: null, flaggedReason: 'EFCC arraigned - romance fraud' },
  { accountNumber: '2266267081', bankName: 'Zenith', totalReports: 2, overallRiskLevel: 'warning', isVerifiedBusiness: false, accountName: null, flaggedReason: 'EFCC arraigned - advance fee fraud' },
  { accountNumber: '2089912234', bankName: 'OPay', totalReports: 15, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: null, flaggedReason: 'Multiple Instagram vendor scams reported' },
  { accountNumber: '1022237890', bankName: 'PalmPay', totalReports: 8, overallRiskLevel: 'high_risk', isVerifiedBusiness: false, accountName: null, flaggedReason: 'Crypto P2P fraud - victims lost ₦2.5M' },
  { accountNumber: '3021987654', bankName: 'GTBank', totalReports: 4, overallRiskLevel: 'warning', isVerifiedBusiness: false, accountName: null, flaggedReason: 'Job phishing scheme reported' },
  { accountNumber: '3045567812', bankName: 'Access', totalReports: 3, overallRiskLevel: 'warning', isVerifiedBusiness: false, accountName: null, flaggedReason: 'POS reversal scam reported' },
  { accountNumber: '1234567890', bankName: 'OPay', totalReports: 0, overallRiskLevel: 'safe', isVerifiedBusiness: false, accountName: 'Chisom Okafor' },
  { accountNumber: '9876543210', bankName: 'GTB', totalReports: 0, overallRiskLevel: 'safe', isVerifiedBusiness: true, accountName: 'Deolu Adeyemi Ventures Ltd' },
  { accountNumber: '5555555555', bankName: 'Kuda', totalReports: 1, overallRiskLevel: 'warning', isVerifiedBusiness: false, accountName: null, flaggedReason: 'Single user report - verify carefully' },
]

export function getMockAccount(accountNumber: string, bankName: string): MockAccountRecord | null {
  const match = MOCK_ACCOUNTS.find(
    a => a.accountNumber === accountNumber && a.bankName.toLowerCase() === bankName.toLowerCase()
  )
  if (match) return match
  return null
}

export interface PaystackMockData {
  transactionCount: number
  accountTier: 'basic' | 'verified' | 'business'
  hasPriorTransactions: boolean
  averageTransactionAmount: number
  accountAgeDays: number
}

export function getPaystackMock(accountNumber: string): PaystackMockData {
  const hash = accountNumber.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return {
    transactionCount: hash % 20,
    accountTier: hash % 3 === 0 ? 'basic' : hash % 3 === 1 ? 'verified' : 'business',
    hasPriorTransactions: hash % 5 !== 0,
    averageTransactionAmount: 10000 + (hash % 10) * 5000,
    accountAgeDays: 30 + (hash % 365),
  }
}
