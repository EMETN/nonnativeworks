-- Reset all scraped data while preserving schema, categories, and countries.
-- Run this in the Supabase SQL editor when you want a clean slate before re-scraping.
--
-- Wipes: positions, companies, company_snapshots
-- Keeps: countries, categories, all schema/views/indexes/RLS policies
--
-- Optional second step: also remove countries that were auto-created by the
-- upload API and are no longer referenced by any company.

TRUNCATE positions, company_snapshots, companies;

-- Uncomment to also remove auto-created country rows:
-- DELETE FROM countries
-- WHERE id NOT IN (SELECT DISTINCT country_id FROM companies);
