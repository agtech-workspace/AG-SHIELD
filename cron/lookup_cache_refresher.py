"""
Bank lookup cache refresher.

The edge fn `resolve-account` resolves names against NubAPI/Paystack on
cache miss only. This worker keeps that cache warm: it polls Postgres
for stale (past-TTL) rows, failed rows whose retry backoff has elapsed,
and accounts that still have no holder name; it resolves them in
rate-limited batches (2.5 req/s) and writes results back into
`bank_lookup_cache` and `accounts`. Users never wait on or flood the
upstream providers.

Failed lookups use exponential backoff (next_retry_at) and are parked
after MAX_ATTEMPTS so permanently-dead numbers do not consume quota on
every run.

Run as a script (not `python -c`) so sys.path[0] is cron/, avoiding the
project `supabase/` directory shadowing the pip package.
"""
import asyncio
import os
from datetime import datetime, timezone

import httpx
import psycopg2

from env import load_env_local

BANK_CODES = {
    'Access': '044', 'Zenith': '057', 'GTB': '058', 'UBA': '033',
    'FirstBank': '011', 'Stanbic': '221', 'Fidelity': '070', 'Sterling': '232',
    'Union': '032', 'Wema': '035', 'Polaris': '076', 'Unity': '215',
    'OPay': '100004', 'PalmPay': '100033', 'Kuda': '090267', 'Moniepoint': '090405',
    'FairMoney': '090551', 'Carbon': '100026', 'VFD': '090110', 'Hope PSBank': '090005',
}

BANK_ALIASES = {
    'access': '044', 'accessbank': '044',
    'zenith': '057', 'gtb': '058', 'guarantytrustbank': '058',
    'uba': '033', 'unitedbankforafrica': '033',
    'first': '011', 'firstbank': '011', 'firstbankofnigeria': '011',
    'stanbic': '221', 'stanbicibtc': '221',
    'fidelity': '070', 'sterling': '232', 'union': '032', 'wema': '035',
    'polaris': '076', 'unity': '215', 'opay': '100004', 'palmpay': '100033',
    'kuda': '090267', 'moniepoint': '090405', 'fairmoney': '090551',
    'carbon': '100026', 'vfd': '090110', 'hopepay': '090005', 'hopepsbank': '090005',
}

MAX_ATTEMPTS = 6
MAX_BACKOFF_HOURS = 168


def bank_code_for(bank_name: str) -> str:
    n = (bank_name or '').strip().lower()
    if n.endswith(' bank'):
        n = n[:-5].strip()
    n = ''.join(ch for ch in n if ch.isalnum())
    return BANK_ALIASES.get(n, '')


UPSERT_OK = """
insert into public.bank_lookup_cache
  (account_number, bank_code, bank_name, holder_name, provider, ok, last_error,
   attempts, next_retry_at, checked_at, updated_at)
values (%s, %s, %s, %s, %s, true, null, 0, null, now(), now())
on conflict (account_number, coalesce(bank_code, '')) do update set
  bank_name = excluded.bank_name,
  holder_name = excluded.holder_name,
  provider = excluded.provider,
  ok = true,
  last_error = null,
  attempts = 0,
  next_retry_at = null,
  checked_at = now(),
  updated_at = now()
"""

UPSERT_FAIL = """
insert into public.bank_lookup_cache
  (account_number, bank_code, bank_name, holder_name, provider, ok, last_error,
   attempts, next_retry_at, checked_at, updated_at)
values (%s, %s, %s, '', '', false, %s, 1,
        now() + make_interval(hours => %s), now(), now())
on conflict (account_number, coalesce(bank_code, '')) do update set
  ok = false,
  last_error = excluded.last_error,
  attempts = public.bank_lookup_cache.attempts + 1,
  next_retry_at = now() + make_interval(hours => least(power(2, public.bank_lookup_cache.attempts + 1), %s)::int),
  checked_at = now(),
  updated_at = now()
"""

BACKFILL_ACCOUNT = """
update public.accounts
set account_name = %s,
    mono_verified_name = %s,
    mono_verified_at = now()
where account_number = %s
  and (bank_name = %s or bank_name is null)
  and coalesce(account_name, '') = ''
"""


def _resolve_nubapi(client: httpx.Client, account_number: str, bank_code: str):
    token = os.getenv('NUBAPI_TOKEN')
    if not token or not bank_code:
        return None
    try:
        r = client.get(
            f'https://nubapi.com/api/verify?account_number={account_number}&bank_code={bank_code}',
            headers={'Authorization': f'Bearer {token}'},
            timeout=6,
        )
        if r.status_code == 200:
            body = r.json()
            if body.get('status') is True and isinstance(body.get('account_name'), str):
                name = body['account_name'].strip()
                if name:
                    return name
    except Exception:
        pass
    return None


