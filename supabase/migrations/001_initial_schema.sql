-- NonNativeWorks: Initial Schema
-- Run this in your Supabase SQL editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE countries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  code CHAR(2) NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2
  flag_colors TEXT[] NOT NULL,            -- e.g. ARRAY['#002F6C','#FFFFFF']
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  career_page_url TEXT,
  is_english_company BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, country_id)
);

CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id),
  requires_native_language BOOLEAN NOT NULL DEFAULT true,
  url TEXT,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_companies_country ON companies(country_id);
CREATE INDEX idx_positions_company ON positions(company_id);
CREATE INDEX idx_positions_category ON positions(category_id);
CREATE INDEX idx_positions_native ON positions(requires_native_language);

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
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read countries" ON countries FOR SELECT USING (true);
CREATE POLICY "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public read companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Public read positions" ON positions FOR SELECT USING (true);

-- Authenticated write access (admin only)
CREATE POLICY "Auth insert companies" ON companies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update companies" ON companies FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete companies" ON companies FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth insert positions" ON positions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update positions" ON positions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete positions" ON positions FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================================
-- SEED: CATEGORIES
-- ============================================================

INSERT INTO categories (name, slug, sort_order) VALUES
  ('Engineering',       'engineering',       1),
  ('Marketing',         'marketing',         2),
  ('Sales',             'sales',             3),
  ('HR',                'hr',                4),
  ('Finance',           'finance',           5),
  ('Design',            'design',            6),
  ('Operations',        'operations',        7),
  ('Customer Support',  'customer-support',  8),
  ('Legal',             'legal',             9),
  ('Other',             'other',             10);

-- ============================================================
-- HELPER FUNCTION: updated_at trigger
-- ============================================================

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
