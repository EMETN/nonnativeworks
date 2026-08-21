-- Advisor Center (Security): country_stats and company_stats were created
-- without security_invoker, so they run with the view owner's privileges and
-- bypass the querying role's RLS. Flip them to security_invoker so they enforce
-- the caller's RLS instead.
--
-- Safe: countries, companies, positions and categories each have a
-- "Public read ... USING (true)" policy, so anon/authenticated see the same
-- rows the views already returned.
ALTER VIEW country_stats SET (security_invoker = true);
ALTER VIEW company_stats SET (security_invoker = true);
