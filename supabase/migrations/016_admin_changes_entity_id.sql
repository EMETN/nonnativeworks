-- Track the changed entity's stable identity so the publish count collapses
-- repeated edits of the same entity into ONE net change (initial vs final state),
-- instead of counting each edit operation. entity_id is the position/skill UUID,
-- or the company name (its cross-country identity).
ALTER TABLE admin_changes ADD COLUMN entity_id TEXT;

-- Net-state summary: one row per distinct (entity_type, entity_id) since `since`,
-- reduced to its net effect vs the published baseline. created + deleted within
-- the window nets to nothing (the entity never went live).
CREATE OR REPLACE FUNCTION admin_change_summary(since timestamptz)
RETURNS TABLE(entity_type text, action text, count bigint)
LANGUAGE sql STABLE AS $$
  WITH per_entity AS (
    SELECT
      entity_type,
      entity_id,
      bool_or(action = 'created')                          AS created_in_window,
      (array_agg(action ORDER BY changed_at DESC, id DESC))[1] AS last_action
    FROM admin_changes
    WHERE changed_at > since
    GROUP BY entity_type, entity_id
  ),
  net AS (
    SELECT
      entity_type,
      CASE
        WHEN created_in_window AND last_action = 'deleted' THEN NULL
        WHEN created_in_window                             THEN 'created'
        WHEN last_action = 'deleted'                       THEN 'deleted'
        ELSE                                                   'updated'
      END AS action
    FROM per_entity
  )
  SELECT entity_type, action, count(*)::bigint
  FROM net
  WHERE action IS NOT NULL
  GROUP BY entity_type, action;
$$;
