-- Update evaluate_entity_risk_matrix to accept p_include_osint and enforce tiering
CREATE OR REPLACE FUNCTION public.evaluate_entity_risk_matrix(search_term TEXT, p_include_osint BOOLEAN DEFAULT FALSE)
RETURNS TABLE(
  is_blacklisted BOOLEAN,
  source_agency VARCHAR,
  reason_flagged TEXT,
  confidence_score REAL
)
AS $$
DECLARE
  q TEXT;
BEGIN
  q := public.normalize_person_name(search_term);
  IF q IS NULL OR length(q) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      rb.source_agency,
      rb.entity_name,
      rb.normalized_name,
      rb.reason_flagged,
      COALESCE(similarity(rb.normalized_name, q), similarity(rb.entity_name, q), 0) AS s
    FROM public.registry_blacklist rb
    WHERE (p_include_osint OR COALESCE(upper(rb.data_tier), 'OFFICIAL') <> 'OSINT')
      AND (
        (rb.normalized_name IS NOT NULL AND rb.normalized_name % q)
        OR (rb.entity_name IS NOT NULL AND rb.entity_name % q)
      )
  ),
  scored AS (
    SELECT
      b.source_agency,
      b.entity_name,
      b.reason_flagged,
      LEAST(1.0, b.s)::REAL AS confidence_score_raw,
      LEAST(100, ROUND(b.s * 100)::INT) AS match_score,
      CASE
        WHEN upper(b.source_agency::text) IN ('SANCTIONS') THEN 4
        WHEN upper(b.source_agency::text) IN ('INTERPOL') THEN 3
        WHEN upper(b.source_agency::text) IN ('PEP') THEN 2
        ELSE 1
      END AS sev
    FROM base
    WHERE b.s >= 0.40
  )
  SELECT
    TRUE::BOOLEAN AS is_blacklisted,
    s.source_agency::VARCHAR,
    s.reason_flagged::TEXT,
    s.confidence_score_raw
  FROM scored s
  ORDER BY s.sev DESC, s.match_score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
