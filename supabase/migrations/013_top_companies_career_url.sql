-- Add career_page_url to top_companies_by_english so the /companies grid can link
-- companies with no English-friendly positions straight out to their careers page.
-- The URL is taken from the company's primary country row (the one that also
-- supplies primary_country_slug).
--
-- DROP first: Postgres cannot change a function's return type (new OUT column)
-- via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS top_companies_by_english(integer);

CREATE FUNCTION top_companies_by_english(lim int DEFAULT 5)
RETURNS TABLE (
  name             text,
  total_positions  bigint,
  english_positions bigint,
  english_percentage numeric,
  country_count    bigint,
  primary_country_slug text,
  career_page_url  text
) AS $$
  WITH per_company_country AS (
    SELECT
      co.name,
      co.country_id,
      c.slug AS country_slug,
      co.career_page_url,
      COUNT(p.id) AS total,
      COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english
    FROM companies co
    JOIN countries c ON c.id = co.country_id
    LEFT JOIN positions p ON p.company_id = co.id
    GROUP BY co.name, co.country_id, c.slug, co.career_page_url
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
    LIMIT CASE WHEN lim > 0 THEN lim ELSE NULL END
  ),
  best_country AS (
    SELECT DISTINCT ON (pcc.name)
      pcc.name,
      pcc.country_slug,
      pcc.career_page_url
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
    bc.country_slug AS primary_country_slug,
    bc.career_page_url
  FROM grouped g
  JOIN best_country bc ON bc.name = g.name
  ORDER BY g.english_positions DESC;
$$ LANGUAGE sql SECURITY INVOKER;
