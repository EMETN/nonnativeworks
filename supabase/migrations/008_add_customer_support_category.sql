-- Add Customer Support as a distinct category from Customer Success.
INSERT INTO categories (name, slug, sort_order)
VALUES ('Customer Support', 'customer-support', 8);

-- Shift Operations and everything below it down by one
UPDATE categories SET sort_order =  9 WHERE slug = 'operations';
UPDATE categories SET sort_order = 10 WHERE slug = 'finance-accounting';
UPDATE categories SET sort_order = 11 WHERE slug = 'hr-recruiting';
UPDATE categories SET sort_order = 12 WHERE slug = 'legal';
UPDATE categories SET sort_order = 13 WHERE slug = 'other';
