-- Must run before the next CZ upload, or the new 'czechia' slug auto-creates a duplicate row and hits UNIQUE(code).
UPDATE countries
SET name = 'Czechia', slug = 'czechia'
WHERE code = 'CZ';
