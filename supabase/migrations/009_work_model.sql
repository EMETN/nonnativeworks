-- Add work_model column to positions
-- Stores the work arrangement when available (parsed from ATS location strings like "Hybrid - Helsinki").
-- NULL means no information was available.
ALTER TABLE positions
  ADD COLUMN work_model TEXT CHECK (work_model IN ('remote', 'hybrid', 'on-site'));
