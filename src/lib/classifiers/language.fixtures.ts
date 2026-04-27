/**
 * Test fixtures for the language classifier (detectNativeLanguage).
 *
 * One entry per signal pattern. When you add a new pattern to the classifier
 * (a phrase, a negation rule, a Nordic group phrase, etc.) add a matching
 * entry here so regressions are caught automatically.
 *
 * Phases mirror the detectNativeLanguage() implementation:
 *   1a        — non-ASCII or keyword in title
 *   1b        — explicit advantage phrase (before tinyld)
 *   1b-chars  — native character count in description
 *   1c        — tinyld detects country language (not tested here — ML-model-dependent)
 *   2a        — explicit requirement phrase in English description
 *   2a-nordic — group Nordic/Scandinavian requirement phrase
 *   2a-cross  — cross-language requirement / advantage
 *   2b        — "depending on location" conditional requirement
 *   2d        — no signal → English assumed
 */

export type FixtureCase = {
  label: string;
  title: string;
  desc?: string;
  country: string;
  requires: boolean;
  advantage: boolean;
};

// Long native-language descriptions used for Phase 1b-chars tests.
// Each must exceed the COUNTRY_NATIVE_CHARS threshold for its language.
// Finnish / Swedish: 15+ ä/ö chars; German: 10+ ä/ö/ü/ß; Norwegian: 15+ æ/ø/å.
const FINNISH_NATIVE_DESC =
  'Etsimme ohjelmistokehittäjää tiimimme vahvistukseksi. Työnkuvan keskeisiä tehtäviä ovat ' +
  'järjestelmäkehitys, tietokantojen ylläpitäminen ja uusien ratkaisujen kehittäminen. ' +
  'Odotamme hakijalta hyvää kykyä kommunikoida sekä taitoa käyttää moderneja ' +
  'kehitystyökaluja. Tärkeää on myös kyky priorisoida tehtäviä ja työskennellä joustavasti.';

const GERMAN_NATIVE_DESC =
  'Wir suchen einen erfahrenen Softwareentwickler für unser wachsendes Münchener Team. ' +
  'Sie übernehmen Verantwortung für Entwicklung und können Ihre Fähigkeiten täglich ' +
  'unter Beweis stellen. Außerdem bieten wir außergewöhnliche Möglichkeiten, Ihre ' +
  'persönlichen und fachlichen Stärken weiterzuentwickeln. Die Lösung komplexer ' +
  'Aufgaben gehört zu Ihren täglichen Tätigkeiten.';

const NORWEGIAN_NATIVE_DESC =
  'Vi søker en engasjert og dyktig programvareutvikler som ønsker å jobbe med spennende ' +
  'faglige utfordringer. Stillingen innebærer å ta ansvar for utvikling og vedlikehold ' +
  'av systemer og løsninger. Du bør ha god kunnskap om fagområdet og evne til å ' +
  'samarbeide på tvers av avdelinger. Hos oss får du muligheten til å vokse faglig, ' +
  'og vi tilbyr gode muligheter for utvikling i et dynamisk og fagsterkt miljø.';

