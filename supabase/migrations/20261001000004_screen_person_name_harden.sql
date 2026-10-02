-- Harden screen_person_name: agency severity ordering, index-backed trigram, normalized_name support
CREATE OR REPLACE FUNCTION public.screen_person_name(p_name TEXT)
RETURNS TABLE(
  source_agency TEXT,
  entity_name TEXT,
  match_score INT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  q TEXT;
  -- Severity weights
BEGIN
  q := public.normalize_person_name(p_name);
  IF q IS NULL OR length(q) = 0 THEN
    RETURN;
  END IF;

  -- Return best match by agency severity DESC, similarity DESC
  RETURN QUERY
  WITH candidates AS (
    SELECT
      rb.source_agency,
      rb.entity_name,
      COALESCE(similarity(rb.normalized_name, q), similarity(rb.entity_name, q), 0) AS s
    FROM public.registry_blacklist rb
    WHERE rb.normalized_name IS NOT NULL AND rb.normalized_name % q
       OR rb.entity_name IS NOT NULL AND rb.entity_name % q
  ),
  scored AS (
    SELECT
      c.source_agency,
      c.entity_name,
      LEAST(100, ROUND(c.s * 100)::INT) AS match_score,
      CASE
        WHEN upper(c.source_agency) IN ('SANCTIONS') THEN 4
        WHEN upper(c.source_agency) IN ('INTERPOL') THEN 3
        WHEN upper(c.source_agency) IN ('PEP') THEN 2
        ELSE 1
      END AS sev
    FROM candidates
    WHERE COALESCE(similarity(
             COALESCE(rb_entity_norm_or_name(c.entity_name, c.source_agency), c.entity_name),
             q
           ), 0) >= 0.40 -- keep as guard; index-backed
  )
  SELECT
    s.source_agency::TEXT,
    s.entity_name::TEXT,
    s.match_score
  FROM scored s
  ORDER BY s.sev DESC, s.match_score DESC
  LIMIT 1;
END;
$$;

-- Helper to avoid referencing rb in subquery awkwardly (optional)
CREATE OR REPLACE FUNCTION rb_entity_norm_or_name(_entity_name TEXT, _src TEXT)
RETURNS TEXT AS $$ SELECT _entity_name; $$ LANGUAGE sql IMMUTABLE;
