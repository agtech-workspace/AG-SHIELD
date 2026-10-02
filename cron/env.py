"""Shared environment loader for cron workers.

The repo keeps working credentials in `.env.local` (gitignored). Shell
environments are inconsistent (Windows vars with spaces, missing
SUPABASE_URL/SERVICE_ROLE aliases), so every worker loads the file
explicitly. Existing shell variables always win.

Some keys in `.env.local` are not valid identifiers (e.g. `paystack key`);
those are normalised and mapped onto their canonical names.
"""
import os
import re

_CANONICAL_ALIASES = {
    'paystack_key': 'PAYSTACK_SECRET_KEY',
    'paystack_secret': 'PAYSTACK_SECRET_KEY',
    'paystack_secret_key': 'PAYSTACK_SECRET_KEY',
}

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local')


def load_env_local(path: str | None = None) -> None:
    path = path or _ENV_PATH
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding='utf-8') as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if not key or not value:
                    continue

                norm = re.sub(r'[^0-9a-zA-Z]+', '_', key).strip('_').lower()
                canonical = _CANONICAL_ALIASES.get(norm)
                if canonical:
                    os.environ.setdefault(canonical, value)
                elif re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key):
                    os.environ.setdefault(key, value)

                # VITE_-prefixed public vars double as the server names.
                if key.startswith('VITE_SUPABASE_URL') and not os.getenv('SUPABASE_URL'):
                    os.environ.setdefault('SUPABASE_URL', value)
                if key.startswith('VITE_SUPABASE_ANON_KEY') and not os.getenv('SUPABASE_ANON_KEY'):
                    os.environ.setdefault('SUPABASE_ANON_KEY', value)
    except Exception:
        pass


def database_url() -> str | None:
    return os.getenv('DATABASE_URL') or os.getenv('SUPABASE_DB_URL')