-- ============================================================
-- 010: Skills taxonomy, skill extraction on positions,
--      and skill_snapshots for trend analysis
-- ============================================================

-- ── Skills taxonomy ──────────────────────────────────────────

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

-- ── skills[] on positions ────────────────────────────────────

ALTER TABLE positions
  ADD COLUMN skills TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX positions_skills_gin ON positions USING GIN (skills);

-- ── Skill snapshots (append-only trend data) ─────────────────

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

CREATE INDEX skill_snapshots_skill_date ON skill_snapshots(skill_id, captured_at DESC);
CREATE INDEX skill_snapshots_company    ON skill_snapshots(company_id, captured_at DESC);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE skills          ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read skills"          ON skills          FOR SELECT USING (true);
CREATE POLICY "Auth insert skills"          ON skills          FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update skills"          ON skills          FOR UPDATE USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth delete skills"          ON skills          FOR DELETE USING     (auth.role() = 'authenticated');

CREATE POLICY "Auth read snapshots"         ON skill_snapshots FOR SELECT USING     (auth.role() = 'authenticated');
CREATE POLICY "Auth insert skill snapshots" ON skill_snapshots FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── Seed: initial skills taxonomy ────────────────────────────

INSERT INTO skills (canonical_name, category, aliases) VALUES

-- Languages
('Python',        'language', ARRAY['python', 'python3', 'python 3']),
('JavaScript',    'language', ARRAY['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020']),
('TypeScript',    'language', ARRAY['typescript', 'ts']),
('Java',          'language', ARRAY['java']),
('C++',           'language', ARRAY['c++', 'cpp', 'c plus plus']),
('C#',            'language', ARRAY['c#', 'csharp', 'c sharp']),
('Go',            'language', ARRAY['golang', 'go language', 'go lang']),
('Rust',          'language', ARRAY['rust', 'rustlang', 'rust lang']),
('PHP',           'language', ARRAY['php']),
('Ruby',          'language', ARRAY['ruby']),
('Swift',         'language', ARRAY['swift']),
('Kotlin',        'language', ARRAY['kotlin']),
('R',             'language', ARRAY['r programming', 'r language', 'rstudio', 'r studio']),
('Scala',         'language', ARRAY['scala']),
('SQL',           'language', ARRAY['sql', 'pl/sql', 'plsql', 't-sql', 'tsql']),
('Bash',          'language', ARRAY['bash', 'shell scripting', 'shell script']),
('PowerShell',    'language', ARRAY['powershell', 'power shell', 'pwsh']),
('Perl',          'language', ARRAY['perl']),
('Haskell',       'language', ARRAY['haskell']),
('Elixir',        'language', ARRAY['elixir']),
('Dart',          'language', ARRAY['dart']),
('Groovy',        'language', ARRAY['groovy']),
('Lua',           'language', ARRAY['lua']),
('Julia',         'language', ARRAY['julia']),
('COBOL',         'language', ARRAY['cobol']),
('Objective-C',   'language', ARRAY['objective-c', 'objc', 'objective c']),
('F#',            'language', ARRAY['f#', 'fsharp', 'f sharp']),
('HTML',          'language', ARRAY['html', 'html5']),
('CSS',           'language', ARRAY['css', 'css3']),
('Assembly',      'language', ARRAY['assembly', 'asm', 'assembly language']),

