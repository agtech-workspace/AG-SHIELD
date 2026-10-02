import sqlite3
import os
from supabase import create_client
from pathlib import Path

DB_PATH = Path("data/safeguard.db")

async def export_sqlite_snapshot():
    supabase = create_client(
        os.getenv("SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )

    result = supabase.table('accounts') \
        .select('*') \
        .order('created_at', desc=True) \
        .execute()

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    c = db.cursor()

    c.execute('''CREATE TABLE IF NOT EXISTS accounts (
        id TEXT, account_number TEXT, bank_name TEXT,
        overall_risk_level TEXT, source TEXT, mono_verified_name TEXT,
        flag_count INTEGER, search_count INTEGER,
        source_url TEXT, created_at TEXT,
        PRIMARY KEY (account_number)
    )''')

    c.execute('''CREATE INDEX IF NOT EXISTS
        idx_last4 ON accounts(substr(account_number,-4))''')

    for row in (result.data or []):
        c.execute('''INSERT OR REPLACE INTO accounts VALUES
            (?,?,?,?,?,?,?,?,?,?)''', (
            row.get('id'), row.get('account_number'),
            row.get('bank_name'), row.get('overall_risk_level'),
            row.get('source'), row.get('mono_verified_name'),
            row.get('flag_count', 0), row.get('search_count', 0),
            row.get('source_url'), row.get('created_at')
        ))

    has_meta = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='meta'").fetchone()
    if has_meta:
        c.execute("INSERT OR REPLACE INTO meta VALUES ('last_updated', datetime('now'))")
    else:
        c.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
        c.execute("INSERT OR REPLACE INTO meta VALUES ('last_updated', datetime('now'))")
    db.commit()
    db.close()

    count = len(result.data or [])
    print(f"[DBExport] SQLite updated — {count} records written to {DB_PATH}")
    return count
