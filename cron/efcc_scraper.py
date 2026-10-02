import httpx
from bs4 import BeautifulSoup
from supabase import create_client
import re
import os
from urllib.parse import urljoin

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

NIGERIAN_ACCOUNT_PATTERN = re.compile(r'\b\d{10}\b')
BANK_NAMES = [
    'GTBank', 'Access Bank', 'Zenith', 'First Bank', 'UBA',
    'OPay', 'Kuda', 'Palmpay', 'Moniepoint', 'Sterling'
]

EFCC_SOURCES = [
    "https://www.efcc.gov.ng/efcc/press-release",
    "https://www.efcc.gov.ng/efcc/conviction",
]

async def scrape_efcc_press_releases():
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    found = 0

    async with httpx.AsyncClient(timeout=15) as client:
        for url in EFCC_SOURCES:
            try:
                resp = await client.get(url, follow_redirects=True)
                soup = BeautifulSoup(resp.text, 'html.parser')

                article_links = [
                    a['href'] for a in soup.find_all('a', href=True)
                    if 'conviction' in a['href'].lower()
                    or 'fraud' in a['href'].lower()
                    or 'sentence' in a['href'].lower()
                ]

                for link in article_links[:20]:
                    full_url = urljoin(url, link)
                    await scrape_article(client, supabase, full_url)
                    found += 1

            except Exception as e:
                print(f"[EFCC Scraper] Error on {url}: {e}")

    print(f"[EFCC Scraper] Processed {found} articles")


async def scrape_article(client, supabase, url: str):
    try:
        resp = await client.get(url, timeout=10)
        text = resp.text
        soup = BeautifulSoup(text, 'html.parser')
        body = soup.get_text(separator=' ')

        account_numbers = NIGERIAN_ACCOUNT_PATTERN.findall(body)
        if not account_numbers:
            return

        bank_name = None
        for bank in BANK_NAMES:
            if bank.lower() in body.lower():
                bank_name = bank
                break

        for acct in set(account_numbers):
            if acct.startswith(('080', '090', '070', '081', '091')):
                continue

            existing = supabase.table('accounts') \
                .select('id') \
                .eq('account_number', acct) \
                .execute()

            if existing.data:
                continue

            supabase.table('accounts').upsert({
                'account_number': acct,
                'bank_name': bank_name,
                'overall_risk_level': 'high_risk',
                'source': 'efcc',
                'source_url': url,
                'flagged_reason': f'Extracted from EFCC press release: {url[:100]}',
                'is_verified': False
            }).execute()

            print(f"[EFCC Scraper] Added {acct} from {url}")

    except Exception as e:
        print(f"[EFCC Scraper] Failed on {url}: {e}")