-- Frameworks & libraries
('React',          'framework', ARRAY['react', 'reactjs', 'react.js']),
('React Native',   'framework', ARRAY['react native']),
('Angular',        'framework', ARRAY['angular', 'angularjs', 'angular.js']),
('Vue.js',         'framework', ARRAY['vue', 'vue.js', 'vuejs', 'vue js']),
('Node.js',        'framework', ARRAY['node', 'nodejs', 'node.js', 'node js']),
('Next.js',        'framework', ARRAY['next.js', 'nextjs', 'next js']),
('Svelte',         'framework', ARRAY['svelte', 'sveltejs']),
('SvelteKit',      'framework', ARRAY['sveltekit', 'svelte kit']),
('Nuxt.js',        'framework', ARRAY['nuxt', 'nuxt.js', 'nuxtjs', 'nuxt js']),
('Remix',          'framework', ARRAY['remix', 'remix.run']),
('Gatsby',         'framework', ARRAY['gatsby', 'gatsbyjs', 'gatsby.js']),
('NestJS',         'framework', ARRAY['nestjs', 'nest.js', 'nest js']),
('Express.js',     'framework', ARRAY['express', 'expressjs', 'express.js']),
('Django',         'framework', ARRAY['django']),
('Flask',          'framework', ARRAY['flask']),
('FastAPI',        'framework', ARRAY['fastapi', 'fast api']),
('Spring Boot',    'framework', ARRAY['spring boot', 'springboot', 'spring framework']),
('.NET',           'framework', ARRAY['.net', 'dotnet', 'dot net']),
('ASP.NET',        'framework', ARRAY['asp.net', 'aspnet', 'asp.net core', 'aspnetcore']),
('Laravel',        'framework', ARRAY['laravel']),
('Rails',          'framework', ARRAY['rails', 'ruby on rails', 'ror']),
('Symfony',        'framework', ARRAY['symfony']),
('Quarkus',         'framework', ARRAY['quarkus']),
('Tailwind CSS',    'framework', ARRAY['tailwind', 'tailwindcss', 'tailwind css']),
('Bootstrap',       'framework', ARRAY['bootstrap']),
('Material UI',     'framework', ARRAY['material ui', 'material-ui', 'mui']),
('Chakra UI',       'framework', ARRAY['chakra ui', 'chakra']),
('Styled Components','framework', ARRAY['styled components', 'styled-components']),
('Redux',           'framework', ARRAY['redux', 'redux toolkit', 'rtk']),
('Zustand',         'framework', ARRAY['zustand']),
('Micronaut',      'framework', ARRAY['micronaut']),
('Ktor',           'framework', ARRAY['ktor']),
('PyTorch',        'framework', ARRAY['pytorch', 'torch']),
('TensorFlow',     'framework', ARRAY['tensorflow', 'tensor flow']),
('Keras',          'framework', ARRAY['keras']),
('scikit-learn',   'framework', ARRAY['scikit-learn', 'sklearn', 'scikit learn']),
('pandas',         'framework', ARRAY['pandas']),
('NumPy',          'framework', ARRAY['numpy']),
('LangChain',      'framework', ARRAY['langchain', 'lang chain']),
('Hugging Face',   'framework', ARRAY['hugging face', 'huggingface', 'hf transformers']),
('OpenCV',         'framework', ARRAY['opencv', 'open cv']),
('Apache Spark',   'framework', ARRAY['apache spark', 'spark', 'pyspark']),
('Apache Flink',   'framework', ARRAY['apache flink', 'flink']),
('Apache Beam',    'framework', ARRAY['apache beam', 'google dataflow']),
('Hadoop',         'framework', ARRAY['hadoop', 'apache hadoop', 'hdfs', 'mapreduce']),

-- Databases
('PostgreSQL',     'database', ARRAY['postgresql', 'postgres', 'psql']),
('MySQL',          'database', ARRAY['mysql']),
('MongoDB',        'database', ARRAY['mongodb', 'mongo']),
('Redis',          'database', ARRAY['redis']),
('Elasticsearch',  'database', ARRAY['elasticsearch', 'elastic search', 'opensearch']),
('SQLite',         'database', ARRAY['sqlite', 'sqlite3']),
('Oracle',         'database', ARRAY['oracle', 'oracle db', 'oracle database']),
('SQL Server',     'database', ARRAY['sql server', 'mssql', 'microsoft sql server']),
('DynamoDB',       'database', ARRAY['dynamodb', 'dynamo db', 'aws dynamodb']),
('Cassandra',      'database', ARRAY['cassandra', 'apache cassandra']),
('ClickHouse',     'database', ARRAY['clickhouse', 'click house']),
('Snowflake',      'database', ARRAY['snowflake']),
('BigQuery',       'database', ARRAY['bigquery', 'big query', 'google bigquery']),
('Redshift',       'database', ARRAY['redshift', 'aws redshift', 'amazon redshift']),
('Neo4j',          'database', ARRAY['neo4j', 'neo 4j']),
('MariaDB',        'database', ARRAY['mariadb', 'maria db']),
('InfluxDB',       'database', ARRAY['influxdb', 'influx db']),
('Firestore',      'database', ARRAY['firestore', 'cloud firestore']),
('CockroachDB',    'database', ARRAY['cockroachdb', 'cockroach db']),
('Supabase',       'database', ARRAY['supabase']),

