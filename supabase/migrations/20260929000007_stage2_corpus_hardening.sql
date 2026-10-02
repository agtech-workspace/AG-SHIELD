-- ============================================================
-- Risk Engine v3.2 — Stage-2 corpus hardening.
--
-- Stage 2 grew registry_blacklist from 78 rows to 64,104 (36,344
-- SANCTIONS). Two problems appeared as a direct result:
--
-- 1. PERFORMANCE. screen_person_name() built its candidate set with
--    `... % trigram OR aliases % trigram OR levenshtein(...) <= 2`.
--    Any OR containing a non-indexable levenshtein() forces a
--    sequential scan, so every screened holder name cost ~2.1s
--    (measured: 2796ms, 3170 buffers) versus ~0.2s before. The
--    engine's own 7b clause had the same shape (~321ms).
--
-- 2. FALSE POSITIVES. Trigram similarity over a 36k-row corpus
--    produces collisions that did not exist at 78 rows, e.g.
--    'SADIQ HUSSAIN' -> 'Sakinah Hussain' (score 50) and
--    'MERCY CYNTHIA AVAMALE' -> 'Ali Mohammed Lalobo' (score 5).
--    A single-token registry entry ('Grace', 3,041 such rows) shares
--    trigrams with almost any name containing it. With a hard
--    match_score >= 40 block gate this blocks legitimate transfers.
--
-- Fixes in this migration:
--   A. screen_person_name() rewritten as UNION ALL of index-friendly
--      branches (no OR-with-levenshtein), so the existing GIN trigram
--      index is used. Exact name/alias hits short-circuit to 100.
--   B. Non-exact fuzzy hits must share >= 2 name tokens of length
--      >= 3 (query token present in the candidate name or any alias),
--      otherwise they are not returned at all. This removes the
--      single-token / one-common-word collision class.
--   C. Engine 7b uses the index-backed trigram operator instead of an
--      unbounded levenshtein scan.
--   D. Engine 7c becomes two-tier and config-driven:
--        - PEP match >= registry_watch_min (40)  -> REVIEW (unchanged)
--        - non-PEP match >= registry_block_min (70) -> hard BLOCK
--        - non-PEP match 40..69 -> 'registry_watch', REVIEW only
--      Previously any non-PEP match >= 40 blocked outright.
--
-- Recall trade-off (intentional): transliteration/typo variants that
-- only share one token with a listed name (e.g. 'ANWAR AL-AWLAKI'
-- vs 'Anwar AL-AULAQI') no longer hard-block; they surface as
-- registry_watch for human review. Exact and alias matches still
-- block at 100.
-- ============================================================

-- Tunable thresholds (see risk_config table).
insert into public.risk_config (key, value, description) values
  ('registry_block_min', '70', 'Min holder-name match score for a SANCTIONS/INTERPOL match to hard-block (exact/alias hits score 100)'),
  ('registry_watch_min', '40', 'Min holder-name match score to surface a possible registry match; non-PEP hits below registry_block_min are watch-only (REVIEW, never block)')
on conflict (key) do update
  set description = excluded.description;

