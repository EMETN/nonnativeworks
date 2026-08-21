-- Full schema for a fresh nonnativeworks! database.
-- This is the consolidated version of all incremental migrations (001–009).
-- Run this file in the Supabase SQL editor on a brand-new project instead of
-- running the individual migration files one by one.

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE countries (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT        NOT NULL UNIQUE,
  slug       TEXT        NOT NULL UNIQUE,
  code       CHAR(2)     NOT NULL UNIQUE,   -- ISO 3166-1 alpha-2
  flag_colors TEXT[]     NOT NULL,           -- e.g. ARRAY['#002F6C','#FFFFFF']
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  sort_order INT  NOT NULL DEFAULT 0
);

CREATE TABLE companies (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT        NOT NULL,
  country_id       UUID        NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  career_page_url  TEXT,
  is_english_company BOOLEAN   NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, country_id)
);

CREATE TABLE positions (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                    TEXT        NOT NULL,
  category_id              UUID        NOT NULL REFERENCES categories(id),
  requires_native_language BOOLEAN     NOT NULL DEFAULT true,
  local_language_advantage BOOLEAN     NOT NULL DEFAULT false,
  url                      TEXT,
  city                     TEXT[],
  required_languages       TEXT[]      NOT NULL DEFAULT '{}',
  preferred_languages      TEXT[]      NOT NULL DEFAULT '{}',
  work_model               TEXT        CHECK (work_model IN ('remote', 'hybrid', 'on-site')),
  skills                   TEXT[]      NOT NULL DEFAULT '{}',
  required_education       TEXT        CHECK (required_education IN ('vocational', 'bachelor', 'master', 'mba', 'phd')),
  extracted_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE company_snapshots (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Denormalised name (not company_id) so snapshots survive company row deletions/re-creations
  company_name      TEXT        NOT NULL,
  country_id        UUID        NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  total_positions   INT         NOT NULL,
  english_positions INT         NOT NULL,
  snapshotted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE skills (
  id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_name TEXT    NOT NULL UNIQUE,
  category       TEXT    NOT NULL CHECK (category IN (
                           'language', 'framework', 'database',
                           'cloud', 'tool', 'methodology', 'api_style', 'certification', 'platform'
                         )),
  aliases        TEXT[]  NOT NULL DEFAULT '{}',
  is_legacy      BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE skill_snapshots (
  id             UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  captured_at    DATE    NOT NULL,
  company_id     UUID    NOT NULL REFERENCES companies(id)   ON DELETE CASCADE,
  country_id     UUID    NOT NULL REFERENCES countries(id)   ON DELETE CASCADE,
  category_id    UUID    NOT NULL REFERENCES categories(id),
  skill_id       UUID    NOT NULL REFERENCES skills(id)      ON DELETE CASCADE,
  position_count INT     NOT NULL,
  UNIQUE(captured_at, company_id, country_id, category_id, skill_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_companies_country        ON companies(country_id);
CREATE INDEX idx_positions_company        ON positions(company_id);
CREATE INDEX idx_positions_category       ON positions(category_id);
CREATE INDEX idx_positions_native         ON positions(requires_native_language);
CREATE INDEX idx_positions_lang_advantage ON positions(local_language_advantage);
CREATE INDEX idx_snapshots_lookup         ON company_snapshots(company_name, country_id, snapshotted_at DESC);
CREATE INDEX positions_skills_gin         ON positions USING GIN (skills);
CREATE INDEX skill_snapshots_skill_date   ON skill_snapshots(skill_id, captured_at DESC);
CREATE INDEX skill_snapshots_company      ON skill_snapshots(company_id, captured_at DESC);

-- ============================================================
-- VIEWS
-- ============================================================

-- Aggregated stats per country (used on homepage)
-- security_invoker: enforce the querying role's RLS, not the view owner's.
CREATE VIEW country_stats WITH (security_invoker = true) AS
SELECT
  c.id AS country_id,
  c.name,
  c.slug,
  c.code,
  c.flag_colors,
  c.sort_order,
  COUNT(p.id) AS total_positions,
  COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english_positions,
  CASE
    WHEN COUNT(p.id) > 0 THEN
      ROUND(
        (COUNT(p.id) FILTER (WHERE p.requires_native_language = false))::NUMERIC
        / COUNT(p.id) * 100,
        1
      )
    ELSE 0
  END AS english_percentage,
  MAX(co.updated_at) AS last_updated
FROM countries c
LEFT JOIN companies co ON co.country_id = c.id
LEFT JOIN positions p ON p.company_id = co.id
GROUP BY c.id
ORDER BY c.sort_order;

-- Aggregated stats per company (used on country pages)
-- security_invoker: enforce the querying role's RLS, not the view owner's.
CREATE VIEW company_stats WITH (security_invoker = true) AS
SELECT
  co.id AS company_id,
  co.name,
  co.country_id,
  co.career_page_url,
  co.is_english_company,
  co.updated_at,
  COUNT(p.id) AS total_positions,
  COUNT(p.id) FILTER (WHERE p.requires_native_language = false) AS english_positions,
  CASE
    WHEN COUNT(p.id) > 0 THEN
      ROUND(
        (COUNT(p.id) FILTER (WHERE p.requires_native_language = false))::NUMERIC
        / COUNT(p.id) * 100,
        1
      )
    ELSE 0
  END AS english_percentage,
  ARRAY_AGG(DISTINCT cat.name) FILTER (WHERE cat.name IS NOT NULL) AS categories
FROM companies co
LEFT JOIN positions p ON p.company_id = co.id
LEFT JOIN categories cat ON cat.id = p.category_id
GROUP BY co.id;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Returns the count of distinct company names across all countries.
-- Avoids double-counting companies that operate in multiple countries.
CREATE OR REPLACE FUNCTION count_distinct_companies()
RETURNS bigint AS $$
  SELECT COUNT(DISTINCT name) FROM companies;
$$ LANGUAGE sql SECURITY DEFINER;

-- Trigger function: keep updated_at current on companies
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE countries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_snapshots    ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Public read countries"         ON countries         FOR SELECT USING (true);
CREATE POLICY "Public read categories"        ON categories        FOR SELECT USING (true);
CREATE POLICY "Public read companies"         ON companies         FOR SELECT USING (true);
CREATE POLICY "Public read positions"         ON positions         FOR SELECT USING (true);
CREATE POLICY "Public read snapshots"         ON company_snapshots FOR SELECT USING (true);

-- Authenticated write (admin only)
CREATE POLICY "Auth insert companies"  ON companies  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update companies"  ON companies  FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete companies"  ON companies  FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth insert positions"  ON positions  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update positions"  ON positions  FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete positions"  ON positions  FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth insert snapshots"  ON company_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth delete snapshots"  ON company_snapshots FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Public read skills"          ON skills          FOR SELECT USING (true);
CREATE POLICY "Auth insert skills"          ON skills          FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update skills"          ON skills          FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete skills"          ON skills          FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth read snapshots"         ON skill_snapshots FOR SELECT USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth insert skill snapshots" ON skill_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- SEED: CATEGORIES
-- ============================================================

INSERT INTO categories (name, slug, sort_order) VALUES
  ('Engineering & IT',     'engineering',        1),
  ('Data & Analytics',     'data-analytics',     2),
  ('Product',              'product',            3),
  ('Design',               'design',             4),
  ('Marketing',            'marketing',          5),
  ('Sales',                'sales',              6),
  ('Customer Success',     'customer-success',   7),
  ('Customer Support',     'customer-support',   8),
  ('Operations',           'operations',         9),
  ('Finance & Accounting', 'finance-accounting', 10),
  ('HR & Recruiting',      'hr-recruiting',      11),
  ('Legal',                'legal',              12),
  ('Other',                'other',              13);

-- ============================================================
-- SEED: SKILLS
-- ============================================================

INSERT INTO skills (canonical_name, category, aliases) VALUES

-- Languages
('Assembly',      'language', ARRAY['assembly', 'asm', 'assembly language']),
('Bash',          'language', ARRAY['bash', 'shell scripting', 'shell script']),
('C',             'language', ARRAY['c programming', 'c language', 'c programming language']),
('C#',            'language', ARRAY['c#', 'csharp', 'c sharp']),
('C++',           'language', ARRAY['c++', 'cpp', 'c plus plus']),
('Clojure',       'language', ARRAY['clojure']),
('COBOL',         'language', ARRAY['cobol']),
('CSS',           'language', ARRAY['css', 'css3']),
('Dart',          'language', ARRAY['dart']),
('Elixir',        'language', ARRAY['elixir']),
('F#',            'language', ARRAY['f#', 'fsharp', 'f sharp']),
('Fortran',       'language', ARRAY['fortran']),
('Go',            'language', ARRAY['golang', 'go language', 'go lang', 'go programming']),
('Groovy',        'language', ARRAY['groovy']),
('Haskell',       'language', ARRAY['haskell']),
('HTML',          'language', ARRAY['html', 'html5']),
('Java',          'language', ARRAY['java']),
('JavaScript',    'language', ARRAY['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020']),
('Julia',         'language', ARRAY['julia']),
('Kotlin',        'language', ARRAY['kotlin']),
('Lua',           'language', ARRAY['lua']),
('Objective-C',   'language', ARRAY['objective-c', 'objc', 'objective c']),
('Perl',          'language', ARRAY['perl']),
('PHP',           'language', ARRAY['php']),
('PowerShell',    'language', ARRAY['powershell', 'power shell', 'pwsh']),
('Python',        'language', ARRAY['python', 'python3', 'python 3']),
('R',             'language', ARRAY['r programming', 'r language', 'rstudio', 'r studio']),
('Ruby',          'language', ARRAY['ruby']),
('Rust',          'language', ARRAY['rust', 'rustlang', 'rust lang']),
('Scala',         'language', ARRAY['scala']),
('SQL',           'language', ARRAY['sql', 'pl/sql', 'plsql', 't-sql', 'tsql']),
('Swift',         'language', ARRAY['swift']),
('TypeScript',    'language', ARRAY['typescript', 'ts']),
('VBA',           'language', ARRAY['vba', 'visual basic', 'visual basic for applications']),

-- Frameworks & libraries
('.NET',              'framework', ARRAY['.net', 'dotnet', 'dot net']),
('Angular',           'framework', ARRAY['angular', 'angularjs', 'angular.js']),
('Apache Beam',       'framework', ARRAY['apache beam', 'google dataflow']),
('Apache Flink',      'framework', ARRAY['apache flink', 'flink']),
('Apache Spark',      'framework', ARRAY['apache spark', 'spark', 'pyspark']),
('Apache Struts',     'framework', ARRAY['struts', 'apache struts', 'struts2', 'struts 2']),
('ASP.NET',           'framework', ARRAY['asp.net', 'aspnet', 'asp.net core', 'aspnetcore']),
('Bootstrap',         'framework', ARRAY['bootstrap']),
('Chakra UI',         'framework', ARRAY['chakra ui', 'chakra']),
('Django',            'framework', ARRAY['django']),
('Electron',          'framework', ARRAY['electron', 'electronjs', 'electron.js']),
('Express.js',        'framework', ARRAY['express', 'expressjs', 'express.js']),
('FastAPI',           'framework', ARRAY['fastapi', 'fast api']),
('Flutter',           'framework', ARRAY['flutter']),
('Flask',             'framework', ARRAY['flask']),
('Gatsby',            'framework', ARRAY['gatsby', 'gatsbyjs', 'gatsby.js']),
('Hadoop',            'framework', ARRAY['hadoop', 'apache hadoop', 'hdfs', 'mapreduce']),
('Hugging Face',      'framework', ARRAY['hugging face', 'huggingface', 'hf transformers']),
('Ionic',             'framework', ARRAY['ionic', 'ionic framework']),
('jQuery',            'framework', ARRAY['jquery', 'jquery ui', 'jquery mobile']),
('JSP',               'framework', ARRAY['jsp', 'java server pages', 'javaserver pages']),
('Keras',             'framework', ARRAY['keras']),
('Ktor',              'framework', ARRAY['ktor']),
('LangChain',         'framework', ARRAY['langchain', 'lang chain']),
('Laravel',           'framework', ARRAY['laravel']),
('Material UI',       'framework', ARRAY['material ui', 'material-ui', 'mui']),
('Micronaut',         'framework', ARRAY['micronaut']),
('NestJS',            'framework', ARRAY['nestjs', 'nest.js', 'nest js']),
('Next.js',           'framework', ARRAY['next.js', 'nextjs', 'next js']),
('Node.js',           'framework', ARRAY['node', 'nodejs', 'node.js', 'node js']),
('Nuxt.js',           'framework', ARRAY['nuxt', 'nuxt.js', 'nuxtjs', 'nuxt js']),
('NumPy',             'framework', ARRAY['numpy']),
('OpenCV',            'framework', ARRAY['opencv', 'open cv']),
('pandas',            'framework', ARRAY['pandas']),
('PyTorch',           'framework', ARRAY['pytorch', 'torch']),
('Quarkus',           'framework', ARRAY['quarkus']),
('Rails',             'framework', ARRAY['rails', 'ruby on rails', 'ror']),
('React',             'framework', ARRAY['react', 'reactjs', 'react.js']),
('React Native',      'framework', ARRAY['react native']),
('Redux',             'framework', ARRAY['redux', 'redux toolkit', 'rtk']),
('RxJava',            'framework', ARRAY['rxjava', 'rx java']),
('RxJS',              'framework', ARRAY['rxjs', 'rx.js', 'reactive extensions']),
('Remix',             'framework', ARRAY['remix', 'remix.run']),
('scikit-learn',      'framework', ARRAY['scikit-learn', 'sklearn', 'scikit learn']),
('Spring Boot',       'framework', ARRAY['spring boot', 'springboot', 'spring framework']),
('Styled Components', 'framework', ARRAY['styled components', 'styled-components']),
('Svelte',            'framework', ARRAY['svelte', 'sveltejs']),
('SvelteKit',         'framework', ARRAY['sveltekit', 'svelte kit']),
('SwiftUI',           'framework', ARRAY['swiftui', 'swift ui']),
('Symfony',           'framework', ARRAY['symfony']),
('Tailwind CSS',      'framework', ARRAY['tailwind', 'tailwindcss', 'tailwind css']),
('TensorFlow',        'framework', ARRAY['tensorflow', 'tensor flow']),
('UIKit',             'framework', ARRAY['uikit', 'ui kit']),
('Vue.js',            'framework', ARRAY['vue', 'vue.js', 'vuejs', 'vue js']),
('Zustand',           'framework', ARRAY['zustand']),

-- Databases
('BigQuery',       'database', ARRAY['bigquery', 'big query', 'google bigquery']),
('Cassandra',      'database', ARRAY['cassandra', 'apache cassandra']),
('ClickHouse',     'database', ARRAY['clickhouse', 'click house']),
('CockroachDB',    'database', ARRAY['cockroachdb', 'cockroach db']),
('DynamoDB',       'database', ARRAY['dynamodb', 'dynamo db', 'aws dynamodb']),
('Elasticsearch',  'database', ARRAY['elasticsearch', 'elastic search', 'opensearch']),
('Firestore',      'database', ARRAY['firestore', 'cloud firestore']),
('InfluxDB',       'database', ARRAY['influxdb', 'influx db']),
('MariaDB',        'database', ARRAY['mariadb', 'maria db']),
('MongoDB',        'database', ARRAY['mongodb', 'mongo']),
('MySQL',          'database', ARRAY['mysql']),
('Neo4j',          'database', ARRAY['neo4j', 'neo 4j']),
('NoSQL',          'database', ARRAY['nosql', 'no-sql', 'no sql']),
('Oracle',         'database', ARRAY['oracle', 'oracle db', 'oracle database']),
('PostgreSQL',     'database', ARRAY['postgresql', 'postgres', 'psql']),
('Redis',          'database', ARRAY['redis']),
('Redshift',       'database', ARRAY['redshift', 'aws redshift', 'amazon redshift']),
('Snowflake',      'database', ARRAY['snowflake']),
('SQL Server',     'database', ARRAY['sql server', 'mssql', 'microsoft sql server']),
('SQLite',         'database', ARRAY['sqlite', 'sqlite3']),
('Supabase',       'database', ARRAY['supabase']),

-- Cloud & infrastructure
('Ansible',              'cloud', ARRAY['ansible']),
('Application Insights', 'cloud', ARRAY['application insights', 'app insights', 'azure monitor']),
('ArgoCD',               'cloud', ARRAY['argocd', 'argo cd']),
('AWS',                  'cloud', ARRAY['aws', 'amazon web services']),
('Azure',                'cloud', ARRAY['azure', 'microsoft azure']),
('Azure Bicep',          'cloud', ARRAY['azure bicep', 'bicep', 'arm templates', 'azure arm']),
('Cloudflare',           'cloud', ARRAY['cloudflare']),
('CloudWatch',           'cloud', ARRAY['cloudwatch', 'aws cloudwatch', 'amazon cloudwatch']),
('Datadog',              'cloud', ARRAY['datadog', 'data dog']),
('Docker',               'cloud', ARRAY['docker', 'docker compose', 'docker swarm']),
('Google Cloud',         'cloud', ARRAY['google cloud', 'gcp', 'google cloud platform']),
('Grafana',              'cloud', ARRAY['grafana']),
('Helm',                 'cloud', ARRAY['helm', 'helm chart', 'helm charts']),
('Kubernetes',           'cloud', ARRAY['kubernetes', 'k8s']),
('Netlify',              'cloud', ARRAY['netlify']),
('New Relic',            'cloud', ARRAY['new relic', 'newrelic']),
('OpenShift',            'cloud', ARRAY['openshift', 'red hat openshift']),
('Prometheus',           'cloud', ARRAY['prometheus']),
('Pulumi',               'cloud', ARRAY['pulumi']),
('Terraform',            'cloud', ARRAY['terraform', 'hashicorp terraform', 'opentofu']),
('Vercel',               'cloud', ARRAY['vercel']),

-- Tools
('Apache Airflow',   'tool', ARRAY['airflow', 'apache airflow']),
('Bamboo',           'tool', ARRAY['bamboo', 'atlassian bamboo']),
('Bitbucket',        'tool', ARRAY['bitbucket']),
('CircleCI',         'tool', ARRAY['circleci', 'circle ci']),
('Confluence',       'tool', ARRAY['confluence', 'atlassian confluence']),
('CUDA',             'tool', ARRAY['cuda', 'nvidia cuda']),
('Cypress',          'tool', ARRAY['cypress']),
('dbt',              'tool', ARRAY['dbt', 'data build tool']),
('Figma',            'tool', ARRAY['figma']),
('Git',              'tool', ARRAY['git']),
('GitHub',           'tool', ARRAY['github']),
('GitHub Actions',   'tool', ARRAY['github actions']),
('GitLab',           'tool', ARRAY['gitlab']),
('GitLab CI',        'tool', ARRAY['gitlab ci', 'gitlab ci/cd']),
('Gradle',           'tool', ARRAY['gradle']),
('Jenkins',          'tool', ARRAY['jenkins']),
('Jest',             'tool', ARRAY['jest']),
('Jira',             'tool', ARRAY['jira', 'atlassian jira']),
('JUnit',            'tool', ARRAY['junit', 'junit5', 'junit 5']),
('Jupyter',          'tool', ARRAY['jupyter', 'jupyter notebook', 'jupyter lab', 'jupyterlab']),
('Kafka',            'tool', ARRAY['kafka', 'apache kafka']),
('Kibana',           'tool', ARRAY['kibana']),
('Kubeflow',         'tool', ARRAY['kubeflow', 'kube flow']),
('Linux',            'tool', ARRAY['linux', 'unix', 'ubuntu', 'centos', 'rhel', 'debian']),
('Looker',           'tool', ARRAY['looker', 'looker studio']),
('Maven',            'tool', ARRAY['maven', 'apache maven']),
('MLflow',           'tool', ARRAY['mlflow', 'ml flow']),
('Mocha',            'tool', ARRAY['mocha']),
('Nginx',            'tool', ARRAY['nginx']),
('OpenCL',           'tool', ARRAY['opencl', 'open cl']),
('OpenMP',           'tool', ARRAY['openmp', 'open mp']),
('OWASP',            'tool', ARRAY['owasp']),
('Playwright',       'tool', ARRAY['playwright']),
('Postman',          'tool', ARRAY['postman']),
('Power BI',         'tool', ARRAY['power bi', 'powerbi', 'microsoft power bi']),
('pytest',           'tool', ARRAY['pytest', 'py.test']),
('RabbitMQ',         'tool', ARRAY['rabbitmq', 'rabbit mq']),
('Redash',           'tool', ARRAY['redash']),
('Selenium',         'tool', ARRAY['selenium', 'selenium webdriver']),
('SonarQube',        'tool', ARRAY['sonarqube', 'sonar qube']),
('Splunk',           'tool', ARRAY['splunk']),
('Tableau',          'tool', ARRAY['tableau']),
('Testing Library',  'tool', ARRAY['testing library', 'react testing library', '@testing-library']),
('Vite',             'tool', ARRAY['vite', 'vitejs']),
('Vitest',           'tool', ARRAY['vitest']),
('Webpack',          'tool', ARRAY['webpack']),

-- API styles & protocols
('gRPC',             'api_style', ARRAY['grpc']),
('GraphQL',          'api_style', ARRAY['graphql', 'graph ql']),
('MQTT',             'api_style', ARRAY['mqtt']),
('OpenAPI',          'api_style', ARRAY['openapi', 'open api', 'swagger', 'openapi spec']),
('REST',             'api_style', ARRAY['rest api', 'restful api', 'restful', 'rest apis', 'rest services']),
('WebSocket',        'api_style', ARRAY['websocket', 'websockets', 'web socket']),

-- Methodology
('A/B Testing',               'methodology', ARRAY['a/b testing', 'ab testing', 'a/b test', 'split testing']),
('Agile',                     'methodology', ARRAY['agile', 'agile methodology', 'agile development', 'agile software']),
('BDD',                       'methodology', ARRAY['bdd', 'behavior driven development', 'behaviour driven development']),
('CI/CD',                     'methodology', ARRAY['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery']),
('Data Vault',                'methodology', ARRAY['data vault', 'data vault 2.0', 'dv2']),
('DevOps',                    'methodology', ARRAY['devops', 'dev ops']),
('Domain-Driven Design',      'methodology', ARRAY['domain driven design', 'domain-driven design', 'ddd']),
('Event-Driven Architecture', 'methodology', ARRAY['event driven architecture', 'event-driven architecture', 'event driven']),
('ITIL',                      'methodology', ARRAY['itil']),
('Kanban',                    'methodology', ARRAY['kanban']),
('Kimball/Inmon',             'methodology', ARRAY['kimball', 'kimball methodology', 'kimball dimensional modeling', 'inmon', 'inmon methodology', 'dimensional modeling']),
('Lean',                      'methodology', ARRAY['lean methodology', 'lean development', 'lean startup', 'lean software']),
('Microservices',             'methodology', ARRAY['microservices', 'microservice architecture', 'micro services']),
('MLOps',                     'methodology', ARRAY['mlops', 'ml ops', 'machine learning operations']),
('NIS2',                      'methodology', ARRAY['nis2', 'nis 2', 'nis2 directive', 'network and information security directive']),
('NIST',                      'methodology', ARRAY['nist', 'nist csf', 'nist cybersecurity framework', 'nist sp 800', 'nist framework']),
('OKR',                       'methodology', ARRAY['okr', 'objectives and key results']),
('SAFe',                      'methodology', ARRAY['safe agile', 'scaled agile', 'scaled agile framework', 'safe framework']),
('Scrum',                     'methodology', ARRAY['scrum', 'scrum master', 'scrum methodology']),
('TDD',                       'methodology', ARRAY['tdd', 'test driven development', 'test-driven development']),
('TOGAF',                     'methodology', ARRAY['togaf']),
('Zero Trust',                'methodology', ARRAY['zero trust', 'zero-trust', 'zero trust architecture', 'zta', 'zero trust network access', 'ztna']),

-- Certifications
('ACCA',                 'certification', ARRAY['acca', 'association of chartered certified accountants']),
('AIGP',                 'certification', ARRAY['aigp', 'ai governance professional', 'iapp aigp', 'artificial intelligence governance professional']),
('AWS Certified',        'certification', ARRAY['aws certified', 'aws certification', 'aws solutions architect', 'aws developer associate', 'aws sysops', 'aws cloud practitioner']),
('CCNA',                 'certification', ARRAY['ccna', 'cisco certified network associate']),
('CCNP',                 'certification', ARRAY['ccnp', 'cisco certified network professional']),
('CEH',                  'certification', ARRAY['ceh', 'certified ethical hacker']),
('CFA',                  'certification', ARRAY['cfa', 'chartered financial analyst']),
('CIA',                  'certification', ARRAY['cia', 'certified internal auditor']),
('CIPP',                 'certification', ARRAY['cipp', 'certified information privacy professional', 'cipp/e', 'cipp/us', 'cipp/a', 'cipp/c']),
('CIPM',                 'certification', ARRAY['cipm', 'certified information privacy manager']),
('CIPT',                 'certification', ARRAY['cipt', 'certified information privacy technologist']),
('CISA',                 'certification', ARRAY['cisa', 'certified information systems auditor']),
('CISM',                 'certification', ARRAY['cism', 'certified information security manager']),
('CISSP',                'certification', ARRAY['cissp', 'certified information systems security professional']),
('CIMA',                 'certification', ARRAY['cima', 'chartered institute of management accountants', 'chartered management accountant']),
('CKA',                  'certification', ARRAY['cka', 'certified kubernetes administrator']),
('CKAD',                 'certification', ARRAY['ckad', 'certified kubernetes application developer']),
('CMA',                  'certification', ARRAY['cma', 'certified management accountant']),
('CompTIA Network+',     'certification', ARRAY['comptia network+', 'network+', 'net+']),
('CompTIA Security+',    'certification', ARRAY['comptia security+', 'security+', 'sec+']),
('CPA',                  'certification', ARRAY['cpa', 'certified public accountant']),
('CSM',                  'certification', ARRAY['csm', 'certified scrum master']),
('CSPO',                 'certification', ARRAY['cspo', 'certified scrum product owner']),
('EQE',                  'certification', ARRAY['eqe', 'european qualifying examination', 'european patent attorney', 'european patent attorney qualification']),
('FRM',                  'certification', ARRAY['frm', 'financial risk manager']),
('Google Cloud Certified','certification', ARRAY['google cloud certified', 'gcp certified', 'google cloud professional']),
('ICA Certificate',      'certification', ARRAY['ica certificate', 'ica specialist certificate', 'international compliance association']),
('ISO 27001',            'certification', ARRAY['iso 27001', 'iso/iec 27001']),
('Lean Six Sigma',       'certification', ARRAY['lean six sigma', 'six sigma', 'green belt', 'black belt', 'six sigma green belt', 'six sigma black belt']),
('Microsoft Certified',  'certification', ARRAY['microsoft certified', 'azure certified', 'az-900', 'az-104', 'az-204', 'az-305']),
('OSCP',                 'certification', ARRAY['oscp', 'offensive security certified professional']),
('PMI-ACP',              'certification', ARRAY['pmi-acp', 'pmi acp', 'agile certified practitioner']),
('PMP',                  'certification', ARRAY['pmp', 'project management professional']),
('PRINCE2',              'certification', ARRAY['prince2', 'prince 2']),
('PSM',                  'certification', ARRAY['psm', 'professional scrum master']),
('Salesforce Certified', 'certification', ARRAY['salesforce certified', 'salesforce administrator', 'salesforce developer', 'salesforce architect']),
('SHRM-CP',              'certification', ARRAY['shrm-cp', 'shrm cp', 'shrm', 'phr', 'professional in human resources']),

-- Platforms
('3DEXPERIENCE',           'platform', ARRAY['3dexperience', '3dx', 'dassault 3dexperience', 'dassault systemes']),
('Adobe Creative Suite',   'platform', ARRAY['adobe creative suite', 'adobe cc', 'adobe creative cloud', 'photoshop', 'illustrator', 'indesign', 'premiere pro', 'after effects', 'lightroom']),
('Adobe Experience Cloud', 'platform', ARRAY['adobe experience cloud', 'adobe experience manager', 'aem', 'adobe analytics']),
('Agile Data Engine',      'platform', ARRAY['agile data engine', 'ade']),
('HubSpot',                'platform', ARRAY['hubspot', 'hub spot']),
('Hyperion Planning',      'platform', ARRAY['hyperion planning', 'oracle hyperion', 'hyperion', 'hyperion financial management', 'hfm']),
('Marketo',                'platform', ARRAY['marketo', 'adobe marketo']),
('Microsoft Dynamics',     'platform', ARRAY['microsoft dynamics', 'dynamics 365', 'dynamics ax', 'dynamics nav', 'dynamics crm']),
('NetSuite',               'platform', ARRAY['netsuite', 'oracle netsuite']),
('Oracle ERP',             'platform', ARRAY['oracle erp', 'oracle financials', 'oracle e-business suite', 'oracle ebs', 'oracle cloud erp']),
('SAP',                    'platform', ARRAY['sap']),
('SAP BW',                 'platform', ARRAY['sap bw', 'sap business warehouse', 'sap bw/4hana']),
('SAP Business Objects',   'platform', ARRAY['sap business objects', 'sap bo', 'sap businessobjects', 'business objects']),
('SAP FI/CO',              'platform', ARRAY['sap fi/co', 'sap fi-co', 'sap fico', 'sap fi', 'sap co']),
('SAP HCM',                'platform', ARRAY['sap hcm', 'sap hr', 'sap human capital management']),
('SAP MM',                 'platform', ARRAY['sap mm', 'sap materials management']),
('SAP S/4HANA',            'platform', ARRAY['sap s/4hana', 's/4hana', 's4hana', 'sap s4hana']),
('SAP SD',                 'platform', ARRAY['sap sd', 'sap sales and distribution']),
('Salesforce CRM',         'platform', ARRAY['salesforce crm', 'salesforce', 'salesforce.com', 'sfdc']),
('ServiceNow',             'platform', ARRAY['servicenow', 'service now']),
('VMware',                  'platform', ARRAY['vmware', 'vmware vsphere', 'vsphere', 'vmware esxi', 'esxi', 'vcenter', 'vmware workstation']),
('Workday',                'platform', ARRAY['workday']),
('Zendesk',                'platform', ARRAY['zendesk']);

UPDATE skills SET is_legacy = true
WHERE canonical_name IN (
  'COBOL',
  'Fortran',
  'Assembly',
  'Perl',
  'VBA',
  'Objective-C',
  'Apache Struts',
  'JSP',
  'jQuery'
);

-- ============================================================
-- PUBLISH & BUILD STATE
-- ============================================================

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

-- Application-level change log powering the admin Publish button's unpublished
-- count + breakdown. One semantic row per admin mutation (see the endpoints).
CREATE TABLE admin_changes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT        NOT NULL CHECK (entity_type IN ('company','position','skill')),
  action      TEXT        NOT NULL CHECK (action IN ('created','updated','deleted')),
  label       TEXT        NOT NULL,
  -- Stable entity identity (position/skill UUID, or company name) so repeated
  -- edits of one entity collapse to a single net change in the summary below.
  entity_id    TEXT,
  -- Content fingerprints so an edit that returns to the published value nets to
  -- zero. NULL before = entity did not exist; NULL after = entity was deleted.
  before_state TEXT,
  after_state  TEXT,
  changed_by   TEXT        NOT NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX admin_changes_changed_at_idx ON admin_changes (changed_at DESC);

ALTER TABLE admin_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read admin changes"   ON admin_changes FOR SELECT USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth insert admin changes" ON admin_changes FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Net-state summary of unpublished changes: per distinct entity, compare the
-- baseline (before_state of the earliest change = the published value) against
-- the current state (after_state of the latest change). Equal nets to nothing,
-- so an edit reverted to the published value, or an identical re-scrape, does
-- not count. Grouping in SQL also avoids PostgREST's silent 1000-row cap.
CREATE FUNCTION admin_change_summary(since timestamptz)
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
        WHEN baseline IS NOT DISTINCT FROM current_state THEN NULL
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
