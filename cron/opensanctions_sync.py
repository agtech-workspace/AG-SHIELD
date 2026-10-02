import os
import re
import csv
import io
import httpx
import asyncio
import psycopg2
from psycopg2.extras import execute_values

from env import load_env_local, database_url

DATABASE_URL = None  # resolved in main() after loading .env.local

# dataset code -> registry blacklist source_agency
DATASETS = [
    # Stage 1 — Nigeria first
    ("ng_nigsac_sanctions", "SANCTIONS"),
    ("ng_chipper_peps", "PEP"),
    ("ng_join_dots", "PEP"),
    ("interpol_red_notices", "INTERPOL"),
    # Stage 2 — global official lists (all mapped to SANCTIONS so the existing
    # hard anti-FN trigger blocks them; source_url identifies the list)
    ("us_ofac_sdn", "SANCTIONS"),
    ("us_ofac_cons", "SANCTIONS"),
    ("un_sc_sanctions", "SANCTIONS"),
    ("eu_fsf", "SANCTIONS"),
    ("eu_journal_sanctions", "SANCTIONS"),
    ("gb_fcdo_sanctions", "SANCTIONS"),
    ("ch_seco_sanctions", "SANCTIONS"),
]

# Only the Nigeria sanctions list is trusted to contain real NG bank account
# numbers inside its narratives. Foreign lists contain arbitrary 10-digit
# identifiers, so extracting them would seed false high_risk accounts.
ACCOUNT_SEED_DATASETS = {"ng_nigsac_sanctions"}

# Human-readable label used in account seed reasons.
DATASET_LABELS = {"ng_nigsac_sanctions": "Nigeria sanctions listing"}

BASE_URL = "https://data.opensanctions.org/datasets/latest/{code}/targets.simple.csv"
DATASET_PAGE = "https://www.opensanctions.org/datasets/{code}/"

# countries column uses lowercase ISO 3166-1 alpha-2 codes
NG_CODES = {"ng", "nga", "nigeria"}
MOBILE_PREFIXES = ("07", "08", "09")

IDENTIFIER_RE = re.compile(r'^(RC|BN|CAC|BVN|NIN|PP|PASSPORT|ID)\s*:?\s*([A-Za-z0-9]+)', re.IGNORECASE)
ACCOUNT_RE = re.compile(r'\b(\d{10})\b')
BATCH = 1000

BANK_ALIASES = [
    ("access bank", "Access Bank"),
    ("united bank for africa", "UBA"),
    ("uba", "UBA"),
    ("first bank", "First Bank"),
    ("zenith", "Zenith"),
    ("gtbank", "GTBank"),
    ("sterling", "Sterling"),
    ("monie point", "Moniepoint"),
    ("moniepoint", "Moniepoint"),
    ("flutterwave", "Flutterwave"),
    ("opay", "OPay"),
    ("kuda", "Kuda"),
    ("palmpay", "Palmpay"),
]


def is_nigeria(countries: str) -> bool:
    if not countries:
        return False
    return any(t.lower() in NG_CODES for t in countries.split())


def parse_identifiers(raw: str):
    if not raw:
        return None, None
    m = IDENTIFIER_RE.search(raw)
    if not m:
        return None, None
    prefix = m.group(1).upper()
    val = m.group(2)
    if prefix in ("RC", "BN", "CAC"):
        return val, "rc"
    if prefix in ("PP", "PASSPORT"):
        return val, "passport"
    if prefix == "BVN":
        return val, "bvn_hash"
    if prefix == "NIN":
        return val, "nin"
    return val, "id"


def parse_aliases(raw: str):
    if not raw:
        return []
    out = []
    for tok in re.split(r'[|;]', raw):
        tok = tok.strip()
        if not tok:
            continue
        for sub in re.split(r'\s*-\s+', tok):
            sub = sub.strip()
            if sub:
                out.append(sub)
    return list(dict.fromkeys(out))