-- ------------------------------------------------------------
-- A + B: screen_person_name v2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.screen_person_name(p_name text)
RETURNS table (
  entity_name text,
  source_agency text,
  reason_flagged text,
  match_score int,
  confidence numeric,
  entity_identifier text
)
language sql
stable
set search_path = public
as $$
  with base as (
    select upper(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))) as norm
  ),
  q as (
    select
      b.norm,
      regexp_split_to_array(b.norm, ' ') as toks,
      -- surname-first variant: greedy group 1 = all but the last token
      case
        when array_length(regexp_split_to_array(b.norm, ' '), 1) >= 2
          then regexp_replace(b.norm, '^(.+) (\S+)$', '\2 \1')
        else b.norm
      end as rev
    from base b
  ),
  cand as (
    -- branch 1: index-backed trigram candidates, both name orders
    select b.*
    from public.registry_blacklist b, q
    where b.type = 'INDIVIDUAL'
      and (b.entity_name % q.norm or b.entity_name % q.rev)
    union
    -- branch 2: index-backed alias candidates
    select b.*
    from public.registry_blacklist b, q
    where b.type = 'INDIVIDUAL'
      and exists (
        select 1
        from unnest(coalesce(b.aliases, '{}')) al
        where al % q.norm or al % q.rev
      )
  ),
  scored as (
    select
      c.entity_name,
      c.source_agency,
      c.reason_flagged,
      c.entity_identifier,
      c.aliases,
      q.norm,
      q.rev,
      (c.entity_name = q.norm or c.entity_name = q.rev) as name_exact,
      exists (
        select 1
        from unnest(coalesce(c.aliases, '{}')) a
        where upper(btrim(a)) = q.norm or upper(btrim(a)) = q.rev
      ) as alias_exact,
      greatest(
        similarity(c.entity_name, q.norm),
        similarity(c.entity_name, q.rev)
      ) as sim,
      (
        -- token overlap: query tokens (len >= 3) present in the
        -- candidate name or any alias
        select count(*)
        from unnest(q.toks) t
        where length(t) >= 3
          and (
            t = any (regexp_split_to_array(upper(c.entity_name), ' '))
            or exists (
              select 1
              from unnest(coalesce(c.aliases, '{}')) a
              where t = any (regexp_split_to_array(upper(a), ' '))
            )
          )
      ) as shared_tokens
    from cand c, q
  )
  select
    s.entity_name,
    s.source_agency::text,
    s.reason_flagged,
    (
      case
        when s.name_exact or s.alias_exact then 100
        when s.shared_tokens >= 2 then least(99, floor(s.sim * 100)::int)
        else 0
      end
    )::int as match_score,
    (
      case
        when s.name_exact or s.alias_exact then 0.99
        when s.shared_tokens >= 2 then round(least(0.95, (0.5 + s.sim * 0.45)::numeric), 2)
        else 0
      end
    )::numeric as confidence,
    s.entity_identifier
  from scored s
  where s.name_exact
     or s.alias_exact
     or s.shared_tokens >= 2
  order by
    case when s.name_exact or s.alias_exact then 100
         when s.shared_tokens >= 2 then least(99, floor(s.sim * 100)::int)
         else 0 end desc,
    s.entity_name
  limit 5;
$$;

