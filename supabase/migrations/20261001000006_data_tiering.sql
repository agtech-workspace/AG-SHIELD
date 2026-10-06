-- Phase 2: Data tiering + extend blacklist_source (non-destructive)
-- Add CROWDSOURCED to blacklist_source enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'blacklist_source' AND e.enumlabel = 'CROWDSOURCED'
  ) THEN
    ALTER TYPE blacklist_source ADD VALUE 'CROWDSOURCED';
  END IF;
END$$;

-- Add data_tier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registry_blacklist' AND column_name='data_tier'
  ) THEN
    ALTER TABLE public.registry_blacklist ADD COLUMN data_tier TEXT NOT NULL DEFAULT 'OFFICIAL';
  END IF;
END$$;

-- Backfill
UPDATE public.registry_blacklist
SET data_tier = CASE
  WHEN upper(source_agency::text) IN ('CROWDSOURCED') THEN 'OSINT'
  WHEN upper(source_agency::text) IN ('SANCTIONS','INTERPOL','EFCC','ICP_NIGERIA','CAC','CIPC_SA') THEN 'OFFICIAL'
  ELSE 'OFFICIAL'
END
WHERE data_tier IS NULL OR data_tier = '';

-- Index
CREATE INDEX IF NOT EXISTS idx_registry_blacklist_data_tier ON public.registry_blacklist (data_tier, source_agency);
