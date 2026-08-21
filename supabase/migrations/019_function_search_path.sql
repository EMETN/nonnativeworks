-- Advisor Center (Security): the functions below had a role-mutable search_path,
-- so the schema used to resolve unqualified names depended on the caller's
-- search_path at call time (a hijacking vector, and worst for the SECURITY
-- DEFINER function). Pin each to an empty search_path and fully-qualify every
-- table reference. Built-ins (count, array_agg, now, round, sum, casts) still
-- resolve because pg_catalog is always searched implicitly.

-- No table references in the body, so only the setting needs to change.
ALTER FUNCTION update_updated_at() SET search_path = '';

-- SECURITY DEFINER: hardening the search_path matters most here.
CREATE OR REPLACE FUNCTION count_distinct_companies()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(DISTINCT name) FROM public.companies;
$$;

CREATE OR REPLACE FUNCTION admin_change_summary(since timestamptz)
RETURNS TABLE(entity_type text, action text, count bigint)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  WITH per_entity AS (
    SELECT
      entity_type,
      entity_id,
      (array_agg(before_state ORDER BY changed_at ASC,  id ASC))[1]  AS baseline,
      (array_agg(after_state  ORDER BY changed_at DESC, id DESC))[1] AS current_state
    FROM public.admin_changes
    WHERE changed_at > since
    GROUP BY entity_type, entity_id
  ),
  net AS (
    SELECT
      entity_type,
      CASE
        WHEN baseline IS NOT DISTINCT FROM current_state THEN NULL
        WHEN baseline IS NULL                            THEN 'created'
        WHEN current_state IS NULL                       THEN 'deleted'
        ELSE                                                  'updated'
      END AS action
    FROM per_entity
  )
  SELECT entity_type, action, count(*)::bigint
  FROM net
  WHERE action IS NOT NULL
  GROUP BY entity_type, action;
$$;

CREATE OR REPLACE FUNCTION top_companies_by_english(lim int DEFAULT 5)
RETURNS TABLE (
  name             text,
  total_positions  bigint,
  english_positions bigint,
  english_percentage numeric,
  country_count    bigint,
  primary_country_slug text,
  career_page_url  text
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH per_company_country AS (
    SELECT
      co.name,
      co.country_id,
      c.slug AS country_slug,
      co.career_page_url,
      COUNT(p.id) AS total,
      COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english
    FROM public.companies co
    JOIN public.countries c ON c.id = co.country_id
    LEFT JOIN public.positions p ON p.company_id = co.id
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
$$;