export const CASES: FixtureCase[] = [

  // ── Phase 1a: Non-ASCII or keyword in title ──────────────────────────────

  {
    label: '1a — German title with ä/ü chars',
    title: 'Softwareentwickler (m/w/d) für München',
    country: 'DE',
    requires: true,
    advantage: false,
  },
  {
    label: '1a — Finnish title with ä char',
    title: 'Ohjelmistokehittäjä',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '1a — Norwegian title with å char',
    title: 'Rådgiver – teknologi',
    country: 'NO',
    requires: true,
    advantage: false,
  },
  {
    label: '1a — Swedish keyword "säljare" in title',
    title: 'Säljare B2B',
    country: 'SE',
    requires: true,
    advantage: false,
  },
  {
    label: '1a — Finnish keyword "myynti" in title',
    title: 'Myynti Specialist',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '1a — German keyword "entwickler" in title',
    title: 'Senior Entwickler Backend',
    country: 'DE',
    requires: true,
    advantage: false,
  },

  // ── Phase 1b: Advantage pre-filter (short English desc, no tinyld) ───────
  // These phrases fire before tinyld so they work on short descriptions too.

  {
    label: '1b — "Finnish is a plus"',
    title: 'Software Engineer',
    desc: 'You will work with our international team. Finnish is a plus.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is an advantage"',
    title: 'Software Engineer',
    desc: 'Excellent communication skills required. Finnish is an advantage.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is a strong advantage"',
    title: 'Account Manager',
    desc: 'Experience in B2B sales required. Finnish is a strong advantage.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    // "Finnish language skills" is itself a requirement signal, so hasRequirement=true
    // suppresses the advantage path — use bare language name to get the advantage branch.
    label: '1b — "Finnish is a bonus" (bare name → advantage regex)',
    title: 'Sales Specialist',
    desc: 'Strong English required. Finnish is a bonus.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is preferred"',
    title: 'Customer Success Manager',
    desc: 'Strong English is required. Finnish is preferred.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    // "proficiency in norwegian" is a requirement signal, so the cross-language scan
    // returns requires:true for this FI job. Use bare language name to reach advantage.
    label: '1b — "Norwegian is preferred" cross-language advantage on FI job',
    title: 'Project Manager',
    desc: 'Strong English is required. Norwegian is preferred.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is desirable"',
    title: 'Business Analyst',
    desc: 'Finnish is desirable but not required.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is nice to have"',
    title: 'UX Designer',
    desc: 'Portfolio required. Finnish is nice to have.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish would be beneficial"',
    title: 'Project Manager',
    desc: 'PMP certification preferred. Finnish would be beneficial.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "nice to have: Finnish"',
    title: 'Data Engineer',
    desc: 'Requirements: Python, SQL. Nice to have: Finnish.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "preferably Finnish"',
    title: 'Operations Coordinator',
    desc: 'We work in English. Preferably Finnish.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish preferred"',
    title: 'Customer Support Specialist',
    desc: 'English required. Finnish preferred.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    // "knowledge of Finnish" is a requirement signal — use "Finnish language" (without "skills")
    // which is not a requirement signal so the advantage regex can fire.
    label: '1b — "Finnish language is an advantage" (compound mention → advantage regex)',
    title: 'Marketing Manager',
    desc: 'Experience in digital marketing. Finnish language is an advantage.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    // "Finnish language skills" is a requirement signal — drop "skills" so only the
    // compound mention "Finnish language" is present, which the advantage regex catches.
    label: '1b — "Finnish language would be a plus" (compound mention → advantage regex)',
    title: 'Sales Engineer',
    desc: 'Technical background required. Finnish language would be a plus.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Finnish is considered an additional qualification"',
    title: 'HR Business Partner',
    desc: 'HR experience required. Finnish is considered an additional qualification.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    // "Swedish skills" is a requirement signal — use bare language name instead.
    label: '1b — "Swedish is a plus" bare name (Swedish country)',
    title: 'Software Developer',
    desc: 'Join our team. Swedish is a plus.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "German is an advantage"',
    title: 'Backend Developer',
    desc: 'Strong Python skills. German is an advantage.',
    country: 'DE',
    requires: false,
    advantage: true,
  },
  {
    // "Dutch language skills" is a requirement signal — use "Dutch language" without "skills".
    label: '1b — "Dutch language is a plus" (Netherlands)',
    title: 'Product Manager',
    desc: 'Road-mapping experience needed. Dutch language is a plus.',
    country: 'NL',
    requires: false,
    advantage: true,
  },

  // ── Phase 1b: Nordic/Scandinavian group advantage phrases ─────────────────

  {
    label: '1b — "a Nordic language is an advantage"',
    title: 'Key Account Manager',
    desc: 'Working language is English. A Nordic language is an advantage.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "a Scandinavian language is a plus"',
    title: 'Sales Director',
    desc: 'Travel required. A Scandinavian language is a plus.',
    country: 'NO',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "knowledge of a Nordic language"',
    title: 'Finance Analyst',
    desc: 'CPA preferred. Knowledge of a Nordic language.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "Nordic language skills is a plus"',
    title: 'Regional Manager',
    desc: 'Management experience required. Nordic language skills is a plus.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "a Nordic language would be a plus"',
    title: 'Business Development Manager',
    desc: 'B2B sales background. A Nordic language would be a plus.',
    country: 'DK',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "a Nordic language is a strong advantage"',
    title: 'Customer Success Lead',
    desc: 'Strong client management skills. A Nordic language is a strong advantage.',
    country: 'NO',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — "nordic languages are a plus but not a requirement"',
    title: 'Solutions Architect',
    desc: 'Cloud expertise required. Nordic languages are a plus but not a requirement.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — regex: "Swedish or other Nordic languages are a plus"',
    title: 'Regional Sales Manager',
    desc: 'English fluency required. Swedish or other Nordic languages are a plus.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — regex: "Knowledge of Nordic or Baltic languages is an advantage"',
    title: 'Market Analyst',
    desc: 'Analytical skills required. Knowledge of Nordic or Baltic languages is an advantage.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — regex: "Finnish or other Nordic languages are a plus"',
    title: 'Account Executive',
    desc: 'Sales experience required. Finnish or other Nordic languages are a plus.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '1b — regex: "knowledge of Scandinavian languages is an asset"',
    title: 'Communications Manager',
    desc: 'Media background preferred. Knowledge of Scandinavian languages is an asset.',
    country: 'SE',
    requires: false,
    advantage: true,
  },

  // ── Phase 1b: Requirement wins when both signals are present ─────────────

  {
    label: '1b override — requirement wins over co-present advantage phrase',
    title: 'Customer Manager',
    desc: 'Fluent Finnish is required for this role. Finnish is a plus for career growth.',
    country: 'FI',
    requires: true,
    advantage: false,
  },

  // ── Phase 1b-chars: Native character frequency ────────────────────────────
  // Full native-language paragraphs that exceed the per-country threshold.

  {
    label: '1b-chars — Finnish description with 15+ ä/ö chars',
    title: 'Software Developer',
    desc: FINNISH_NATIVE_DESC,
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '1b-chars — German description with 10+ ä/ö/ü/ß chars',
    title: 'Software Engineer',
    desc: GERMAN_NATIVE_DESC,
    country: 'DE',
    requires: true,
    advantage: false,
  },
  {
    label: '1b-chars — Norwegian description with 15+ æ/ø/å chars',
    title: 'Developer',
    desc: NORWEGIAN_NATIVE_DESC,
    country: 'NO',
    requires: true,
    advantage: false,
  },

  // ── Phase 2a: Explicit requirement phrases ────────────────────────────────
  // Short English descriptions — tinyld and char-check won't fire.

  {
    label: '2a — "Finnish required"',
    title: 'Customer Support Specialist',
    desc: 'Finnish required. English also needed.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish is required"',
    title: 'Service Advisor',
    desc: 'Finnish is required for daily client communication.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "fluent in Finnish"',
    title: 'Sales Manager',
    desc: 'You must be fluent in Finnish and English.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "fluent Finnish"',
    title: 'Account Manager',
    desc: 'Fluent Finnish is essential for this client-facing role.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish is a must"',
    title: 'Support Engineer',
    desc: 'Finnish is a must; English is also required.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish is mandatory"',
    title: 'Field Technician',
    desc: 'Finnish is mandatory for client interactions.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish fluency"',
    title: 'Client Success Manager',
    desc: 'Requirements: Finnish fluency, English proficiency.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "fluency in Finnish"',
    title: 'Sales Consultant',
    desc: 'Fluency in Finnish required for this customer-facing role.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "proficient in Finnish"',
    title: 'Analyst',
    desc: 'You should be proficient in Finnish and English.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "native Finnish"',
    title: 'Content Writer',
    desc: 'Native Finnish required for copy editing.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish speaker"',
    title: 'Customer Advisor',
    desc: 'We are looking for a Finnish speaker to join our team.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "written and spoken Finnish"',
    title: 'HR Coordinator',
    desc: 'Excellent written and spoken Finnish required.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "working language is Finnish"',
    title: 'Team Lead',
    desc: 'The working language is Finnish within the team.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish and English"',
    title: 'Office Manager',
    desc: 'You must communicate in Finnish and English daily.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "English and Finnish"',
    title: 'Project Coordinator',
    desc: 'Strong skills in English and Finnish are required.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish, English" comma list',
    title: 'Support Specialist',
    desc: 'Language requirements: Finnish, English.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "knowledge of Finnish"',
    title: 'Business Consultant',
    desc: 'Knowledge of Finnish is required for the role.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish language skills"',
    title: 'Relationship Manager',
    desc: 'Finnish language skills are essential.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish skills"',
    title: 'Communication Specialist',
    desc: 'Finnish skills required for daily operations.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "basic Finnish"',
    title: 'Field Operative',
    desc: 'Basic Finnish needed to communicate with local colleagues.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Finnish/English" slash notation',
    title: 'Technical Support',
    desc: 'Finnish/English speaking environment.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Norwegian/Swedish/Danish speaking" slash expansion',
    title: 'Nordic Sales Manager',
    desc: 'Norwegian/Swedish/Danish speaking candidates preferred.',
    country: 'SE',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "German required"',
    title: 'Client Manager',
    desc: 'German required for all internal and client communications.',
    country: 'DE',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "Dutch language skills" (Netherlands)',
    title: 'Operations Manager',
    desc: 'Dutch language skills are required for this position.',
    country: 'NL',
    requires: true,
    advantage: false,
  },
  {
    label: '2a — "communicate confidently in Finnish"',
    title: 'Sales Representative',
    desc: 'You must be able to communicate confidently in Finnish.',
    country: 'FI',
    requires: true,
    advantage: false,
  },

  // ── Phase 2a: "knowledge of X" adjective guard ────────────────────────────

  {
    label: '2a adjective — "knowledge of Dutch law" not a language signal',
    title: 'Legal Counsel',
    desc: 'Knowledge of Dutch law and corporate regulations is required.',
    country: 'NL',
    requires: false,
    advantage: false,
  },
  {
    label: '2a adjective — "knowledge of German market" not a language signal',
    title: 'Sales Director',
    desc: 'Knowledge of German market dynamics is essential.',
    country: 'DE',
    requires: false,
    advantage: false,
  },
  {
    label: '2a adjective — "knowledge of Dutch" alone IS a language signal',
    title: 'Support Engineer',
    desc: 'Knowledge of Dutch required for client calls.',
    country: 'NL',
    requires: true,
    advantage: false,
  },

  // ── Phase 2a: Negation — "or English" downgrades to no signal ─────────────

  {
    label: '2a negation-none — "fluent in Finnish or English" → no signal',
    title: 'Engineer',
    desc: 'You should be fluent in Finnish or English.',
    country: 'FI',
    requires: false,
    advantage: false,
  },
  {
    label: '2a negation-none — "Finnish fluency or English" → no signal',
    title: 'Analyst',
    desc: 'Finnish fluency or English accepted.',
    country: 'FI',
    requires: false,
    advantage: false,
  },

  // ── Phase 2a: Negation — "not required / nice-to-have" downgrades to advantage

  {
    label: '2a negation-advantage — "Finnish not required" → advantage',
    title: 'Business Developer',
    desc: 'Finnish skills not required but appreciated.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '2a negation-advantage — "fluent Finnish, nice-to-have" → advantage',
    title: 'Support Lead',
    desc: 'Fluent Finnish, nice-to-have but not compulsory.',
    country: 'FI',
    requires: false,
    advantage: true,
  },

  // ── Phase 2a: Advantage prefix — "bonus points if / plus if" ─────────────

  {
    label: '2a advantage-prefix — "bonus points if you speak Finnish"',
    title: 'Customer Success',
    desc: 'Bonus points if you speak Finnish.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: "2a advantage-prefix — \"it's a plus if you speak Finnish\"",
    title: 'Sales Executive',
    desc: "It's a plus if you speak Finnish.",
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '2a advantage-prefix — "nice to have if you speak Finnish"',
    title: 'Solutions Consultant',
    desc: 'Nice to have if you speak Finnish.',
    country: 'FI',
    requires: false,
    advantage: true,
  },
  {
    label: '2a advantage-prefix — "would be great if you speak Finnish"',
    title: 'Partner Manager',
    desc: 'Would be great if you speak Finnish.',
    country: 'FI',
    requires: false,
    advantage: true,
  },

  // ── Phase 2a-nordic: Group Nordic requirement phrases ─────────────────────

  {
    label: '2a-nordic — "fluent in English and at least one Nordic language"',
    title: 'Regional Manager',
    desc: 'You must be fluent in English and at least one Nordic language.',
    country: 'SE',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-nordic — "proficiency in English and one of the Nordic languages"',
    title: 'Account Director',
    desc: 'We require proficiency in English and one of the Nordic languages.',
    country: 'NO',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-nordic — "in English and in one Nordic language"',
    title: 'Communications Lead',
    desc: 'You will communicate in English and in one Nordic language.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-nordic — "fluency in English and a Scandinavian language"',
    title: 'Head of Sales',
    desc: 'We expect fluency in English and a Scandinavian language.',
    country: 'DK',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-nordic — "English and at least one Scandinavian language"',
    title: 'Territory Manager',
    desc: 'English and at least one Scandinavian language is required.',
    country: 'NO',
    requires: true,
    advantage: false,
  },

  // ── Phase 2a-cross: Cross-language (non-country language in description) ──

  {
    label: '2a-cross — "fluent Norwegian required" on Latvia job',
    title: 'Nordic Sales Manager',
    desc: 'Fluent Norwegian required for this Nordic-focused role.',
    country: 'LV',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-cross — "Swedish language skills" on Germany job',
    title: 'Nordic Account Manager',
    desc: 'Swedish language skills required for Scandinavian clients.',
    country: 'DE',
    requires: true,
    advantage: false,
  },
  {
    label: '2a-cross — "Dutch is an advantage" on Sweden job',
    title: 'Benelux Sales Representative',
    desc: 'Based in Stockholm. Dutch is an advantage for this Benelux role.',
    country: 'SE',
    requires: false,
    advantage: true,
  },
  {
    label: '2a-cross — requirement wins over co-present cross advantage',
    title: 'Senior Consultant',
    // "excellent written and spoken Dutch" is a requirement; "additional languages is an asset"
    // is a generic advantage phrase — the requirement must win.
    desc: 'You must have excellent written and spoken Dutch. Additional languages is an asset.',
    country: 'DE',
    requires: true,
    advantage: false,
  },

  // ── Phase 2b: Location-conditional requirement ────────────────────────────

  {
    label: '2b — "depending on location, Finnish"',
    title: 'Customer Advisor',
    desc: 'Fluent English required; depending on location, Finnish may also be needed.',
    country: 'FI',
    requires: true,
    advantage: false,
  },
  {
    label: '2b — "depending on your location" with Swedish',
    title: 'Client Support Specialist',
    desc: 'Depending on your location, Swedish or Norwegian will be required.',
    country: 'SE',
    requires: true,
    advantage: false,
  },

  // ── Phase 2d: No signal — English assumed ─────────────────────────────────

  {
    label: '2d — plain English description, no language mention',
    title: 'Senior Software Engineer',
    desc: 'We are looking for an experienced engineer to join our product team.',
    country: 'FI',
    requires: false,
    advantage: false,
  },
  {
    label: '2d — English description with "working language is English"',
    title: 'Product Designer',
    desc: 'Our working language is English. Join our international design team.',
    country: 'FI',
    requires: false,
    advantage: false,
  },
  {
    label: '2d — English title and description, Germany',
    title: 'Backend Engineer',
    desc: 'Build scalable backend services in our Berlin office.',
    country: 'DE',
    requires: false,
    advantage: false,
  },
  {
    label: '2d — no description provided',
    title: 'Data Scientist',
    country: 'SE',
    requires: false,
    advantage: false,
  },
];
