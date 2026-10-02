"""
DEPRECATED (2026-10-01) — superseded by lookup_cache_refresher.py.

Reasons it was retired:
  - It re-resolved accounts on every 6h run with no cache, no dedupe and no
    backoff, wasting Paystack quota.
  - It only wrote `mono_verified_name`, so the risk engine's fuzzy name match
    (accounts.account_name) stayed empty.
  - lookup_cache_refresher.py does all of this plus the cache write-back,
    account backfill and exponential retry backoff.

Kept for reference/history only; it is no longer scheduled in runner.py.
"""
import httpx
import os
import asyncio
from datetime import datetime
from supabase import create_client

BANK_CODES = {
    'Access': '044', 'Zenith': '057', 'GTB': '058', 'UBA': '033',
    'FirstBank': '011', 'Stanbic': '221', 'Fidelity': '070', 'Sterling': '232',
    'Union': '032', 'Wema': '035', 'Polaris': '076', 'Unity': '215',
    'OPay': '100004', 'PalmPay': '100033', 'Kuda': '090267', 'Moniepoint': '090405',
    'FairMoney': '090551', 'Carbon': '100026', 'VFD': '090110', 'Hope PSBank': '090005',
}

async def verify_unverified_accounts(batch_size=25):
    supabase = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
    paystack_key = os.getenv("PAYSTACK_SECRET_KEY")

    if not paystack_key:
        print("[Verifier] PAYSTACK_SECRET_KEY not set, skipping")
        return 0

    result = supabase.table('accounts') \
        .select('id, account_number, bank_name') \
        .is_('mono_verified_name', 'null') \
        .not_.is_('bank_name', 'null') \
        .limit(batch_size) \
        .execute()

    verified = 0

    async with httpx.AsyncClient(timeout=8) as client:
        for row in (result.data or []):
            bank_code = BANK_CODES.get(row['bank_name'])
            if not bank_code:
                continue

            try:
                resp = await client.get(
                    f"https://api.paystack.co/bank/resolve"
                    f"?account_number={row['account_number']}&bank_code={bank_code}",
                    headers={"Authorization": f"Bearer {paystack_key}"}
                )
                if resp.status_code == 200:
                    name = resp.json().get('data', {}).get('account_name')
                    if name:
                        supabase.table('accounts').update({
                            'mono_verified_name': name,
                            'mono_verified_at': datetime.utcnow().isoformat()
                        }).eq('id', row['id']).execute()
                        verified += 1

                await asyncio.sleep(0.4)

            except Exception as e:
                print(f"[Verifier] Failed on {row['account_number']}: {e}")

    print(f"[Verifier] Verified {verified} account names")
    return verified