def extract_bank(narrative: str):
    n = (narrative or "").lower()
    for alias, name in BANK_ALIASES:
        if alias in n:
            return name
    return None


from datetime import date


def first_date(value: str):
    if not value:
        return None
    for part in re.split(r'[;,]', value):
        part = part.strip()
        if not re.match(r'^\d{4}-\d{2}-\d{2}(T| )', part) and not re.match(r'^\d{4}-\d{2}-\d{2}$', part):
            continue
        try:
            return date.fromisoformat(part[:10]).isoformat()
        except ValueError:
            continue
    return None


def normalize_row(row: dict, agency: str, code: str):
    name = (row.get("name") or "").strip()
    if not name:
        return None
    schema = (row.get("schema") or "").strip()
    rtype = "INDIVIDUAL" if schema.lower() == "person" else "BUSINESS"
    identifier, identifier_type = parse_identifiers(row.get("identifiers"))
    listed_at = row.get("last_change") or row.get("last_seen") or None
    listed_at = first_date(listed_at)
    birth_date = first_date(row.get("birth_date"))
    return {
        "entity_name": name,
        "entity_identifier": identifier,
        "identifier_type": identifier_type,
        "type": rtype,
        "source_agency": agency,
        "reason_flagged": (row.get("sanctions") or None),
        "source_url": DATASET_PAGE.format(code=code),
        "listed_at": listed_at,
        "aliases": parse_aliases(row.get("aliases")) or None,
        "birth_date": birth_date,
    }


def extract_accounts(row: dict):
    narrative = row.get("sanctions") or ""
    found = set()
    for m in ACCOUNT_RE.findall(narrative):
        if m.startswith(MOBILE_PREFIXES):
            continue
        if len(set(m)) <= 1:
            continue
        found.add(m)
    return found


def sql_rows(rows):
    out = []
    for r in rows:
        out.append((
            r["entity_name"],
            r["entity_identifier"],
            r["identifier_type"],
            r["type"],
            r["source_agency"],
            r["reason_flagged"],
            r["source_url"],
            r["listed_at"],
            r["aliases"],
            r["birth_date"],
        ))
    return out


async def download(code: str):
    url = BASE_URL.format(code=code)
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def parse_rows(text: str):
    return list(csv.DictReader(io.StringIO(text)))


def chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


