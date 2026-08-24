-- Advisor Center (Performance: unindexed_foreign_keys): these foreign-key
-- columns had no covering index, so joins/filters on them seq-scan and, more
-- importantly, deleting a parent row (country/category) must scan the whole
-- child table to enforce the constraint. Both country_id FKs are ON DELETE
-- CASCADE, so these indexes also speed up and de-risk deleting a country.
--
-- The other FKs are already covered: companies.country_id (idx_companies_country),
-- positions.company_id / category_id (idx_positions_*), skill_snapshots.company_id
-- and skill_id (skill_snapshots_company / skill_snapshots_skill_date).
-- company_snapshots.country_id is NOT covered by idx_snapshots_lookup because that
-- index leads with company_name.
CREATE INDEX IF NOT EXISTS idx_snapshots_country        ON company_snapshots(country_id);
CREATE INDEX IF NOT EXISTS idx_skill_snapshots_country  ON skill_snapshots(country_id);
CREATE INDEX IF NOT EXISTS idx_skill_snapshots_category ON skill_snapshots(category_id);
