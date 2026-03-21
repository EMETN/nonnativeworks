import { detect } from 'tinyld';
import type { RawJob, ClassifiedJob } from './ats/types';

// ---------------------------------------------------------------------------
// Category keyword map
// Matched against lowercased job title (primary) and description (fallback).
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  engineering: [
    'engineer', 'developer', 'programmer', 'devops', 'sre', 'reliability',
    'frontend', 'front-end', 'backend', 'back-end', 'fullstack', 'full-stack',
    'full stack', 'software', 'architect', 'infrastructure', 'platform',
    'mobile', 'ios', 'android', 'embedded', 'firmware', 'hardware',
    'data scientist', 'data engineer', 'machine learning', 'ml engineer',
    'cloud', 'security engineer', 'cybersecurity', 'network engineer',
    'systems engineer', 'qa engineer', 'quality assurance', 'tester',
    'database administrator', 'dba', 'analytics engineer', 'it support',
    'it engineer', 'information technology',
  ],
  marketing: [
    'marketing', 'seo', 'sem', 'content strategist', 'content writer',
    'social media', 'brand', 'growth hacker', 'growth marketer',
    'campaign', 'copywriter', 'copywriting', 'digital marketing',
    'performance marketing', 'email marketing', 'demand generation',
    'product marketing', 'public relations', ' pr ', 'communications manager',
    'communications director', 'cmo',
  ],
  sales: [
    'sales', 'account executive', 'account manager', 'business development',
    'bdm', 'bdr', 'sdr', 'revenue', 'partnership manager',
    'partner manager', 'commercial manager', 'field sales',
    'enterprise sales', 'sales development', 'head of sales', 'vp sales',
    'chief revenue', 'cro',
  ],
  hr: [
    'recruiter', 'recruitment', 'talent acquisition', 'talent partner',
    'people operations', 'people partner', 'hrbp', 'hr business partner',
    'hr manager', 'hr director', 'chief people', 'cpo', 'payroll',
    'compensation', 'learning and development', 'l&d', 'onboarding',
    'organisational development', 'organizational development',
  ],
  finance: [
    'finance', 'financial', 'accountant', 'accounting', 'controller',
    'cfo', 'chief financial', 'treasury', 'audit', 'auditor', 'tax',
    'bookkeeper', 'fp&a', 'financial analyst', 'investor relations',
    'billing', 'revenue operations',
  ],
  design: [
    'designer', ' ux ', 'ux designer', 'ui designer', 'user experience',
    'user interface', 'product designer', 'graphic designer', 'visual designer',
    'creative director', 'art director', 'brand designer', 'motion designer',
    'illustrator', 'design lead',
  ],
  operations: [
    'operations manager', 'operations director', 'head of operations',
    'supply chain', 'logistics', 'procurement', 'facilities',
    'office manager', 'executive assistant', 'program manager',
    'project manager', 'pmo', 'coo', 'process manager',
    'business operations', 'revenue ops', 'revops',
  ],
  'customer-support': [
    'customer support', 'customer service', 'customer success',
    'support engineer', 'helpdesk', 'help desk', 'service desk',
    'technical support', 'client support', 'customer experience',
    'success manager', 'customer care', 'support specialist',
    'support agent',
  ],
  legal: [
    'legal', 'counsel', 'lawyer', 'attorney', 'compliance',
    'regulatory', 'privacy', 'gdpr', 'paralegal', 'intellectual property',
    'general counsel', 'clo', 'chief legal',
  ],
};

// ---------------------------------------------------------------------------
// Country-code → language keyword pairs used for native language detection.
// ---------------------------------------------------------------------------

const COUNTRY_LANGUAGE_MAP: Record<string, string[]> = {
  FI: ['finnish', 'suomi', 'suomen'],
  SE: ['swedish', 'svenska'],
  NO: ['norwegian', 'norsk', 'bokmål', 'nynorsk'],
  DK: ['danish', 'dansk'],
  IS: ['icelandic', 'íslenska'],
  DE: ['german', 'deutsch'],
  AT: ['german', 'deutsch'],
  CH: ['german', 'deutsch', 'french', 'français', 'italian', 'italiano'],
  NL: ['dutch', 'nederlands'],
  BE: ['dutch', 'nederlands', 'french', 'français', 'flemish'],
  FR: ['french', 'français', 'francais'],
  IT: ['italian', 'italiano'],
  ES: ['spanish', 'español', 'espanol', 'castellano'],
  PT: ['portuguese', 'português', 'portugues'],
  PL: ['polish', 'polski'],
  CZ: ['czech', 'čeština', 'cestina'],
  SK: ['slovak', 'slovenčina'],
  HU: ['hungarian', 'magyar'],
  RO: ['romanian', 'română', 'romana'],
  BG: ['bulgarian', 'български'],
  HR: ['croatian', 'hrvatski'],
  SI: ['slovenian', 'slovenščina'],
  RS: ['serbian', 'srpski'],
  EE: ['estonian', 'eesti'],
  LV: ['latvian', 'latviešu'],
  LT: ['lithuanian', 'lietuvių'],
  GR: ['greek', 'ελληνικά'],
  TR: ['turkish', 'türkçe'],
  UA: ['ukrainian', 'українська'],
  RU: ['russian', 'русский'],
  GE: ['georgian', 'ქართული'],
  IL: ['hebrew', 'עברית'],
  JP: ['japanese', '日本語'],
  CN: ['chinese', 'mandarin', '普通话'],
  KR: ['korean', '한국어'],
  BA: ['bosnian', 'croatian', 'serbian'],
  MK: ['macedonian'],
  ME: ['montenegrin'],
  AL: ['albanian', 'shqip'],
  MD: ['romanian', 'moldovan'],
  BY: ['belarusian', 'russian'],
};