def _resolve_paystack(client: httpx.Client, account_number: str, bank_code: str):
    key = os.getenv('PAYSTACK_SECRET_KEY')
    if not key or not bank_code:
        return None
    try:
        r = client.get(
            f'https://api.paystack.co/bank/resolve?account_number={account_number}&bank_code={bank_code}',
            headers={'Authorization': f'Bearer {key}'},
            timeout=6,
        )
        if r.status_code == 200:
            body = r.json()
            if body.get('status') is True:
                name = ((body.get('data') or {}).get('account_name') or '').strip()
                if name:
                    return name
    except Exception:
        pass
    return None


def resolve_name(client: httpx.Client, account_number: str, bank_code: str, bank_name: str):
    """Try providers in the configured order (mirrors the edge function)."""
    resolved_code = bank_code or bank_code_for(bank_name)
    pref = (os.getenv('RESOLVE_PROVIDER') or 'paystack').strip().lower()
    order = ['nubapi', 'paystack'] if pref == 'auto' else ([pref] if pref in ('nubapi', 'paystack') else ['paystack'])

    for provider in order:
        fn = _resolve_nubapi if provider == 'nubapi' else _resolve_paystack
        name = fn(client, account_number, resolved_code)
        if name:
            return name, provider
    return None, None


async def refresh(max_total: int = 50, rate_per_second: float = 2.5):
    load_env_local()
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    ttl_hours = int(os.getenv('RESOLVE_CACHE_TTL_HOURS', '72'))
    sleep_s = 1.0 / rate_per_second

    work: dict[tuple[str, str], dict] = {}
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                select account_number, coalesce(bank_code,''), bank_name
                from public.bank_lookup_cache
                where (ok = false and attempts < %s
                       and (next_retry_at is null or next_retry_at <= now()))
                   or (ok = true and checked_at < now() - make_interval(hours => %s))
                order by next_retry_at asc nulls first, checked_at asc nulls first
                limit %s
                """,
                (MAX_ATTEMPTS, ttl_hours, max_total),
            )
            for account_number, bank_code, bank_name in cur.fetchall():
                work[(account_number, bank_code)] = {
                    'account_number': account_number,
                    'bank_code': bank_code,
                    'bank_name': bank_name or '',
                }

            cur.execute(
                """
                select a.account_number, a.bank_name
                from public.accounts a
                where a.bank_name is not null
                  and coalesce(a.account_name, '') = ''
                  and not exists (
                    select 1 from public.bank_lookup_cache c
                    where c.account_number = a.account_number
                  )
                limit %s
                """,
                (max_total,),
            )
            for account_number, bank_name in cur.fetchall():
                bank_code = bank_code_for(bank_name)
                if not bank_code:
                    continue
                key = (account_number, bank_code)
                if len(work) >= max_total:
                    break
                if key not in work:
                    work[key] = {
                        'account_number': account_number,
                        'bank_code': bank_code,
                        'bank_name': bank_name or '',
                    }

        refilled = 0
        marked_failed = 0
        backfilled = 0
        processed = 0

        with httpx.Client(timeout=10) as client:
            for key in work:
                row = work[key]
                name, provider = resolve_name(client, row['account_number'], row['bank_code'], row['bank_name'])

                with conn.cursor() as cur:
                    if name:
                        cur.execute(
                            UPSERT_OK,
                            (row['account_number'], row['bank_code'], row['bank_name'],
                             name, provider),
                        )
                        cur.execute(
                            BACKFILL_ACCOUNT,
                            (name, name, row['account_number'], row['bank_name']),
                        )
                        backfilled += cur.rowcount
                        refilled += 1
                    else:
                        first_backoff = min(2, MAX_BACKOFF_HOURS)
                        cur.execute(
                            UPSERT_FAIL,
                            (row['account_number'], row['bank_code'], row['bank_name'],
                             'upstream_resolve_failed', first_backoff, MAX_BACKOFF_HOURS),
                        )
                        marked_failed += 1
                conn.commit()

                processed += 1
                if processed % 10 == 0:
                    print(f"[CacheRefresher] ...{processed}/{len(work)} "
                          f"(refilled={refilled} failed={marked_failed} backfilled={backfilled})", flush=True)
                await asyncio.sleep(sleep_s)

        print(f"[CacheRefresher] refilled={refilled} failed={marked_failed} "
              f"accounts_backfilled={backfilled} batch={len(work)} {datetime.now(timezone.utc).isoformat()}")
    finally:
        conn.close()
    return len(work)


async def main():
    await refresh()


if __name__ == '__main__':
    asyncio.run(main())