import asyncio
import os
from datetime import datetime

from env import load_env_local
from report_settler import run_report_settler
from efcc_scraper import scrape_efcc_press_releases
from opensanctions_sync import main as run_opensanctions_sync
from lookup_cache_refresher import main as run_lookup_cache_refresher
from db_exporter import export_sqlite_snapshot

# paystack_verifier retired: lookup_cache_refresher supersedes it (cache +
# backfill of both mono_verified_name and account_name).
SCHEDULES = {
    'report_settler':   2 * 60 * 60,
    'lookup_cache_refresher': 6 * 60 * 60,
    'efcc_scraper':     24 * 60 * 60,
    'opensanctions_sync': 24 * 60 * 60,
}

last_run = {k: 0.0 for k in SCHEDULES}

async def main_loop():
    load_env_local()
    print("[Runner] Cron runner started")

    while True:
        now = datetime.now().timestamp()

        for job_name, interval in SCHEDULES.items():
            if now - last_run[job_name] >= interval:
                print(f"[Runner] Starting {job_name}...")
                try:
                    if job_name == 'report_settler':
                        await run_report_settler()
                    elif job_name == 'lookup_cache_refresher':
                        await run_lookup_cache_refresher()
                    elif job_name == 'efcc_scraper':
                        await scrape_efcc_press_releases()
                    elif job_name == 'opensanctions_sync':
                        await run_opensanctions_sync()
                    last_run[job_name] = now
                    print(f"[Runner] {job_name} complete")
                except Exception as e:
                    print(f"[Runner] {job_name} failed: {e}")

        await asyncio.sleep(60)
        await export_sqlite_snapshot()

if __name__ == '__main__':
    asyncio.run(main_loop())
