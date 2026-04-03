-- Change city from TEXT to TEXT[] so each position stores a clean list of
-- city names relevant only to that position's country (no country names
-- mixed in, no other-country cities).
-- Existing data is in a garbage free-text format, so we null it all out.
ALTER TABLE positions
  ALTER COLUMN city TYPE text[]
  USING NULL;
