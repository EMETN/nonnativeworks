-- Application-level change log powering the admin Publish button's unpublished
-- count + breakdown. One semantic row per admin mutation (see the endpoints).
CREATE TABLE admin_changes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT        NOT NULL CHECK (entity_type IN ('company','position','skill')),
  action      TEXT        NOT NULL CHECK (action IN ('created','updated','deleted')),
  label       TEXT        NOT NULL,
  changed_by  TEXT        NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_changes_changed_at_idx ON admin_changes (changed_at DESC);

ALTER TABLE admin_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read admin changes"   ON admin_changes FOR SELECT USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth insert admin changes" ON admin_changes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Grouped counts of unpublished changes; grouping in SQL avoids PostgREST's
-- silent 1000-row cap on a bulk row fetch.
CREATE FUNCTION admin_change_summary(since timestamptz)
RETURNS TABLE(entity_type text, action text, count bigint)
LANGUAGE sql STABLE AS $$
  SELECT entity_type, action, count(*)::bigint
  FROM admin_changes
  WHERE changed_at > since
  GROUP BY entity_type, action;
$$;

-- Live Netlify build state, kept current by the signed deploy webhook. Backs the
-- Publish button's build-in-progress indicator and publish lock for every build
-- trigger (button, scheduled CI, manual redeploy).
CREATE TABLE site_builds (
  deploy_id   TEXT        PRIMARY KEY,
  state       TEXT        NOT NULL,   -- 'building' | 'ready' | 'error'
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX site_builds_created_at_idx ON site_builds (created_at DESC);

ALTER TABLE site_builds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read site builds" ON site_builds FOR SELECT USING (auth.role() = 'authenticated');
-- Only the service client (webhook endpoint) writes; no insert/update policy.
