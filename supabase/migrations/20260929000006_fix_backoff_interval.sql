-- ============================================================
-- Fix: make_interval(hours => ...) takes an integer, but
-- power(2, attempts + 1) returns double precision. Migration
-- 20260929000005 shipped the un-cast expression, so the failure
-- branch of cache_resolve() raised
--   UndefinedFunction: function make_interval(hours => double precision)
-- at runtime. Cast to int (and floor, to stay conservative).
-- ============================================================

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
    (account_number, bank_code, bank_name, holder_name, provider, ok, last_error,
     attempts, next_retry_at, checked_at, updated_at)
  values
    (p_account_number, coalesce(p_bank_code, ''), coalesce(p_bank_name, ''),
     coalesce(p_holder_name, ''), coalesce(p_provider, ''), p_ok,
     p_last_error, 0, null, now(), now())
  on conflict (account_number, coalesce(bank_code, '')) do update set
    bank_name  = excluded.bank_name,
    holder_name = excluded.holder_name,
    provider   = excluded.provider,
    ok         = excluded.ok,
    last_error = excluded.last_error,
    attempts   = case when excluded.ok then 0 else public.bank_lookup_cache.attempts + 1 end,
    next_retry_at = case
      when excluded.ok then null
      else now() + make_interval(hours => floor(least(
        power(2, public.bank_lookup_cache.attempts + 1), 168))::int)
    end,
    checked_at = excluded.checked_at,
    updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.cache_resolve(text, text, text, text, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.cache_resolve(text, text, text, text, text, boolean, text)
  to service_role;
