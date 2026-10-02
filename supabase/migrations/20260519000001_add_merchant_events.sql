-- Merchant Verification Tables
create table if not exists public.merchants (
  id uuid default uuid_generate_v4() primary key,
  business_name text not null,
  cac_number text,
  primary_account text check (primary_account ~ '^[0-9]{10}$'),
  bank_name text,
  verification_status text default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'flagged')),
  risk_score integer default 0,
  badge_url text,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create table if not exists public.events (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  event_date timestamp with time zone not null,
  location text,
  event_type text default 'workshop' check (event_type in ('webinar', 'workshop', 'corporate', 'community')),
  seats_available integer,
  registration_url text,
  created_at timestamp with time zone default now()
);

create table if not exists public.event_subscribers (
  id uuid default uuid_generate_v4() primary key,
  email text not null,
  name text,
  event_id uuid references public.events(id) on delete cascade,
  subscribed_at timestamp with time zone default now()
);

-- Enable RLS
alter table public.merchants enable row level security;
alter table public.events enable row level security;
alter table public.event_subscribers enable row level security;

-- Merchant policies
drop policy if exists "Public read merchants" on public.merchants;
create policy "Public read merchants" on public.merchants
for select to anon, authenticated using (true);

drop policy if exists "Authenticated can create merchants" on public.merchants;
create policy "Authenticated can create merchants" on public.merchants
for insert to authenticated with check (true);

drop policy if exists "Admin can update merchants" on public.merchants;
create policy "Admin can update merchants" on public.merchants
for update to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Event policies
drop policy if exists "Public read events" on public.events;
create policy "Public read events" on public.events
for select to anon, authenticated using (true);

drop policy if exists "Admin can manage events" on public.events;
create policy "Admin can manage events" on public.events
for all to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
);

-- Event subscriber policies
drop policy if exists "Anyone can subscribe to events" on public.event_subscribers;
create policy "Anyone can subscribe to events" on public.event_subscribers
for insert to anon, authenticated with check (true);

-- Add is_admin column to profiles if not exists
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'profiles' and column_name = 'is_admin') then
    alter table public.profiles add column is_admin boolean default false;
  end if;
end $$;

-- Create verification function
create or replace function public.verify_merchant(
  p_business_name text,
  p_cac_number text,
  p_primary_account text,
  p_bank_name text
)
returns table (
  verified boolean,
  verification_id uuid,
  business_name text,
  cac_status text,
  account_name_match boolean,
  risk_score integer,
  risk_level text,
  badge_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merchant_id uuid;
  v_exists boolean;
  v_account_name text;
  v_risk_level text;
  v_risk_score integer := 0;
begin
  -- Check if account exists in accounts table
  select account_number is not null, account_name
  into v_exists, v_account_name
  from public.accounts
  where account_number = p_primary_account and bank_name = p_bank_name
  limit 1;

  -- Check risk level from accounts
  select overall_risk_level,
    case when overall_risk_level = 'high_risk' then 80
         when overall_risk_level = 'warning' then 40
         else 10 end
  into v_risk_level, v_risk_score
  from public.accounts
  where account_number = p_primary_account and bank_name = p_bank_name
  and overall_risk_level != 'safe'
  limit 1;

  if v_risk_level is null then
    v_risk_level := 'safe';
    v_risk_score := 10;
  end if;

  -- Insert or update merchant
  insert into public.merchants (business_name, cac_number, primary_account, bank_name, verification_status, risk_score, verified_at)
  values (p_business_name, p_cac_number, p_primary_account, p_bank_name, 
    case when v_risk_level = 'high_risk' then 'flagged' when v_risk_level = 'warning' then 'pending' else 'verified' end,
    v_risk_score,
    case when v_risk_level != 'high_risk' then now() else null end
  )
  on conflict (primary_account) do update
  set verification_status = case when v_risk_level = 'high_risk' then 'flagged' when v_risk_level = 'warning' then 'pending' else 'verified' end,
    risk_score = v_risk_score,
    verified_at = case when v_risk_level != 'high_risk' then now() else verified_at end
  returning id into v_merchant_id;

  return query select
    v_risk_level != 'high_risk' as verified,
    v_merchant_id as verification_id,
    p_business_name as business_name,
    case when p_cac_number is not null then 'active' else 'pending' end as cac_status,
    v_account_name is not null as account_name_match,
    v_risk_score as risk_score,
    v_risk_level as risk_level,
    '/verify/merchant/' || v_merchant_id::text as badge_url;
end;
$$;

-- Add indexes
create index if not exists idx_merchants_account on public.merchants (primary_account);
create index if not exists idx_events_date on public.events (event_date);