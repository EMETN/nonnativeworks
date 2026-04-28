CREATE OR REPLACE FUNCTION top_companies_by_english(lim int DEFAULT 5)
RETURNS TABLE (
  name             text,
  total_positions  bigint,
  english_positions bigint,
  english_percentage numeric,
  country_count    bigint,
  primary_country_slug text
) AS $$
  WITH per_company_country AS (
    SELECT
      co.name,
      co.country_id,
      c.slug AS country_slug,
      COUNT(p.id) AS total,
      COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english
    FROM companies co
    JOIN countries c ON c.id = co.country_id
    LEFT JOIN positions p ON p.company_id = co.id
    GROUP BY co.name, co.country_id, c.slug
  ),
  grouped AS (
    SELECT
      pcc.name,
      SUM(pcc.total)   AS total_positions,
      SUM(pcc.english)  AS english_positions,
      CASE
        WHEN SUM(pcc.total) > 0 THEN ROUND(SUM(pcc.english)::numeric / SUM(pcc.total) * 100)
        ELSE 0
      END AS english_percentage,
      COUNT(*)          AS country_count
    FROM per_company_country pcc
    GROUP BY pcc.name
    ORDER BY english_positions DESC
    LIMIT lim
  ),
  best_country AS (
    SELECT DISTINCT ON (pcc.name)
      pcc.name,
      pcc.country_slug
    FROM per_company_country pcc
    JOIN grouped g ON g.name = pcc.name
    ORDER BY pcc.name, pcc.english DESC
  )
  SELECT
    g.name,
    g.total_positions,
    g.english_positions,
    g.english_percentage,
    g.country_count,
    bc.country_slug AS primary_country_slug
  FROM grouped g
  JOIN best_country bc ON bc.name = g.name
  ORDER BY g.english_positions DESC;
$$ LANGUAGE sql SECURITY INVOKER;
