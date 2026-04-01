-- Add local_language_advantage column to positions
-- Tracks when a job posting lists the local language as an advantage/plus rather than a hard requirement

ALTER TABLE positions
  ADD COLUMN local_language_advantage BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_positions_lang_advantage ON positions(local_language_advantage);
