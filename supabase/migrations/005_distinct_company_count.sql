-- Returns the count of distinct company names across all countries.
-- Use this instead of COUNT(*) on the companies table to avoid
-- counting a company multiple times when it operates in multiple countries.

CREATE OR REPLACE FUNCTION count_distinct_companies()
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT name) FROM companies;
$$ LANGUAGE sql SECURITY DEFINER;
