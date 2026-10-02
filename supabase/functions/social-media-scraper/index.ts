// Mock social media ingestion for SafeGuard demo.
// Deploy as Supabase Edge Function and invoke via cron/manual trigger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ScrapedSignal = {
  account_number: string
  bank_name: string
  description: string
}

function hasScamContext(text: string) {
  const lower = text.toLowerCase()
  return (
    lower.includes('#scamalertng') ||
    lower.includes('#nibss') ||
    lower.includes('#fraudalert') ||
    lower.includes('scam') ||
    lower.includes('fraud')
  )
}

function extractSignalsFromContent(content: string, bankName: string): ScrapedSignal[] {
  if (!hasScamContext(content) || !content.toLowerCase().includes(bankName.toLowerCase())) return []
  const accountMatches = Array.from(content.matchAll(/\b\d{10}\b/g)).map((m) => m[0])
  const unique = [...new Set(accountMatches)]
  return unique.map((account) => ({
    account_number: account,
    bank_name: bankName,
    description: content.slice(0, 500),
  }))
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Bank-name-led polling simulation.
  const sourceByBank: Record<string, string[]> = {
    OPay: ['https://x.com/search?q=%23ScamAlertNG+OPay&f=live'],
    PalmPay: ['https://x.com/search?q=%23FraudAlert+PalmPay&f=live'],
    Access: ['https://x.com/search?q=%23NIBSS+Access+bank&f=live'],
  }

  const fallbackContentByBank: Record<string, string> = {
    OPay: '#ScamAlertNG OPay account 7382019941 fake vendor alert',
    PalmPay: '#FraudAlert PalmPay account 5291847603 fake p2p proof',
    Access: '#NIBSS Access account 3075126498 impersonation fraud',
  }

  const parsed: ScrapedSignal[] = []
  for (const [bankName, urls] of Object.entries(sourceByBank)) {
    for (const url of urls) {
      let content = fallbackContentByBank[bankName] ?? ''
      try {
        const response = await fetch(url, { headers: { 'User-Agent': 'SafeGuardScraper/1.0' } })
        if (response.ok) {
          content = await response.text()
        }
      } catch {
        // keep fallback content
      }
      parsed.push(...extractSignalsFromContent(content, bankName))
    }
  }

  const { data, error } = await supabase.rpc('ingest_social_media_mock', {
    p_items: parsed,
  })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      inserted: data,
      scanned: Object.values(sourceByBank).flat().length,
      accepted: parsed.length,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