-- Cloud & infrastructure
('AWS',              'cloud', ARRAY['aws', 'amazon web services']),
('Azure',            'cloud', ARRAY['azure', 'microsoft azure']),
('Google Cloud',     'cloud', ARRAY['google cloud', 'gcp', 'google cloud platform']),
('Kubernetes',       'cloud', ARRAY['kubernetes', 'k8s']),
('Docker',           'cloud', ARRAY['docker', 'docker compose', 'docker swarm']),
('Terraform',        'cloud', ARRAY['terraform', 'hashicorp terraform', 'opentofu']),
('Helm',             'cloud', ARRAY['helm', 'helm chart', 'helm charts']),
('Ansible',          'cloud', ARRAY['ansible']),
('Pulumi',           'cloud', ARRAY['pulumi']),
('OpenShift',        'cloud', ARRAY['openshift', 'red hat openshift']),
('ArgoCD',           'cloud', ARRAY['argocd', 'argo cd']),
('Prometheus',       'cloud', ARRAY['prometheus']),
('Grafana',          'cloud', ARRAY['grafana']),
('Datadog',          'cloud', ARRAY['datadog', 'data dog']),
('New Relic',        'cloud', ARRAY['new relic', 'newrelic']),
('Cloudflare',       'cloud', ARRAY['cloudflare']),
('Netlify',          'cloud', ARRAY['netlify']),
('Vercel',           'cloud', ARRAY['vercel']),

-- Tools
('Git',              'tool', ARRAY['git']),
('GitHub',           'tool', ARRAY['github']),
('GitLab',           'tool', ARRAY['gitlab']),
('Bitbucket',        'tool', ARRAY['bitbucket']),
('Jira',             'tool', ARRAY['jira', 'atlassian jira']),
('Confluence',       'tool', ARRAY['confluence', 'atlassian confluence']),
('Linux',            'tool', ARRAY['linux', 'unix', 'ubuntu', 'centos', 'rhel', 'debian']),
('Nginx',            'tool', ARRAY['nginx']),
('Kafka',            'tool', ARRAY['kafka', 'apache kafka']),
('RabbitMQ',         'tool', ARRAY['rabbitmq', 'rabbit mq']),
-- API styles / protocols (separate from tools — keeps analytics clean)
('REST',             'api_style', ARRAY['rest api', 'restful api', 'restful', 'rest apis', 'rest services']),
('GraphQL',          'api_style', ARRAY['graphql', 'graph ql']),
('gRPC',             'api_style', ARRAY['grpc']),
('OpenAPI',          'api_style', ARRAY['openapi', 'open api', 'swagger', 'openapi spec']),
('WebSocket',        'api_style', ARRAY['websocket', 'websockets', 'web socket']),
('MQTT',             'api_style', ARRAY['mqtt']),
('Kibana',           'tool', ARRAY['kibana']),
('Apache Airflow',   'tool', ARRAY['airflow', 'apache airflow']),
('dbt',              'tool', ARRAY['dbt', 'data build tool']),
('Tableau',          'tool', ARRAY['tableau']),
('Power BI',         'tool', ARRAY['power bi', 'powerbi', 'microsoft power bi']),
('Looker',           'tool', ARRAY['looker', 'looker studio']),
('Figma',            'tool', ARRAY['figma']),
('Postman',          'tool', ARRAY['postman']),
('Selenium',         'tool', ARRAY['selenium', 'selenium webdriver']),
('Playwright',       'tool', ARRAY['playwright']),
('Cypress',          'tool', ARRAY['cypress']),
('Jest',             'tool', ARRAY['jest']),
('Vitest',           'tool', ARRAY['vitest']),
('Mocha',            'tool', ARRAY['mocha']),
('Testing Library',  'tool', ARRAY['testing library', 'react testing library', '@testing-library']),
('pytest',           'tool', ARRAY['pytest', 'py.test']),
('JUnit',            'tool', ARRAY['junit', 'junit5', 'junit 5']),
('SonarQube',        'tool', ARRAY['sonarqube', 'sonar qube']),
('Webpack',          'tool', ARRAY['webpack']),
('Vite',             'tool', ARRAY['vite', 'vitejs']),
('Gradle',           'tool', ARRAY['gradle']),
('Maven',            'tool', ARRAY['maven', 'apache maven']),
('GitHub Actions',   'tool', ARRAY['github actions']),
('CircleCI',         'tool', ARRAY['circleci', 'circle ci']),
('GitLab CI',        'tool', ARRAY['gitlab ci', 'gitlab ci/cd']),
('Jenkins',          'tool', ARRAY['jenkins']),
('OWASP',            'tool', ARRAY['owasp']),

