"""
SafeGuard social intelligence utility.

What it does:
1) Polls web/social sources grouped by BANK NAME (not account number).
2) Extracts 10-digit account numbers from scraped content.
3) Filters for scam context using hashtags/keywords.
4) Sends accepted signals to Supabase RPC ingest_social_media_mock.
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from html import unescape

try:
    from supabase import create_client  # type: ignore
except Exception:  # pragma: no cover
    create_client = None

SCAM_TAGS = ("#scamalertng", "#nibss", "#fraudalert")
SCAM_KEYWORDS = ("scam", "fraud", "scammer", "stole", "vendor", "impersonation", "fake")

# Poll by bank name only. Replace with real social/search endpoints later.
SOURCE_URLS_BY_BANK = {
    "OPay": ["https://example.com/social?q=%23ScamAlertNG+OPay"],
    "PalmPay": ["https://example.com/social?q=%23FraudAlert+PalmPay"],
    "Access": ["https://example.com/social?q=%23NIBSS+Access"],
}

# Demo fallback content for offline/rate-limited situations.
DEMO_HTML_BY_BANK = {
    "OPay": "<p>#ScamAlertNG OPay account 7382019941 fake vendor alert.</p>",
    "PalmPay": "<p>#FraudAlert PalmPay 5291847603 fake p2p proof.</p>",
    "Access": "<p>#NIBSS Access 3075126498 impersonation fraud.</p>",
}


def clean_text(html: str) -> str:
    no_tags = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", unescape(no_tags)).strip()


def has_scam_context(text: str) -> bool:
    lower = text.lower()
    return any(tag in lower for tag in SCAM_TAGS) or any(word in lower for word in SCAM_KEYWORDS)


def fetch_source_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "SafeGuardScraper/1.0"})
    with urllib.request.urlopen(request, timeout=12) as response:  # noqa: S310
        return response.read().decode("utf-8", errors="ignore")


def parse_content_for_bank(text: str, bank_name: str) -> list[dict[str, str]]:
    if bank_name.lower() not in text.lower() or not has_scam_context(text):
        return []
    accounts = sorted(set(re.findall(r"\b\d{10}\b", text)))
    return [
        {"account_number": account, "bank_name": bank_name, "description": text[:400]}
        for account in accounts
    ]


def collect_signals() -> list[dict[str, str]]:
    collected: list[dict[str, str]] = []
    for bank_name, urls in SOURCE_URLS_BY_BANK.items():
        for url in urls:
            try:
                html = fetch_source_text(url)
            except Exception:
                html = DEMO_HTML_BY_BANK.get(bank_name, "")
            text = clean_text(html)
            collected.extend(parse_content_for_bank(text, bank_name))

    deduped: dict[tuple[str, str], dict[str, str]] = {}
    for item in collected:
        deduped[(item["account_number"], item["bank_name"])] = item
    return list(deduped.values())


def push_to_supabase(payload: list[dict[str, str]]) -> dict[str, object]:
    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key or create_client is None:
        return {"mode": "dry-run", "accepted": len(payload), "payload": payload}
    client = create_client(supabase_url, service_key)
    result = client.rpc("ingest_social_media_mock", {"p_items": payload}).execute()
    return {"mode": "ingested", "accepted": len(payload), "result": result.data}


if __name__ == "__main__":
    parsed = collect_signals()
    print(json.dumps(push_to_supabase(parsed), indent=2))
