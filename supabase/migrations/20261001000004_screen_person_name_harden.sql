-- Harden screen_person_name: input guard only.
-- Rewritten (2026-10-06) to preserve the LIVE function contract from
-- 20260929000007_stage2_corpus_hardening.sql: 6-column return type and
-- SQL-language semantics. The prior draft changed the return type to
-- 3 columns, which PostgreSQL rejects ("cannot change return type of
-- existing function") and would also break the LIVE caller
-- assess_transfer_risk (reads .reason_flagged). Agency severity ordering
-- (SANCTIONS/PEP branches) was removed as dead weight — live callers
-- already order by match_score. Exact/alias matches score 100; shared-
-- token trigram hits score least(99, floor(sim*100)); up to 5 results.
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
    where length(b.norm) >= 1
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