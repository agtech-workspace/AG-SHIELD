-- ============================================================
-- Bank lookup cache — shields Paystack/NubAPI rate limits.
-- Hot path for name resolution reads this table (or accounts),
-- so repeated lookups of the same account never re-hit the
-- upstream providers inside a TTL window. A cron worker keeps
-- it fresh (rate-limited batches) off-hours.
--
-- RLS is ON with no policies: postgrest/anon/authenticated get
-- denied (privacy: holder names are PII). Service role (edge
-- functions + cron) bypasses RLS.
-- ============================================================

create table if not exists public.bank_lookup_cache (
  id bigint generated always as identity primary key,
  account_number text not null,
  bank_code text not null default '',
  bank_name text not null default '',
  holder_name text not null default '',
  provider text not null default '',
  ok boolean not null default true,
  last_error text,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_bank_lookup_cache_key
  on public.bank_lookup_cache (account_number, coalesce(bank_code, ''));

create index if not exists idx_bank_lookup_cache_due
  on public.bank_lookup_cache (checked_at)
  where ok = true;

alter table public.bank_lookup_cache enable row level security;

-- No policies = deny-all for anon/authenticated via PostgREST.

-- Named-key writer used by the edge function and cron worker.
create or replace function public.cache_resolve(
  p_account_number text,
  p_bank_code text default '',
  p_bank_name text default '',
  p_holder_name text default '',
  p_provider text default '',
  p_ok boolean default true,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.bank_lookup_cache
    (account_number, bank_code, bank_name, holder_name, provider, ok, last_error, checked_at, updated_at)
  values
    (p_account_number, coalesce(p_bank_code, ''), coalesce(p_bank_name, ''),
     coalesce(p_holder_name, ''), coalesce(p_provider, ''), p_ok,
     p_last_error, now(), now())
  on conflict (account_number, coalesce(bank_code, '')) do update set
    bank_name  = excluded.bank_name,
    holder_name = excluded.holder_name,
    provider   = excluded.provider,
    ok         = excluded.ok,
    last_error = excluded.last_error,
    checked_at = excluded.checked_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.cache_resolve(text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.cache_resolve(text, text, text, text, text, boolean, text)
  to service_role;