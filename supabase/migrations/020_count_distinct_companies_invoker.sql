-- Advisor Center (Security): count_distinct_companies() is exposed via
-- /rest/v1/rpc and callable by the anon and authenticated roles as a
-- SECURITY DEFINER function, which runs with the (bypassrls) owner's
-- privileges. It only counts companies, a table with a public-read RLS policy,
-- so the caller's own privileges suffice. Switch to SECURITY INVOKER to drop
-- the escalation; the returned count is unchanged.
ALTER FUNCTION count_distinct_companies() SECURITY INVOKER;
