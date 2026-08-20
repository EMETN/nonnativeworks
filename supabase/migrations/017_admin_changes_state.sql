-- Value-level net change: store a content fingerprint of each entity before and
-- after a mutation so an edit that returns to the published value (A -> B -> A,
-- or a re-scrape with identical data) nets to zero and does not trigger a deploy.
ALTER TABLE admin_changes ADD COLUMN before_state TEXT;
ALTER TABLE admin_changes ADD COLUMN after_state  TEXT;

-- Net-state summary: per distinct entity since `since`, compare the baseline
-- (before_state of the earliest change = the published value) against the
-- current state (after_state of the latest change). Equal -> no net change.
CREATE OR REPLACE FUNCTION admin_change_summary(since timestamptz)
RETURNS TABLE(entity_type text, action text, count bigint)
LANGUAGE sql STABLE AS $$
  WITH per_entity AS (
    SELECT
      entity_type,
      entity_id,
      (array_agg(before_state ORDER BY changed_at ASC,  id ASC))[1]  AS baseline,
      (array_agg(after_state  ORDER BY changed_at DESC, id DESC))[1] AS current_state
    FROM admin_changes
    WHERE changed_at > since
    GROUP BY entity_type, entity_id
  ),
  net AS (
    SELECT
      entity_type,
      CASE
        WHEN baseline IS NOT DISTINCT FROM current_state THEN NULL       -- back to published state
        WHEN baseline IS NULL                            THEN 'created'
        WHEN current_state IS NULL                       THEN 'deleted'
        ELSE                                                  'updated'
      END AS action
    FROM per_entity
  )
  SELECT entity_type, action, count(*)::bigint
  FROM net
  WHERE action IS NOT NULL
  GROUP BY entity_type, action;
$$;
