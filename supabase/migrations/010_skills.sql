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
('Jupyter',          'tool', ARRAY['jupyter', 'jupyter notebook', 'jupyter lab', 'jupyterlab']),
('Jest',             'tool', ARRAY['jest']),
('Jira',             'tool', ARRAY['jira', 'atlassian jira']),
('JUnit',            'tool', ARRAY['junit', 'junit5', 'junit 5']),
('Kafka',            'tool', ARRAY['kafka', 'apache kafka']),
('Kibana',           'tool', ARRAY['kibana']),
('Linux',            'tool', ARRAY['linux', 'unix', 'ubuntu', 'centos', 'rhel', 'debian']),
('Looker',           'tool', ARRAY['looker', 'looker studio']),
('Maven',            'tool', ARRAY['maven', 'apache maven']),
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
('DevOps',                    'methodology', ARRAY['devops', 'dev ops']),
('Domain-Driven Design',      'methodology', ARRAY['domain driven design', 'domain-driven design', 'ddd']),
('Event-Driven Architecture', 'methodology', ARRAY['event driven architecture', 'event-driven architecture', 'event driven']),
('ITIL',                      'methodology', ARRAY['itil']),
('Kanban',                    'methodology', ARRAY['kanban']),
('Lean',                      'methodology', ARRAY['lean methodology', 'lean development', 'lean startup', 'lean software']),
('Microservices',             'methodology', ARRAY['microservices', 'microservice architecture', 'micro services']),
('OKR',                       'methodology', ARRAY['okr', 'objectives and key results']),
('SAFe',                      'methodology', ARRAY['safe agile', 'scaled agile', 'scaled agile framework', 'safe framework']),
('Scrum',                     'methodology', ARRAY['scrum', 'scrum master', 'scrum methodology']),
('TDD',                       'methodology', ARRAY['tdd', 'test driven development', 'test-driven development']),
('TOGAF',                     'methodology', ARRAY['togaf']),

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
('Adobe Experience Cloud', 'platform', ARRAY['adobe experience cloud', 'adobe experience manager', 'aem', 'adobe analytics']),
('HubSpot',                'platform', ARRAY['hubspot', 'hub spot']),
('Marketo',                'platform', ARRAY['marketo', 'adobe marketo']),
('Microsoft Dynamics',     'platform', ARRAY['microsoft dynamics', 'dynamics 365', 'dynamics ax', 'dynamics nav', 'dynamics crm']),
('NetSuite',               'platform', ARRAY['netsuite', 'oracle netsuite']),
('Oracle ERP',             'platform', ARRAY['oracle erp', 'oracle financials', 'oracle e-business suite', 'oracle ebs', 'oracle cloud erp']),
('SAP',                    'platform', ARRAY['sap']),
('SAP BW',                 'platform', ARRAY['sap bw', 'sap business warehouse', 'sap bw/4hana']),
('SAP FI/CO',              'platform', ARRAY['sap fi/co', 'sap fico', 'sap fi', 'sap co']),
('SAP HCM',                'platform', ARRAY['sap hcm', 'sap hr', 'sap human capital management']),
('SAP MM',                 'platform', ARRAY['sap mm', 'sap materials management']),
('SAP S/4HANA',            'platform', ARRAY['sap s/4hana', 's/4hana', 's4hana', 'sap s4hana']),
('Salesforce CRM',         'platform', ARRAY['salesforce crm', 'salesforce', 'salesforce.com', 'sfdc']),
('ServiceNow',             'platform', ARRAY['servicenow', 'service now']),
('Workday',                'platform', ARRAY['workday']),
('Zendesk',                'platform', ARRAY['zendesk']);

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
