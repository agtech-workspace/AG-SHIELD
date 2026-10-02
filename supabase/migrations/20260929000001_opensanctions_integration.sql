-- ============================================================
-- OpenSanctions integration — Nigerian-first sanctions/PEP registry
-- Stage 1 datasets: ng_nigsac_sanctions, ng_chipper_peps,
--   ng_join_dots, interpol_red_notices (NG-filtered)
-- Adds: blacklist_source values SANCTIONS + PEP, registry_blacklist
--   enrichment (aliases, birth_date), pg_trgm, screen_person_name RPC,
--   registry_sync_log (observability).
-- ============================================================

-- 1. New registry agencies
ALTER TYPE public.blacklist_source ADD VALUE IF NOT EXISTS 'SANCTIONS';
ALTER TYPE public.blacklist_source ADD VALUE IF NOT EXISTS 'PEP';

-- 2. Trigram similarity for fuzzy name screening
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Enrich registry_blacklist
ALTER TABLE public.registry_blacklist
  ADD COLUMN IF NOT EXISTS aliases text[],
  ADD COLUMN IF NOT EXISTS birth_date date;

-- identifier-less rows de-dupe on (name, agency, type)
DROP INDEX IF EXISTS idx_blacklist_name_agency_type;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blacklist_name_agency_type
  ON public.registry_blacklist (LOWER(entity_name), source_agency, type)
  WHERE entity_identifier IS NULL;

-- Trigram index for name screening lookups
CREATE INDEX IF NOT EXISTS idx_blacklist_name_trgm
  ON public.registry_blacklist USING gin (entity_name gin_trgm_ops);

-- 4. Sync observability
CREATE TABLE IF NOT EXISTS public.registry_sync_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_code text NOT NULL,
  rows_upserted int NOT NULL DEFAULT 0,
  rows_skipped int NOT NULL DEFAULT 0,
  account_seeds int NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now()
);

-- 5. screen_person_name — normalize + dual-name-order + alias screening.
--    Matches INDIVIDUAL registry rows whose name (either order) or alias
--    is trigram-similar or within edit distance 2 of the input name.
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
  with q as (
    select
      regexp_replace(upper(btrim(p_name)), E'\\s+', ' ', 'g') as norm,
      regexp_replace(
        regexp_replace(upper(btrim(p_name)), E'\\s+', ' ', 'g'),
        E'^(.+) (\\S+)$',
        '\\2 \\1'
      ) as reversed
  ),
  hits as (
    select b.*, q.norm, q.reversed
    from public.registry_blacklist b
    cross join q
    where b.type = 'INDIVIDUAL'
      and (
        b.entity_name % q.norm
        or b.entity_name % q.reversed
        or exists (
          select 1 from unnest(coalesce(b.aliases, '{}')) al
          where al % q.norm or al % q.reversed
        )
        or levenshtein(lower(b.entity_name), lower(q.norm)) <= 2
        or levenshtein(lower(b.entity_name), lower(q.reversed)) <= 2
      )
  )
  select h.entity_name,
         h.source_agency::text,
         h.reason_flagged,
         (greatest(
           similarity(h.entity_name, h.norm)::numeric,
           similarity(h.entity_name, h.reversed)::numeric
         ) * 100)::int as match_score,
         round(least(0.99, 0.5 + greatest(
           similarity(h.entity_name, h.norm)::numeric,
           similarity(h.entity_name, h.reversed)::numeric
         ) * 0.5), 2) as confidence,
         h.entity_identifier
  from hits h
  order by confidence desc, h.entity_name
  limit 5;
$$;