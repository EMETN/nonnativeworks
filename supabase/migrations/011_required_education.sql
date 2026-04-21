-- ============================================================
-- 011: required_education on positions
-- Tracks the minimum education level stated in a job description.
-- Nullable — null means not specified or not required.
-- ============================================================

ALTER TABLE positions
  ADD COLUMN required_education TEXT
    CHECK (required_education IN ('vocational', 'bachelor', 'master', 'mba', 'phd'));