-- Methodology
('Scrum',                    'methodology', ARRAY['scrum', 'scrum master', 'scrum methodology']),
('Agile',                    'methodology', ARRAY['agile', 'agile methodology', 'agile development', 'agile software']),
('Kanban',                   'methodology', ARRAY['kanban']),
('SAFe',                     'methodology', ARRAY['safe agile', 'scaled agile', 'scaled agile framework', 'safe framework']),
('DevOps',                   'methodology', ARRAY['devops', 'dev ops']),
('CI/CD',                    'methodology', ARRAY['ci/cd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery']),
('TDD',                      'methodology', ARRAY['tdd', 'test driven development', 'test-driven development']),
('BDD',                      'methodology', ARRAY['bdd', 'behavior driven development', 'behaviour driven development']),
('ITIL',                     'methodology', ARRAY['itil']),
('TOGAF',                    'methodology', ARRAY['togaf']),
('Microservices',            'methodology', ARRAY['microservices', 'microservice architecture', 'micro services']),
('Domain-Driven Design',     'methodology', ARRAY['domain driven design', 'domain-driven design', 'ddd']),
('Event-Driven Architecture','methodology', ARRAY['event driven architecture', 'event-driven architecture', 'event driven']),
('Lean',                     'methodology', ARRAY['lean methodology', 'lean development', 'lean startup', 'lean software']),
('OKR',                      'methodology', ARRAY['okr', 'objectives and key results']),

