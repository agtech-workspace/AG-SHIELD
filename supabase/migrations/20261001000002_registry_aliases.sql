-- Canonical registry aliases with trigram index (non-destructive)
CREATE TABLE IF NOT EXISTS public.registry_aliases (
  id SERIAL PRIMARY KEY,
  registry_blacklist_id UUID NOT NULL REFERENCES public.registry_blacklist(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registry_aliases_registry_id ON public.registry_aliases (registry_blacklist_id);
CREATE INDEX IF NOT EXISTS idx_registry_aliases_alias_trgm ON public.registry_aliases USING gin (alias_name gin_trgm_ops);

-- Backfill from existing alias arrays if present
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='registry_blacklist' AND column_name='aliases'
  ) INTO col_exists;

  IF col_exists THEN
    INSERT INTO public.registry_aliases (registry_blacklist_id, alias_name)
    SELECT rb.id, trim(a.elem)
    FROM public.registry_blacklist rb
    CROSS JOIN LATERAL unnest(rb.aliases) AS a(elem)
    WHERE rb.aliases IS NOT NULL AND array_length(rb.aliases, 1) > 0
    ON CONFLICT DO NOTHING;
  END IF;
END$$;
