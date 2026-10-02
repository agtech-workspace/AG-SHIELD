-- ============================================================
-- Risk Engine v2 (Phase A3)
-- Single authoritative, config-driven assess_transfer_risk.
-- Same signal/points model surfaced by the client mirror, now fully
-- driven by risk_config. Adds risk_score, confidence, source_registry,
-- primary_match_flags, recommended_action. Anti-FN hard triggers and
-- sandbox-aware lookups (source='sandbox' rows only resolve with
-- p_include_sandbox = true).
-- ============================================================

DROP FUNCTION IF EXISTS public.assess_transfer_risk(
  text, text, numeric, boolean
);

CREATE OR REPLACE FUNCTION public.assess_transfer_risk(
  p_account_number text,
  p_bank_name text,
  p_amount numeric default 0,
  p_is_new_recipient boolean default true,
  p_include_sandbox boolean default true
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
  v_fuzzy_distance int;
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
  --    Account row absent => cautious penalty. An un-named but otherwise
  --    clean account row is neutral (no fabricated signal invented).
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

  -- 7. Registry blacklist exact + fuzzy match (anti-evasion)
  if v_acct.id is not null and coalesce(v_acct.account_name, '') <> '' then
    select *
    into v_match
    from public.registry_blacklist b
    where b.entity_identifier = p_account_number
       or b.entity_identifier = v_acct.id::text
       or (
         b.type = 'INDIVIDUAL'
         and levenshtein(lower(b.entity_name), lower(v_acct.account_name)) <= v_fuzzy_distance
       )
       or (
         b.type = 'BUSINESS'
         and levenshtein(lower(b.entity_name), lower(coalesce(v_acct.account_name, ''))) <= v_fuzzy_distance
       )
    order by b.listed_at desc nulls last
    limit 1;

    if v_match.id is not null then
      v_registry := array_append(v_registry, v_match.source_agency::text);
      v_reasons := array_append(v_reasons, coalesce(v_match.reason_flagged, 'Matched registry blacklist'));
      v_flags := array_append(v_flags, 'registry_match');
    end if;
  end if;

  -- 8. Hard anti-FN triggers (cannot be scored below a band)
  if (v_report_count >= v_hard_reports)
     or (coalesce(v_acct.overall_risk_level, '') = 'high_risk')
     or (coalesce(v_acct.flagged_reason, '') ilike 'EFCC%')
     or cardinality(v_registry) > 0
  then
    v_level := 'high_risk';
    v_score := greatest(v_score, v_band_high);
    v_action := 'BLOCK';
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