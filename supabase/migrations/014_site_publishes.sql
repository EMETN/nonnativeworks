-- Records every request to rebuild the public site: backs rate limiting (serverless has
-- no shared memory), in-flight detection, and an audit trail.

CREATE TABLE site_publishes (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by TEXT        NOT NULL
);

CREATE INDEX site_publishes_triggered_at_idx
  ON site_publishes (triggered_at DESC);

ALTER TABLE site_publishes ENABLE ROW LEVEL SECURITY;

-- Operational data: no public read policy.
CREATE POLICY "Auth read site publishes"   ON site_publishes FOR SELECT USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth insert site publishes" ON site_publishes FOR INSERT WITH CHECK (auth.role() = 'authenticated');
