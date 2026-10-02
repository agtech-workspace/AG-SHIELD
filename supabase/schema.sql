create extension if not exists "uuid-ossp";

create table if not exists public.accounts (
  id uuid default uuid_generate_v4() primary key,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  bank_name text not null,
  overall_risk_level text default 'safe' check (overall_risk_level in ('safe', 'warning', 'high_risk')),
  total_reports integer default 0 check (total_reports >= 0),
  is_verified_business boolean default false,
  last_checked timestamp with time zone default now(),
  unique(account_number, bank_name)
);

create table if not exists public.reports (
  id uuid default uuid_generate_v4() primary key,
  account_id uuid references public.accounts(id) on delete cascade,
  reason_category text check (
    reason_category in (
      'Instagram Vendor Scam',
      'Crypto P2P Fraud',
      'Facebook Marketplace',
      'Job/Visa Phishing',
      'POS Withdrawal Error',
      'Fake Giveaway',
      'Impersonation',
      'Social Media Report'
    )
  ),
  description text,
  reporter_id uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) >= 2),
  created_at timestamp with time zone default now()
);

alter table public.accounts enable row level security;
alter table public.reports enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Allow read accounts" on public.accounts;
create policy "Allow read accounts" on public.accounts
for select to anon, authenticated
using (true);

drop policy if exists "Allow write accounts" on public.accounts;
drop policy if exists "Allow write accounts for authenticated reporters" on public.accounts;
create policy "Allow write accounts for authenticated reporters" on public.accounts
for insert to authenticated
with check (
  overall_risk_level = 'safe'
  and total_reports = 0
  and is_verified_business = false
);

drop policy if exists "Allow update accounts" on public.accounts;
drop policy if exists "Allow update accounts for authenticated users only" on public.accounts;

drop policy if exists "Allow read reports" on public.reports;
create policy "Allow read reports" on public.reports
for select to anon, authenticated
using (true);

drop policy if exists "Allow write reports" on public.reports;
drop policy if exists "Allow write reports for authenticated reporters" on public.reports;
create policy "Allow write reports for authenticated reporters" on public.reports
for insert to authenticated
with check (
  reporter_id = auth.uid()
  and reporter_id is not null
);

drop policy if exists "Allow own profile read" on public.profiles;
create policy "Allow own profile read" on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists "Allow own profile upsert" on public.profiles;
create policy "Allow own profile upsert" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "Allow own profile update" on public.profiles;
create policy "Allow own profile update" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.sync_account_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_total integer;
  next_risk text;
begin
  select count(*) into report_total
  from public.reports
  where account_id = new.account_id
    and (status is null or status = 'approved');

  next_risk := case
    when report_total >= 6 then 'high_risk'
    when report_total >= 1 then 'warning'
    else 'safe'
  end;

  update public.accounts
  set total_reports = report_total,
      overall_risk_level = next_risk,
      last_checked = now()
  where id = new.account_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_account_risk on public.reports;
create trigger trg_sync_account_risk
after insert on public.reports
for each row
execute function public.sync_account_risk();

create or replace function public.ingest_social_media_mock(
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  account_uuid uuid;
  inserted_count integer := 0;
begin
  for item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
    values (
      item->>'account_number',
      item->>'bank_name',
      'safe',
      0,
      false
    )
    on conflict (account_number, bank_name) do update
    set last_checked = now()
    returning id into account_uuid;

    insert into public.reports (account_id, reason_category, description, reporter_id)
    values (
      account_uuid,
      'Social Media Report',
      coalesce(item->>'description', 'Auto-ingested from social media signal feed'),
      null
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.submit_user_report(
  p_account_number text,
  p_bank_name text,
  p_reason_category text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_account_id uuid;
begin
  if v_user is null then
    raise exception 'You must be signed in to submit a report.';
  end if;

  insert into public.accounts (account_number, bank_name, overall_risk_level, total_reports, is_verified_business)
  values (p_account_number, p_bank_name, 'safe', 0, false)
  on conflict (account_number, bank_name) do update
  set last_checked = now()
  returning id into v_account_id;

  insert into public.reports (account_id, reason_category, description, reporter_id)
  values (v_account_id, p_reason_category, p_description, v_user);

  return v_account_id;
end;
$$;
