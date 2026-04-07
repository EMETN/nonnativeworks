-- Update category names and slugs to match the new taxonomy.
-- Existing positions keep their category_id FK — only the category rows change.

-- Rename existing categories
UPDATE categories SET name = 'Engineering & IT'       WHERE slug = 'engineering';
UPDATE categories SET name = 'Customer Success',
                      slug = 'customer-success'        WHERE slug = 'customer-support';
UPDATE categories SET name = 'Finance & Accounting',
                      slug = 'finance-accounting'      WHERE slug = 'finance';
UPDATE categories SET name = 'HR & Recruiting',
                      slug = 'hr-recruiting'           WHERE slug = 'hr';

-- Insert new categories
INSERT INTO categories (name, slug, sort_order) VALUES
  ('Data & Analytics', 'data-analytics', 0),
  ('Product',          'product',        0);

-- Set final sort order for all categories
UPDATE categories SET sort_order =  1 WHERE slug = 'engineering';
UPDATE categories SET sort_order =  2 WHERE slug = 'data-analytics';
UPDATE categories SET sort_order =  3 WHERE slug = 'product';
UPDATE categories SET sort_order =  4 WHERE slug = 'design';
UPDATE categories SET sort_order =  5 WHERE slug = 'marketing';
UPDATE categories SET sort_order =  6 WHERE slug = 'sales';
UPDATE categories SET sort_order =  7 WHERE slug = 'customer-success';
UPDATE categories SET sort_order =  8 WHERE slug = 'operations';
UPDATE categories SET sort_order =  9 WHERE slug = 'finance-accounting';
UPDATE categories SET sort_order = 10 WHERE slug = 'hr-recruiting';
UPDATE categories SET sort_order = 11 WHERE slug = 'legal';
UPDATE categories SET sort_order = 12 WHERE slug = 'other';
