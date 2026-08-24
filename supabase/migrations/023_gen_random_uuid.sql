-- Advisor Center (Security: extension_in_public): the uuid-ossp extension backs
-- every table's id DEFAULT via uuid_generate_v4(). Postgres has a built-in
-- gen_random_uuid() (pg_catalog, since PG13) that needs no extension. Switch all
-- defaults to it, then drop uuid-ossp entirely.
--
-- Defaults only affect new rows; existing ids are untouched. uuid_generate_v4()
-- is referenced only in these id defaults (verified across migrations and app
-- code), so dropping the extension is safe.
ALTER TABLE countries         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE categories        ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE companies         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE positions         ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE company_snapshots ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE skills            ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE skill_snapshots   ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE site_publishes    ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE admin_changes     ALTER COLUMN id SET DEFAULT gen_random_uuid();

DROP EXTENSION IF EXISTS "uuid-ossp";
