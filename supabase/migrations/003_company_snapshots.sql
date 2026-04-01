-- NonNativeWorks: Company snapshots for trend tracking
-- Records a daily snapshot of position counts per (company, country) on each upload.
-- Old positions are replaced on update; snapshots persist indefinitely.

CREATE TABLE company_snapshots (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Denormalised name (not company_id) so snapshots survive company row deletions/re-creations
  company_name      TEXT        NOT NULL,
  country_id        UUID        NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  total_positions   INT         NOT NULL,
  english_positions INT         NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookups for charting trends (latest-first per company+country)
CREATE INDEX idx_snapshots_lookup
  ON company_snapshots(company_name, country_id, snapshotted_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE company_snapshots ENABLE ROW LEVEL SECURITY;

-- Public read (for future trend charts on the public site)
CREATE POLICY "Public read snapshots"
  ON company_snapshots FOR SELECT USING (true);

-- Service role handles writes via the upload API (bypasses RLS);
-- these policies cover direct authenticated access if ever needed.
CREATE POLICY "Auth insert snapshots"
  ON company_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth delete snapshots"
  ON company_snapshots FOR DELETE USING (auth.role() = 'authenticated');
