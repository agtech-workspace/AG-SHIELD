import type { Step } from 'react-joyride'

export const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="brand"]',
    content: 'Your first line of defense against bank transfer fraud. Check any Nigerian bank account for scam risk in seconds.',
    title: 'Welcome to AG Shield',
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '[data-tour="scan-input"]',
    content: 'Paste a suspicious account number here. AG Shield cross-references it against scam reports and returns an instant risk score. Try one below!',
    title: 'Check Any Account',
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '[data-tour="check-btn"]',
    content: 'Click Check to see the account name, bank, and risk rating — Safe, Suspicious, or Dangerous.',
    title: 'One Click to Verify',
    placement: 'left',
    skipBeacon: true,
  },
  {
    target: '[data-tour="result-card"]',
    content: 'The gauge shows the score. Below are risk factors and safety advice tailored to this specific result.',
    title: 'Your Risk Result',
    placement: 'top',
    skipBeacon: true,
  },
  {
    target: '[data-tour="reports-form"]',
    content: 'If you encounter a scam, report it here. Your report helps protect the entire community.',
    title: 'Report Scammers',
    placement: 'bottom',
    skipBeacon: true,
  },
  {
    target: '[data-tour="community-feed"]',
    content: 'See live scam alerts and recent reports from other users. Stay informed about the latest threats.',
    title: 'Community Alerts',
    placement: 'top',
    skipBeacon: true,
  },
  {
    target: '[data-tour="settings-area"]',
    content: 'Customize your profile, manage notifications, and access help. You are ready to start. Your first check is free.',
    title: 'You\'re All Set',
    placement: 'top',
    skipBeacon: true,
  },
]

export const TOUR_LOCALE = {
  skip: 'Skip tour',
  next: 'Next',
  last: 'Start checking accounts',
}
