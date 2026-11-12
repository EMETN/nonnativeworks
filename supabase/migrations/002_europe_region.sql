-- Regions: rows in `countries` that are not a single country. "Europe" holds remote
-- positions open across Europe (location "Europe" / "European Union" / "EU"), so
-- they get their own page at /europe. Regions are left out of country counts and
-- country lists; code 'EU' is reserved by ISO 3166-1 and fits the CHAR(2) column.
ALTER TABLE countries ADD COLUMN is_region BOOLEAN NOT NULL DEFAULT false;

INSERT INTO countries (name, slug, code, flag_colors, sort_order, is_region)
VALUES ('Europe', 'europe', 'EU', ARRAY['#003399', '#FFCC00'], 1000, true)
ON CONFLICT (code) DO UPDATE SET is_region = true;

-- New column goes last: CREATE OR REPLACE VIEW can only append columns.
CREATE OR REPLACE VIEW country_stats WITH (security_invoker = true) AS
SELECT
  c.id AS country_id,
  c.name,
  c.slug,
  c.code,
  c.flag_colors,
  c.sort_order,
  COUNT(p.id) AS total_positions,
  COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english_positions,
  CASE
    WHEN COUNT(p.id) > 0 THEN
      ROUND(
        (COUNT(p.id) FILTER (WHERE p.requires_native_language = false))::NUMERIC
        / COUNT(p.id) * 100,
        1
      )
    ELSE 0
  END AS english_percentage,
  MAX(co.updated_at) AS last_updated,
  c.is_region
FROM countries c
LEFT JOIN companies co ON co.country_id = c.id
LEFT JOIN positions p ON p.company_id = co.id
GROUP BY c.id
ORDER BY c.sort_order;
