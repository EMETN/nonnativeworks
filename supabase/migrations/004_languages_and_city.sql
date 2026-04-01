-- Add language arrays and city to positions
-- required_languages: languages explicitly required by the job ad (e.g. ["Finnish"])
-- preferred_languages: languages listed as a plus/advantage (e.g. ["Swedish"])
-- city: raw location string from the scraper before country resolution (e.g. "Tampere, Finland")

ALTER TABLE positions
  ADD COLUMN required_languages  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN preferred_languages text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN city                text;