-- ------------------------------------------------------------
-- C + D: assess_transfer_risk v3.2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assess_transfer_risk(
  p_account_number text,
  p_bank_name text,
  p_amount numeric default 0,
  p_is_new_recipient boolean default true,
  p_include_sandbox boolean default true,
  p_holder_name text default ''
)
RETURNS table (
  risk_level text,
  risk_score int,
  confidence numeric,
  reasons text[],
  source_registry text[],
  primary_match_flags text[],
  recommended_action text,
  total_reports integer,
  social_proof text,
  account_name text,
  flagged_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acct RECORD;
  v_report_count int := 0;
  v_recent_report_count int := 0;
  v_score int := 0;
  v_level text := 'safe';
  v_reasons text[] := '{}';
  v_registry text[] := '{}';
  v_flags text[] := '{}';
  v_conf numeric;
  v_action text;
  v_match RECORD;
  v_nmatch RECORD;
  v_pep_only boolean := false;
  v_watch boolean := false;
  v_fuzzy_distance int;
  v_registry_block_min int;
  v_registry_watch_min int;
  v_band_warning int;
  v_band_high int;
  v_escalation int;
  v_hard_reports int;
  v_high_amount numeric;
  v_window_days int;
  v_report_0 int;
  v_report_1_2 int;
  v_report_3_5 int;
  v_report_ge6 int;
  v_flagged_points int;
  v_name_unverified_points int;
  v_new_recipient_points int;
  v_high_amount_points int;
  v_verified_discount int;
  v_confidence_default numeric;
  v_confidence_low numeric;
begin
  -- Config
  v_band_warning     := public.risk_cfg_int('band_warning_min', 31);
  v_band_high        := public.risk_cfg_int('band_high_min', 61);
  v_escalation       := public.risk_cfg_int('escalation_reports', 6);
  v_hard_reports     := public.risk_cfg_int('hard_trigger_reports', 6);
  v_high_amount      := public.risk_cfg_numeric('high_amount_threshold', 150000);
  v_window_days      := public.risk_cfg_int('velocity_window_days', 30);
  v_report_0         := public.risk_cfg_int('points_report_0', 0);
  v_report_1_2       := public.risk_cfg_int('points_report_1_2', 20);
  v_report_3_5       := public.risk_cfg_int('points_report_3_5', 40);
  v_report_ge6       := public.risk_cfg_int('points_report_ge6', 65);
  v_flagged_points   := public.risk_cfg_int('points_flagged', 20);
  v_name_unverified_points := public.risk_cfg_int('points_name_unverified', 15);
  v_new_recipient_points   := public.risk_cfg_int('points_new_recipient', 10);
  v_high_amount_points     := public.risk_cfg_int('points_high_amount', 15);
  v_verified_discount := public.risk_cfg_int('discount_verified_business', -10);
  v_confidence_default := public.risk_cfg_numeric('confidence_default', 0.9);
  v_confidence_low     := public.risk_cfg_numeric('confidence_low', 0.75);
  v_fuzzy_distance     := public.risk_cfg_int('fuzzy_edit_distance', 2);
  v_registry_block_min := public.risk_cfg_int('registry_block_min', 70);
  v_registry_watch_min := public.risk_cfg_int('registry_watch_min', 40);

  -- Account lookup (sandbox-aware)
  select a.* into v_acct
  from public.accounts a
  where a.account_number = p_account_number
    and (p_bank_name = '' OR a.bank_name = p_bank_name)
    and (p_include_sandbox OR coalesce(a.source, '') <> 'sandbox')
  order by a.overall_risk_level desc
  limit 1;

  -- Report counts (life-time and within velocity window)
  if v_acct.id is not null then
    select count(*) into v_report_count
    from public.reports r
    where r.account_id = v_acct.id
      and (r.status is null or r.status = 'approved');

    select count(*) into v_recent_report_count
    from public.reports r
    where r.account_id = v_acct.id
      and (r.status is null or r.status = 'approved')
      and r.created_at >= now() - make_interval(days => v_window_days);
  end if;

  -- Score contributions (mirrors client processRisk exactly)
  -- 1. Community reports (banded)
  if v_report_count = 0 then
    v_score := v_score + v_report_0;
  elsif v_report_count <= 2 then
    v_score := v_score + v_report_1_2;
    v_reasons := array_append(v_reasons, 'Account has ' || v_report_count || ' community report(s)');
  elsif v_report_count <= 5 then
    v_score := v_score + v_report_3_5;
    v_reasons := array_append(v_reasons, 'Account has ' || v_report_count || ' community report(s)');
  else
    v_score := v_score + v_report_ge6;
    v_reasons := array_append(v_reasons, 'Flagged by ' || v_report_count || ' community reports as dangerous');
  end if;

  -- 2. Registry / flagged reason
  if coalesce(v_acct.flagged_reason, '') <> '' then
    v_score := v_score + v_flagged_points;
    v_reasons := array_append(v_reasons, v_acct.flagged_reason);
  end if;

  -- 3. Name-unverified contribution (server-side approximation)
  if v_acct.id is null then
    v_score := v_score + v_name_unverified_points;
    v_reasons := array_append(v_reasons, 'Account could not be verified in public databases — proceed with caution');
  end if;

  -- 4. Transfer-context signals
  if p_is_new_recipient then
    v_score := v_score + v_new_recipient_points;
    v_reasons := array_append(v_reasons, 'New recipient — no prior history with this account');
    v_flags := array_append(v_flags, 'new_recipient');
  end if;

  if p_amount >= v_high_amount then
    v_score := v_score + v_high_amount_points;
    v_reasons := array_append(v_reasons, 'Transfer amount is unusually high');
    v_flags := array_append(v_flags, 'high_amount');
  end if;

  -- 5. Velocity signal (recent reports spike)
  if v_recent_report_count >= v_hard_reports then
    v_flags := array_append(v_flags, 'recent_velocity_spike');
    v_reasons := array_append(v_reasons, v_recent_report_count || ' reports in the last ' || v_window_days || ' days');
  end if;

  -- 6. Verified business discount
  if v_acct.is_verified_business is true then
    v_score := greatest(0, v_score + v_verified_discount);
    v_reasons := array_append(v_reasons, 'Verified business profile found');
    v_flags := array_append(v_flags, 'verified_business');
  end if;

  -- 7. Registry blacklist — exact identifier match (account number / account
  --    id). Runs independent of name availability so sanctioned account
  --    numbers always surface their source agency.
  select *
  into v_match
  from public.registry_blacklist b
  where b.entity_identifier = p_account_number
     or (v_acct.id is not null and b.entity_identifier = v_acct.id::text)
  order by b.listed_at desc nulls last
  limit 1;

  if v_match.id is not null then
    if not v_registry @> array[v_match.source_agency::text] then
      v_registry := array_append(v_registry, v_match.source_agency::text);
    end if;
    v_reasons := array_append(v_reasons, coalesce(v_match.reason_flagged, 'Matched registry blacklist'));
    if not v_flags @> array['registry_match'] then
      v_flags := array_append(v_flags, 'registry_match');
    end if;
  end if;

  -- 7b. Fuzzy name match against a registered account name (anti-evasion).
  --     Index-backed trigram (>= 0.85 ~= edit distance 2 on typical name
  --     lengths). Previously an unbounded levenshtein() scan, which cost
  --     ~321ms per call once the corpus passed 36k rows.
  if v_acct.id is not null and coalesce(v_acct.account_name, '') <> '' then
    select *
    into v_match
    from public.registry_blacklist b
    where b.type = 'INDIVIDUAL'
      and b.entity_name % v_acct.account_name
      and similarity(b.entity_name, v_acct.account_name) >= 0.85
    order by b.listed_at desc nulls last
    limit 1;

    if v_match.id is not null then
      if not v_registry @> array[v_match.source_agency::text] then
        v_registry := array_append(v_registry, v_match.source_agency::text);
      end if;
      v_reasons := array_append(v_reasons, coalesce(v_match.reason_flagged, 'Matched registry blacklist'));
      if not v_flags @> array['registry_match'] then
        v_flags := array_append(v_flags, 'registry_match');
      end if;
    end if;
  end if;

  -- 7c. Holder-name screening against registry (SANCTIONS/PEP).
  --     Runs independent of the account row, so verified holder names
  --     are screened even when no accounts row exists.
  --     Two-tier: only registry_block_min+ non-PEP hits are hard blocks;
  --     weaker non-PEP hits become a non-blocking registry_watch.
  if coalesce(p_holder_name, '') <> '' then
    for v_nmatch in
      select s.* from public.screen_person_name(p_holder_name) s
      where s.match_score >= v_registry_watch_min
    loop
      if v_nmatch.source_agency = 'PEP' then
        if not v_registry @> array['PEP'] then
          v_registry := array_append(v_registry, 'PEP');
        end if;
        v_reasons := array_append(v_reasons, coalesce(v_nmatch.reason_flagged,
          'Name matches PEP entry "' || v_nmatch.entity_name || '" (' || v_nmatch.match_score || '% match)'));
        if not v_flags @> array['pep_match'] then
          v_flags := array_append(v_flags, 'pep_match');
        end if;
      elsif v_nmatch.match_score >= v_registry_block_min then
        if not v_registry @> array[v_nmatch.source_agency] then
          v_registry := array_append(v_registry, v_nmatch.source_agency);
        end if;
        v_reasons := array_append(v_reasons, coalesce(v_nmatch.reason_flagged,
          'Name matches ' || v_nmatch.source_agency || ' entry "' || v_nmatch.entity_name || '" (' || v_nmatch.match_score || '% match)'));
        if not v_flags @> array['registry_match'] then
          v_flags := array_append(v_flags, 'registry_match');
        end if;
      else
        -- Weak fuzzy similarity: surfaced for review, never blocks.
        v_watch := true;
        v_reasons := array_append(v_reasons, coalesce(v_nmatch.reason_flagged,
          'Weak ' || v_nmatch.source_agency || ' name similarity to "' || v_nmatch.entity_name ||
          '" (' || v_nmatch.match_score || '% match) — below the block threshold, flagged for human review'));
        if not v_flags @> array['registry_watch'] then
          v_flags := array_append(v_flags, 'registry_watch');
        end if;
      end if;
      exit;
    end loop;
  end if;

  -- 8. Hard anti-FN triggers. PEP-only matches and weak registry
  --    similarities are enhanced-due-diligence signals (REVIEW, not
  --    block); SANCTIONS/EFCC/ICP/CAC/CIPC/INTERPOL hits above
  --    registry_block_min are hard anti-FN triggers (BLOCK).
  v_pep_only := cardinality(v_registry) > 0 and v_registry <@ array['PEP'];

  if (v_report_count >= v_hard_reports)
     or (coalesce(v_acct.overall_risk_level, '') = 'high_risk')
     or (coalesce(v_acct.flagged_reason, '') ilike 'EFCC%')
     or (cardinality(v_registry) > 0 and not v_pep_only)
  then
    v_level := 'high_risk';
    v_score := greatest(v_score, v_band_high);
    v_action := 'BLOCK';
  elsif v_pep_only or v_watch then
    v_level := 'warning';
    v_score := greatest(v_score, v_band_warning);
    v_action := 'REVIEW';
  elsif v_score >= v_band_high then
    v_level := 'high_risk';
    v_action := 'BLOCK';
  elsif v_score >= v_band_warning then
    v_level := 'warning';
    v_action := 'REVIEW';
  else
    v_level := 'safe';
    v_action := 'ALLOW';
  end if;

  -- Confidence
  v_conf := case when v_acct.id is null then v_confidence_low else v_confidence_default end;
  if v_report_count > 0 then
    v_conf := least(0.99, v_conf + 0.04 * least(v_report_count, 3));
  end if;
  if cardinality(v_registry) > 0 then
    v_conf := greatest(v_conf, 0.9);
  end if;

  -- Recommended action refinement for high-value transfers
  if v_level = 'high_risk' and p_amount >= v_high_amount then
    v_action := 'FORCE_MANDATORY_SECONDARY_OTP';
  end if;

  if array_length(v_flags, 1) is null and v_level = 'safe' then
    v_flags := array_append(v_flags, 'clean_history');
  end if;

  return query select
    v_level,
    v_score,
    round(v_conf, 2),
    coalesce(
      case when array_length(v_reasons, 1) is null then array['No negative history found — account appears safe'] else v_reasons end,
      array['No negative history found — account appears safe']
    ),
    coalesce(v_registry, '{}'),
    coalesce((select array_agg(f) from (select unnest(v_flags) as f limit greatest(public.risk_cfg_int('max_flags', 4), 1)) s), '{}'),
    v_action,
    v_report_count,
    case
      when v_report_count >= v_escalation then v_report_count || ' people flagged this account recently.'
      when v_report_count > 0 then v_report_count || ' community report(s) found for this account'
      when v_acct.id is not null then 'Account has no negative history in our database'
      else 'No reports found — first time this account has been checked'
    end,
    v_acct.account_name,
    v_acct.flagged_reason;
end;
$$;
