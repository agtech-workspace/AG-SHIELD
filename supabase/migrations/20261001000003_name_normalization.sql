-- Add normalized_name with trigram index (non-destructive)
ALTER TABLE public.registry_blacklist
  ADD COLUMN IF NOT EXISTS normalized_name TEXT;

-- Normalize function for names: prefix-only honorific strip, collapse, punct strip, lowercase
CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name TEXT)
RETURNS TEXT AS $$
DECLARE
  v TEXT;
  -- Leading honorific prefixes (strip only when at start of multi-token string)
  prefix_re TEXT := '^(alhaji|hajia|chief|dr\.?|ph\.?d\.?|pastor|prophet|imam|engr\.?|barr\.?|mr\.?|mrs\.?|ms\.?)\b\s+';
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN NULL;
  END IF;
  v := lower(trim(p_name));
  -- Strip dots and commas
  v := regexp_replace(v, '[.,]+', ' ', 'g');
  -- Strip leading prefix if multi-token
  IF array_length(string_to_array(trim(regexp_replace(v, '\s+', ' ', 'g')), ' '), 1) >= 2 THEN
    v := regexp_replace(v, prefix_re, '', 'gi');
  END IF;
  -- Collapse whitespace
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := trim(v);
  IF length(v) = 0 THEN
    RETURN lower(trim(regexp_replace(p_name, '[.,]+', ' ', 'g')));
  END IF;
  RETURN v;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill
UPDATE public.registry_blacklist
SET normalized_name = normalize_person_name(entity_name)
WHERE normalized_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_registry_blacklist_norm_trgm ON public.registry_blacklist USING gin (normalized_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_registry_blacklist_name_trgm ON public.registry_blacklist USING gin (entity_name gin_trgm_ops);
