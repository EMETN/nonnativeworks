-- Full schema for a fresh NonNativeWorks database.
-- This is the consolidated version of all incremental migrations (001–009).
-- Run this file in the Supabase SQL editor on a brand-new project instead of
-- running the individual migration files one by one.

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE countries (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL UNIQUE,
  slug       TEXT        NOT NULL UNIQUE,
  code       CHAR(2)     NOT NULL UNIQUE,   -- ISO 3166-1 alpha-2
  flag_colors TEXT[]     NOT NULL,           -- e.g. ARRAY['#002F6C','#FFFFFF']
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE companies (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT        NOT NULL,
  country_id       UUID        NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  career_page_url  TEXT,
  is_english_company BOOLEAN   NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, country_id)
);

CREATE TABLE positions (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                    TEXT        NOT NULL,
  category_id              UUID        NOT NULL REFERENCES categories(id),
  requires_native_language BOOLEAN     NOT NULL DEFAULT true,
  local_language_advantage BOOLEAN     NOT NULL DEFAULT false,
  url                      TEXT,
  city                     TEXT[],
  required_languages       TEXT[]      NOT NULL DEFAULT '{}',
  preferred_languages      TEXT[]      NOT NULL DEFAULT '{}',
  work_model               TEXT        CHECK (work_model IN ('remote', 'hybrid', 'on-site')),
  extracted_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE company_snapshots (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Denormalised name (not company_id) so snapshots survive company row deletions/re-creations
  company_name      TEXT        NOT NULL,
  country_id        UUID        NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  total_positions   INT         NOT NULL,
  english_positions INT         NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_companies_country        ON companies(country_id);
CREATE INDEX idx_positions_company        ON positions(company_id);
CREATE INDEX idx_positions_category       ON positions(category_id);
CREATE INDEX idx_positions_native         ON positions(requires_native_language);
CREATE INDEX idx_positions_lang_advantage ON positions(local_language_advantage);
CREATE INDEX idx_snapshots_lookup         ON company_snapshots(company_name, country_id, snapshotted_at DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- Aggregated stats per country (used on homepage)
CREATE VIEW country_stats AS
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
  MAX(co.updated_at) AS last_updated
FROM countries c
LEFT JOIN companies co ON co.country_id = c.id
LEFT JOIN positions p ON p.company_id = co.id
GROUP BY c.id
ORDER BY c.sort_order;

-- Aggregated stats per company (used on country pages)
CREATE VIEW company_stats AS
SELECT
  co.id AS company_id,
  co.name,
  co.country_id,
  co.career_page_url,
  co.is_english_company,
  co.updated_at,
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
  ARRAY_AGG(DISTINCT cat.name) FILTER (WHERE cat.name IS NOT NULL) AS categories
FROM companies co
LEFT JOIN positions p ON p.company_id = co.id
LEFT JOIN categories cat ON cat.id = p.category_id
GROUP BY co.id;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Returns the count of distinct company names across all countries.
-- Avoids double-counting companies that operate in multiple countries.
CREATE OR REPLACE FUNCTION count_distinct_companies()
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT name) FROM companies;
$$ LANGUAGE sql SECURITY DEFINER;

-- Trigger function: keep updated_at current on companies
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE countries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_snapshots  ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read countries"         ON countries         FOR SELECT USING (true);
CREATE POLICY "Public read categories"        ON categories        FOR SELECT USING (true);
CREATE POLICY "Public read companies"         ON companies         FOR SELECT USING (true);
CREATE POLICY "Public read positions"         ON positions         FOR SELECT USING (true);
CREATE POLICY "Public read snapshots"         ON company_snapshots FOR SELECT USING (true);

-- Authenticated write (admin only)
CREATE POLICY "Auth insert companies"  ON companies  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update companies"  ON companies  FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete companies"  ON companies  FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth insert positions"  ON positions  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update positions"  ON positions  FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete positions"  ON positions  FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth insert snapshots"  ON company_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth delete snapshots"  ON company_snapshots FOR DELETE USING     (auth.role() = 'authenticated');

-- ============================================================
-- SEED: CATEGORIES
-- ============================================================

INSERT INTO categories (name, slug, sort_order) VALUES
  ('Engineering & IT',     'engineering',        1),
  ('Data & Analytics',     'data-analytics',     2),
  ('Product',              'product',            3),
  ('Design',               'design',             4),
  ('Marketing',            'marketing',          5),
  ('Sales',                'sales',              6),
  ('Customer Success',     'customer-success',   7),
  ('Customer Support',     'customer-support',   8),
  ('Operations',           'operations',         9),
  ('Finance & Accounting', 'finance-accounting', 10),
  ('HR & Recruiting',      'hr-recruiting',      11),
  ('Legal',                'legal',              12),
  ('Other',                'other',              13);