// Maps country code → ISO 639-1 language codes recognised by tinyld.
// Multiple codes for countries with regional variants (e.g. Norwegian nb/nn).
const COUNTRY_LANG_CODES: Record<string, string[]> = {
  FI: ['fi'],
  SE: ['sv'],
  NO: ['no', 'nb', 'nn'],
  DK: ['da'],
  IS: ['is'],
  NL: ['nl'],
  DE: ['de'],
  AT: ['de'],
  CH: ['de', 'fr', 'it'],
  BE: ['nl', 'fr'],
  FR: ['fr'],
  IT: ['it'],
  ES: ['es'],
  PT: ['pt'],
  PL: ['pl'],
  CZ: ['cs'],
  SK: ['sk'],
  HU: ['hu'],
  RO: ['ro'],
  HR: ['hr'],
  SI: ['sl'],
  RS: ['sr'],
  EE: ['et'],
  LV: ['lv'],
  LT: ['lt'],
  BG: ['bg'],
  GR: ['el'],
  TR: ['tr'],
  UA: ['uk'],
  RU: ['ru'],
};

// Phrases that explicitly confirm English is the working language → high confidence false
const ENGLISH_ONLY_PHRASES = [
  'working language is english',
  'working language: english',
  'the working language is english',
  'company language is english',
  'our language is english',
  'english is our official language',
  'english is our company language',
  'english as the working language',
  'all communication in english',
  'english-speaking environment',
  'english speaking environment',
  'we work in english',
  'we communicate in english',
  'everything is in english',
  'english is the language',
  'english only environment',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Returns true if the title contains non-ASCII characters suggesting a non-English language. */
function titleAppearsNonEnglish(title: string): boolean {
  // Common European non-ASCII characters that appear in local-language job titles
  return /[äöüåéèêëàâîïôùûçñßãõøæœ]/i.test(title);
}

/**
 * Splits description into paragraphs and runs tinyld on each chunk long enough
 * to be reliable (≥80 chars). Returns true if any chunk is detected as one of
 * the target language codes. Handles mixed-language ads where e.g. the intro is
 * in English but the body is in German.
 */
function anyChunkInLanguage(text: string, langCodes: string[]): boolean {
  if (!langCodes.length) return false;
  const chunks = text.split(/\n+/).map((c) => c.trim()).filter((c) => c.length >= 80);
  // Also check the full text as a single chunk if no paragraphs were long enough
  const candidates = chunks.length > 0 ? chunks : [text.trim()];
  for (const chunk of candidates) {
    if (langCodes.includes(detect(chunk))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Category classifier
// ---------------------------------------------------------------------------

export function classifyCategory(title: string, descriptionText?: string): string {
  const titleLower = ` ${title.toLowerCase()} `;

  // Score by title first
  let best = 'other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }

  if (bestScore > 0) return best;

  // Fallback: scan description text
  if (descriptionText) {
    const descLower = descriptionText.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (descLower.includes(kw)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Native language detector
// ---------------------------------------------------------------------------

/**
 * Builds compound "advantage" signals for a given language keyword.
 * These phrases indicate the language is preferred/nice-to-have, not required.
 */
function buildAdvantageSignals(lang: string): string[] {
  const langMentions = [
    lang,
    `${lang} skills`,
    `${lang} language`,
    `${lang} language skills`,
    `${lang} proficiency`,
    `proficiency in ${lang}`,
    `knowledge of ${lang}`,
    `${lang} knowledge`,
    `${lang} communication`,
  ];

  const advantageModifiers = [
    ' is an advantage',
    ' is a plus',
    ' is a bonus',
    ' is preferred',
    ' is desirable',
    ' is nice to have',
    ' is beneficial',
    ' would be an advantage',
    ' would be a plus',
    ' would be beneficial',
    ' would be an asset',
    ' is considered an advantage',
    ' is considered a plus',
    ' is considered a bonus',
    ' as a plus',
    ' as an advantage',
    ' seen as an advantage',
  ];

  const signals: string[] = [];
  for (const mention of langMentions) {
    for (const modifier of advantageModifiers) {
      signals.push(`${mention}${modifier}`);
    }
  }
  signals.push(`nice to have: ${lang}`);
  signals.push(`nice to have ${lang}`);
  return signals;
}

export function detectNativeLanguage(
  title: string,
  descriptionHtml: string | undefined,
  countryCode: string,
): { value: boolean; local_language_advantage: boolean; confidence: 'high' | 'low' } {
  // Non-English title → high confidence true
  if (titleAppearsNonEnglish(title)) {
    return { value: true, local_language_advantage: false, confidence: 'high' };
  }

  const descText = descriptionHtml ? stripHtml(descriptionHtml) : '';
  const combined = `${title} ${descText}`.toLowerCase();

  const languages = COUNTRY_LANGUAGE_MAP[countryCode.toUpperCase()] ?? [];

  // Check for explicit "advantage/plus" signals FIRST — before tinyld language detection.
  // This handles the case where fetchPageHtml returns a full page (navigation, footer, etc.)
  // in the local language, which would cause tinyld to fire even when the job description
  // itself says "Finnish is a plus". An explicit advantage phrase is a stronger signal.
  for (const lang of languages) {
    for (const signal of buildAdvantageSignals(lang)) {
      if (combined.includes(signal)) {
        return { value: false, local_language_advantage: true, confidence: 'high' };
      }
    }
  }

  // Any paragraph of the description detected as the country's language → high confidence true
  // Handles mixed ads where the intro is English but the body is in the local language
  const langCodes = COUNTRY_LANG_CODES[countryCode.toUpperCase()] ?? [];
  if (anyChunkInLanguage(descText, langCodes)) {
    return { value: true, local_language_advantage: false, confidence: 'high' };
  }

  // Explicit mention of a local language requirement → high confidence true
  for (const lang of languages) {
    const signals = [
      // Direct requirement
      `${lang} required`,
      `${lang} is required`,
      `${lang} is a must`,
      `${lang} is mandatory`,
      `${lang} is essential`,
      `${lang} is necessary`,
      `${lang} is needed`,
      `${lang} is a requirement`,
      `${lang} fluency`,
      `requires ${lang}`,
      `must speak ${lang}`,
      `must be ${lang}`,
      // Fluency / proficiency
      `fluent ${lang}`,
      `fluent in ${lang}`,
      `fluency in ${lang}`,
      `proficiency in ${lang}`,
      `${lang} proficiency`,
      `proficient in ${lang}`,
      `working proficiency in ${lang}`,
      `${lang} language proficiency`,
      `working knowledge of ${lang}`,
      `knowledge of ${lang}`,
      // Level descriptors
      `business ${lang}`,
      `business-level ${lang}`,
      `professional ${lang}`,
      `${lang} at a professional level`,
      `${lang} at professional level`,
      // Native / mother tongue
      `native ${lang}`,
      `${lang} native`,
      `mother tongue ${lang}`,
      `${lang} as mother tongue`,
      `${lang} as a mother tongue`,
      // Speaker / communication
      `${lang} speaker`,
      `speaks ${lang}`,
      `speak ${lang}`,
      `communicate in ${lang}`,
      `${lang} communication skills`,
      `${lang} language skills`,
      `${lang} skills`,
      // Written + spoken
      `written and spoken ${lang}`,
      `spoken and written ${lang}`,
      `${lang} written and spoken`,
      `${lang} spoken and written`,
      // Working language phrasing
      `working language is ${lang}`,
      `working language: ${lang}`,
      `the working language is ${lang}`,
      `${lang} working language`,
      // "Both X and English" — local language is co-required alongside English
      `both ${lang} and`,
      `in both ${lang}`,
      `${lang} and english`,
      `english and ${lang}`,
      `${lang}/english`,
      `english/${lang}`,
    ];
    for (const signal of signals) {
      if (combined.includes(signal)) return { value: true, local_language_advantage: false, confidence: 'high' };
    }
  }

  // Explicit confirmation that English is the working language → high confidence false
  for (const phrase of ENGLISH_ONLY_PHRASES) {
    if (combined.includes(phrase)) return { value: false, local_language_advantage: false, confidence: 'high' };
  }

  // Default: assume English is sufficient — low confidence, admin can review
  return { value: false, local_language_advantage: false, confidence: 'low' };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function classifyJob(job: RawJob, countryCode: string): ClassifiedJob {
  const descText = job.descriptionHtml
    ? stripHtml(job.descriptionHtml)
    : job.descriptionText;

  const category = classifyCategory(job.title, descText);
  const { value: requires_native_language, local_language_advantage, confidence } = detectNativeLanguage(
    job.title,
    job.descriptionHtml,
    countryCode,
  );

  return {
    title: job.title,
    url: job.url,
    category,
    requires_native_language,
    local_language_advantage,
    confidence,
  };
}