-- Certifications
('AWS Certified',            'certification', ARRAY['aws certified', 'aws certification', 'aws solutions architect', 'aws developer associate', 'aws sysops', 'aws cloud practitioner']),
('Microsoft Certified',      'certification', ARRAY['microsoft certified', 'azure certified', 'az-900', 'az-104', 'az-204', 'az-305']),
('Google Cloud Certified',   'certification', ARRAY['google cloud certified', 'gcp certified', 'google cloud professional']),
('CKA',                      'certification', ARRAY['cka', 'certified kubernetes administrator']),
('CKAD',                     'certification', ARRAY['ckad', 'certified kubernetes application developer']),
('CISSP',                    'certification', ARRAY['cissp', 'certified information systems security professional']),
('CISM',                     'certification', ARRAY['cism', 'certified information security manager']),
('CompTIA Security+',        'certification', ARRAY['comptia security+', 'security+', 'sec+']),
('CompTIA Network+',         'certification', ARRAY['comptia network+', 'network+', 'net+']),
('CEH',                      'certification', ARRAY['ceh', 'certified ethical hacker']),
('OSCP',                     'certification', ARRAY['oscp', 'offensive security certified professional']),
('PMP',                      'certification', ARRAY['pmp', 'project management professional']),
('PRINCE2',                  'certification', ARRAY['prince2', 'prince 2']),
('PMI-ACP',                  'certification', ARRAY['pmi-acp', 'pmi acp', 'agile certified practitioner']),
('CSM',                      'certification', ARRAY['csm', 'certified scrum master']),
('CSPO',                     'certification', ARRAY['cspo', 'certified scrum product owner']),
('PSM',                      'certification', ARRAY['psm', 'professional scrum master']),
('CCNA',                     'certification', ARRAY['ccna', 'cisco certified network associate']),
('CCNP',                     'certification', ARRAY['ccnp', 'cisco certified network professional']),
('CFA',                      'certification', ARRAY['cfa', 'chartered financial analyst']),
('ACCA',                     'certification', ARRAY['acca', 'association of chartered certified accountants']),
('ISO 27001',                'certification', ARRAY['iso 27001', 'iso/iec 27001']),
('Salesforce Certified',     'certification', ARRAY['salesforce certified', 'salesforce administrator', 'salesforce developer', 'salesforce architect']),
('CPA',                      'certification', ARRAY['cpa', 'certified public accountant']),
('CIA',                      'certification', ARRAY['cia', 'certified internal auditor']),
('CISA',                     'certification', ARRAY['cisa', 'certified information systems auditor']),
('CIMA',                     'certification', ARRAY['cima', 'chartered institute of management accountants', 'chartered management accountant']),
('CMA',                      'certification', ARRAY['cma', 'certified management accountant']),
('FRM',                      'certification', ARRAY['frm', 'financial risk manager']),
('SHRM-CP',                  'certification', ARRAY['shrm-cp', 'shrm cp', 'shrm', 'phr', 'professional in human resources']),
('Lean Six Sigma',           'certification', ARRAY['lean six sigma', 'six sigma', 'green belt', 'black belt', 'six sigma green belt', 'six sigma black belt']),

-- Platforms
('SAP',                      'platform', ARRAY['sap']),
('SAP S/4HANA',              'platform', ARRAY['sap s/4hana', 's/4hana', 's4hana', 'sap s4hana']),
('SAP FI/CO',                'platform', ARRAY['sap fi/co', 'sap fico', 'sap fi', 'sap co']),
('SAP MM',                   'platform', ARRAY['sap mm', 'sap materials management']),
('SAP HCM',                  'platform', ARRAY['sap hcm', 'sap hr', 'sap human capital management']),
('SAP BW',                   'platform', ARRAY['sap bw', 'sap business warehouse', 'sap bw/4hana']),
('Workday',                  'platform', ARRAY['workday']),
('Oracle ERP',               'platform', ARRAY['oracle erp', 'oracle financials', 'oracle e-business suite', 'oracle ebs', 'oracle cloud erp']),
('NetSuite',                 'platform', ARRAY['netsuite', 'oracle netsuite']),
('Microsoft Dynamics',       'platform', ARRAY['microsoft dynamics', 'dynamics 365', 'dynamics ax', 'dynamics nav', 'dynamics crm']),
('Salesforce CRM',           'platform', ARRAY['salesforce crm', 'salesforce', 'salesforce.com', 'sfdc']),
('HubSpot',                  'platform', ARRAY['hubspot', 'hub spot']),
('ServiceNow',               'platform', ARRAY['servicenow', 'service now']),
('Zendesk',                  'platform', ARRAY['zendesk']),
('Marketo',                  'platform', ARRAY['marketo', 'adobe marketo']),
('Adobe Experience Cloud',   'platform', ARRAY['adobe experience cloud', 'adobe experience manager', 'aem', 'adobe analytics']);

-- ── Mark legacy skills ────────────────────────────────────────

UPDATE skills SET is_legacy = true
WHERE canonical_name IN (
  'COBOL',
  'Fortran',
  'Assembly',
  'Perl',
  'VBA',
  'Objective-C'
);
