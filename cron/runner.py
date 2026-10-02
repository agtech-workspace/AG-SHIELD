import asyncio
import logging
from typing import Any, Dict, List

from env import load_env_local
from lookup_cache_refresher import refresh_cache
from opensanctions_sync import run_registry_ingestion_cycle

logger = logging.getLogger("cron.runner")
logging.basicConfig(level=logging.INFO)

# Heartbeat helpers (optional, if DATABASE_URL set)
try:
    import os
    import psycopg2
    from psycopg2.extras import Json

    def heartbeat(service: str, status: str = "ok", details: Dict[str, Any] | None = None) -> None:
        url = os.environ.get("DATABASE_URL")
        if not url:
            return
        conn = None
        try:
            conn = psycopg2.connect(url)
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO public.runner_heartbeat (service, last_run_at, status, details)
                VALUES (%s, NOW(), %s, %s)
                ON CONFLICT (service) DO UPDATE SET
                  last_run_at = NOW(),
                  status = EXCLUDED.status,
                  details = EXCLUDED.details,
                  updated_at = NOW();
                """,
                (service, status, Json(details or {})),
            )
            conn.commit()
            cur.close()
        except Exception as e:
            logger.debug("heartbeat failed: %s", e)
        finally:
            if conn:
                conn.close()
except Exception:
    def heartbeat(service: str, status: str = "ok", details: Dict[str, Any] | None = None) -> None:
        return

TASKS: List[Dict[str, Any]] = [
    {
        "name": "lookup_cache_refresher",
        "interval_hours": 6,
        "func": lambda: refresh_cache(),
    },
    {
        "name": "opensanctions_sync",
        "interval_hours": 24,
        "func": lambda: run_registry_ingestion_cycle(),
    },
]

async def run_scheduler() -> None:
    last_runs: Dict[str, float] = {}
    while True:
        now = asyncio.get_event_loop().time()
        for task in TASKS:
            name = task["name"]
            iv = task["interval_hours"] * 3600
            lr = last_runs.get(name, 0)
            if now - lr >= iv:
                logger.info("running task %s", name)
                try:
                    res = task["func"]()
                    if asyncio.iscoroutine(res):
                        await res
                    heartbeat(name, "ok", {"interval_hours": task["interval_hours"]})
                except Exception as e:
                    logger.exception("task %s failed: %s", name, e)
                    heartbeat(name, "error", {"error": str(e)})
                last_runs[name] = now
        await asyncio.sleep(60)

if __name__ == "__main__":
    load_env_local()
    asyncio.run(run_scheduler())