async def sync_dataset(conn, code: str, agency: str) -> dict:
    text = await download(code)
    rows = parse_rows(text)
    if code == "interpol_red_notices":
        rows = [r for r in rows if is_nigeria(r.get("countries"))]

    stats = {"rows_upserted": 0, "rows_skipped": 0, "account_seeds": 0}

    normalized = [r for r in (normalize_row(raw, agency, code) for raw in rows) if r is not None]
    with_id = {}
    for r in normalized:
        if r["entity_identifier"]:
            with_id[(r["entity_identifier"], agency, r["type"])] = r
    without_id = {}
    for r in normalized:
        if not r["entity_identifier"]:
            without_id[(r["entity_name"].lower(), agency, r["type"])] = r

    if with_id:
        # Identifier-keyed rows: upsert (update changed fields on repeat runs)
        exec_sql = """
            INSERT INTO public.registry_blacklist
              (entity_name, entity_identifier, identifier_type, type, source_agency,
               reason_flagged, source_url, listed_at, aliases, birth_date)
            VALUES %s
            ON CONFLICT (entity_identifier, source_agency, type) DO UPDATE SET
              entity_name = EXCLUDED.entity_name,
              reason_flagged = EXCLUDED.reason_flagged,
              source_url = EXCLUDED.source_url,
              listed_at = EXCLUDED.listed_at,
              aliases = COALESCE(EXCLUDED.aliases, registry_blacklist.aliases),
              birth_date = COALESCE(EXCLUDED.birth_date, registry_blacklist.birth_date)
        """
        for batch in chunks(sql_rows(list(with_id.values())), BATCH):
            with conn.cursor() as cur:
                execute_values(cur, exec_sql, batch, page_size=BATCH)
            conn.commit()
        stats["rows_upserted"] += len(with_id)

    if without_id:
        # Identifier-less rows: insert-only, de-duped by the partial unique
        # index on (name, agency, type); DO NOTHING stays idempotent.
        exec_sql = """
            INSERT INTO public.registry_blacklist
              (entity_name, entity_identifier, identifier_type, type, source_agency,
               reason_flagged, source_url, listed_at, aliases, birth_date)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        for batch in chunks(sql_rows(list(without_id.values())), BATCH):
            with conn.cursor() as cur:
                execute_values(cur, exec_sql, batch, page_size=BATCH)
                stats["rows_upserted"] += cur.rowcount
            conn.commit()
        stats["rows_skipped"] = len(without_id) - stats["rows_upserted"]

    # Account-number seeds extracted from listing narratives.
    # Restricted to Nigeria sanctions listings — foreign lists carry arbitrary
    # 10-digit identifiers that must NOT become high_risk accounts.
    account_rows = []
    reg_account_rows = []
    seen = set()
    label = DATASET_LABELS.get(code, "Sanctions listing")
    for raw in (rows if code in ACCOUNT_SEED_DATASETS else []):
        row = normalize_row(raw, agency, code)
        if row is None:
            continue
        account_numbers = extract_accounts(raw)
        if not account_numbers:
            continue
        bank = extract_bank(raw.get("sanctions")) or ""
        for acct in account_numbers:
            key = (acct, bank)
            if key in seen:
                continue
            seen.add(key)
            reg = dict(row)
            reg["entity_identifier"] = acct
            reg["identifier_type"] = "account_number"
            reg_account_rows.append(reg)
            account_rows.append((
                acct,
                bank,
                "high_risk",
                "sanctions",
                DATASET_PAGE.format(code=code),
                f"{label} — {raw.get('sanctions') or raw.get('name')}",
                False,
            ))

    if reg_account_rows:
        exec_sql = """
            INSERT INTO public.registry_blacklist
              (entity_name, entity_identifier, identifier_type, type, source_agency,
               reason_flagged, source_url, listed_at, aliases, birth_date)
            VALUES %s
            ON CONFLICT (entity_identifier, source_agency, type) DO UPDATE SET
              entity_name = EXCLUDED.entity_name,
              reason_flagged = EXCLUDED.reason_flagged
        """
        for batch in chunks(sql_rows(reg_account_rows), BATCH):
            with conn.cursor() as cur:
                execute_values(cur, exec_sql, batch, page_size=BATCH)

    if account_rows:
        exec_sql = """
            INSERT INTO public.accounts
              (account_number, bank_name, overall_risk_level, source, source_url,
               flagged_reason, is_verified)
            VALUES %s
            ON CONFLICT DO NOTHING
        """
        for batch in chunks(account_rows, BATCH):
            with conn.cursor() as cur:
                execute_values(cur, exec_sql, batch, page_size=BATCH)
                stats["account_seeds"] += cur.rowcount
    conn.commit()

    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO public.registry_sync_log "
            "(dataset_code, rows_upserted, rows_skipped, account_seeds) "
            "VALUES (%s, %s, %s, %s)",
            (code, stats["rows_upserted"], stats["rows_skipped"], stats["account_seeds"]),
        )
    conn.commit()

    return stats


async def main():
    load_env_local()
    database_url_value = database_url()
    if not database_url_value:
        raise SystemExit("DATABASE_URL is required")
    conn = psycopg2.connect(database_url_value, connect_timeout=30)
    try:
        for code, agency in DATASETS:
            try:
                stats = await sync_dataset(conn, code, agency)
                print(f"[OpenSanctions] {code}: {stats}", flush=True)
            except Exception as e:
                print(f"[OpenSanctions] {code} FAILED: {e}", flush=True)
                conn.rollback()
    finally:
        conn.close()


if __name__ == "__main__":
    asyncio.run(main())