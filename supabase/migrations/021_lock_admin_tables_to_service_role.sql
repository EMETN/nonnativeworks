-- Advisor Center (Security: rls_policy_always_true + Performance:
-- auth_rls_initplan): the admin read/write policies allowed the authenticated
-- role to access these tables via the Data API (/rest/v1). Because the anon key
-- is public and project sign-ups can be enabled, a self-registered user could
-- obtain an authenticated session and read or mutate all data.
--
-- Every admin read and write in the app goes through the service-role client
-- (src/lib/supabase.ts), which bypasses RLS; route access is gated by the auth
-- middleware. No anon/authenticated principal ever needs Data-API access to
-- these tables. So drop the policies entirely: RLS stays enabled, and
-- RLS-enabled-with-no-policy denies all direct anon/authenticated access while
-- the service role continues to bypass RLS.
--
-- Drops are by policy name, so this reaches the same end state whether the
-- current policy is the original `auth.role() = 'authenticated'` form or any
-- later variant of the same name. Public read policies (countries, categories,
-- companies, positions, company_snapshots, skills) are left in place; the public
-- site reads them with the anon key.

-- companies: drop writes, keep "Public read companies"
DROP POLICY IF EXISTS "Auth insert companies" ON companies;
DROP POLICY IF EXISTS "Auth update companies" ON companies;
DROP POLICY IF EXISTS "Auth delete companies" ON companies;

-- positions: drop writes, keep "Public read positions"
DROP POLICY IF EXISTS "Auth insert positions" ON positions;
DROP POLICY IF EXISTS "Auth update positions" ON positions;
DROP POLICY IF EXISTS "Auth delete positions" ON positions;

-- company_snapshots: drop writes, keep "Public read snapshots"
DROP POLICY IF EXISTS "Auth insert snapshots" ON company_snapshots;
DROP POLICY IF EXISTS "Auth delete snapshots" ON company_snapshots;

-- skills: drop writes, keep "Public read skills"
DROP POLICY IF EXISTS "Auth insert skills" ON skills;
DROP POLICY IF EXISTS "Auth update skills" ON skills;
DROP POLICY IF EXISTS "Auth delete skills" ON skills;

-- skill_snapshots: admin-only, no public read -> no policy at all (service role only)
DROP POLICY IF EXISTS "Auth read snapshots" ON skill_snapshots;
DROP POLICY IF EXISTS "Auth insert skill snapshots" ON skill_snapshots;

-- site_publishes: service role only
DROP POLICY IF EXISTS "Auth read site publishes" ON site_publishes;
DROP POLICY IF EXISTS "Auth insert site publishes" ON site_publishes;

-- admin_changes: service role only
DROP POLICY IF EXISTS "Auth read admin changes" ON admin_changes;
DROP POLICY IF EXISTS "Auth insert admin changes" ON admin_changes;

-- site_builds: service role only
DROP POLICY IF EXISTS "Auth read site builds" ON site_builds;
