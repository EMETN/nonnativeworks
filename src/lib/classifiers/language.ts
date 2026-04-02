import { detect } from 'tinyld';
import { titleAppearsNonEnglish } from '../ats/title-language';

// ---------------------------------------------------------------------------
// Country → language keyword map
// Used for text-signal matching (requirement phrases, advantage phrases).
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

// Country → ISO 639-1 codes recognised by tinyld.
// Regional variants are listed explicitly (e.g. Norwegian: no / nb / nn).
const COUNTRY_LANG_CODES: Record<string, string[]> = {
  FI: ['fi'],
  SE: ['sv'],
  NO: ['no', 'nb', 'nn', 'da'],  // tinyld often misdetects Norwegian as Danish — treat da as a NO signal too
  DK: ['da', 'no', 'nb', 'nn'],  // symmetrically, Norwegian misdetected as Danish is also a DK signal
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

// Country → canonical English language name(s), used in classification results.
const COUNTRY_LANGUAGE_NAMES: Record<string, string[]> = {
  FI: ['Finnish'],
  SE: ['Swedish'],
  NO: ['Norwegian'],
  DK: ['Danish'],
  IS: ['Icelandic'],
  DE: ['German'],
  AT: ['German'],
  CH: ['German', 'French', 'Italian'],
  NL: ['Dutch'],
  BE: ['Dutch', 'French'],
  FR: ['French'],
  IT: ['Italian'],
  ES: ['Spanish'],
  PT: ['Portuguese'],
  PL: ['Polish'],
  CZ: ['Czech'],
  SK: ['Slovak'],
  HU: ['Hungarian'],
  RO: ['Romanian'],
  BG: ['Bulgarian'],
  HR: ['Croatian'],
  SI: ['Slovenian'],
  RS: ['Serbian'],
  EE: ['Estonian'],
  LV: ['Latvian'],
  LT: ['Lithuanian'],
  GR: ['Greek'],
  TR: ['Turkish'],
  UA: ['Ukrainian'],
  RU: ['Russian'],
  GE: ['Georgian'],
  IL: ['Hebrew'],
  JP: ['Japanese'],
  CN: ['Chinese'],
  KR: ['Korean'],
  BA: ['Bosnian', 'Croatian', 'Serbian'],
  MK: ['Macedonian'],
  ME: ['Montenegrin'],
  AL: ['Albanian'],
  MD: ['Romanian'],
  BY: ['Belarusian', 'Russian'],
};

// Flat reverse map: every keyword in COUNTRY_LANGUAGE_MAP → canonical English name.
// Used by the cross-language scan to identify non-local language requirements
// (e.g. "fluent Norwegian required" on a job located in Latvia).
const KEYWORD_TO_CANONICAL_NAME: Record<string, string> = {
  'finnish': 'Finnish', 'suomi': 'Finnish', 'suomen': 'Finnish',
  'swedish': 'Swedish', 'svenska': 'Swedish',
  'norwegian': 'Norwegian', 'norsk': 'Norwegian', 'bokmål': 'Norwegian', 'nynorsk': 'Norwegian',
  'danish': 'Danish', 'dansk': 'Danish',
  'icelandic': 'Icelandic', 'íslenska': 'Icelandic',
  'german': 'German', 'deutsch': 'German',
  'dutch': 'Dutch', 'nederlands': 'Dutch', 'flemish': 'Dutch',
  'french': 'French', 'français': 'French', 'francais': 'French',
  'italian': 'Italian', 'italiano': 'Italian',
  'spanish': 'Spanish', 'español': 'Spanish', 'espanol': 'Spanish', 'castellano': 'Spanish',
  'portuguese': 'Portuguese', 'português': 'Portuguese', 'portugues': 'Portuguese',
  'polish': 'Polish', 'polski': 'Polish',
  'czech': 'Czech', 'čeština': 'Czech', 'cestina': 'Czech',
  'slovak': 'Slovak', 'slovenčina': 'Slovak',
  'hungarian': 'Hungarian', 'magyar': 'Hungarian',
  'romanian': 'Romanian', 'română': 'Romanian', 'romana': 'Romanian', 'moldovan': 'Romanian',
  'bulgarian': 'Bulgarian', 'български': 'Bulgarian',
  'croatian': 'Croatian', 'hrvatski': 'Croatian',
  'slovenian': 'Slovenian', 'slovenščina': 'Slovenian',
  'serbian': 'Serbian', 'srpski': 'Serbian',
  'estonian': 'Estonian', 'eesti': 'Estonian',
  'latvian': 'Latvian', 'latviešu': 'Latvian',
  'lithuanian': 'Lithuanian', 'lietuvių': 'Lithuanian',
  'greek': 'Greek', 'ελληνικά': 'Greek',
  'turkish': 'Turkish', 'türkçe': 'Turkish',
  'ukrainian': 'Ukrainian', 'українська': 'Ukrainian',
  'russian': 'Russian', 'русский': 'Russian',
  'georgian': 'Georgian', 'ქართული': 'Georgian',
  'hebrew': 'Hebrew', 'עברית': 'Hebrew',
  'japanese': 'Japanese', '日本語': 'Japanese',
  'chinese': 'Chinese', 'mandarin': 'Chinese', '普通话': 'Chinese',
  'korean': 'Korean', '한국어': 'Korean',
  'bosnian': 'Bosnian', 'macedonian': 'Macedonian', 'montenegrin': 'Montenegrin',
  'albanian': 'Albanian', 'shqip': 'Albanian',
  'belarusian': 'Belarusian',
};

// Nordic/Scandinavian countries — used to gate group-language advantage phrases.
const NORDIC_COUNTRY_CODES = new Set(['FI', 'SE', 'NO', 'DK', 'IS']);

// Group-language advantage phrases: "a Nordic/Scandinavian language" is a regional
// umbrella term used in job ads to indicate that any Nordic language is a plus.
// These can't be generated by buildAdvantageSignals (which works per-language keyword)
// so they are listed statically here.
const NORDIC_LANGUAGE_REQUIREMENT_PHRASES = [
  'fluent in english and at least one nordic language',
  'fluent in english and at least one scandinavian language',
  'english and at least one nordic language',
  'english and at least one scandinavian language',
  'proficient in one of the nordic languages',
  'proficient in one of the scandinavian languages',
  'proficiency in english and one of the nordic languages',
  'proficiency in english and one of the scandinavian languages',
  'fluency in english and a nordic language',
  'fluency in english and a scandinavian language',
  'in english and in one nordic language',
  'in english and in one scandinavian language',
];

const NORDIC_LANGUAGE_ADVANTAGE_PHRASES = [
  'fluent in a nordic language',
  'fluent in a scandinavian language',
  'a nordic language is an advantage',
  'a nordic language is a plus',
  'a nordic language is a bonus',
  'a nordic language is preferred',
  'a nordic language is beneficial',
  'a nordic language would be an advantage',
  'a nordic language would be a plus',
  'a nordic language would be beneficial',
  'a nordic language seen as an advantage',
  'a scandinavian language is an advantage',
  'a scandinavian language is a plus',
  'a scandinavian language is a bonus',
  'a scandinavian language is preferred',
  'a scandinavian language would be an advantage',
  'a scandinavian language would be a plus',
  'knowledge of a nordic language',
  'knowledge of a scandinavian language',
  'nordic language skills is an advantage',
  'nordic language skills is a plus',
  'nordic language skills is preferred',
  'scandinavian language skills is an advantage',
  'scandinavian language skills is a plus',
  'a nordic language is a strong advantage',
  'a scandinavian language is a strong advantage',
  'knowledge of other nordic languages is considered an additional qualification',
  'nordic language is considered an additional qualification',
  'scandinavian language is considered an additional qualification',
  'nordic languages are a plus but not a requirement',
  'nordic language is a plus but not a requirement',
  'scandinavian languages are a plus but not a requirement',
  'scandinavian language is a plus but not a requirement',
  'nordic languages are not a requirement',
  'scandinavian languages are not a requirement',
];

// Phrases that explicitly confirm English is the working language.
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
// Per-country native-character detection
// Faster and more reliable than tinyld for languages with distinctive scripts.
//
// TO REMOVE THIS FEATURE: delete COUNTRY_NATIVE_CHARS, descriptionContainsNativeChars(),
// and the "Phase 1b-chars" block in detectNativeLanguage(). The SignalEntry
// phase '1b-chars' can be removed from the union type at the same time.
// ---------------------------------------------------------------------------

const COUNTRY_NATIVE_CHARS: Partial<Record<string, { pattern: RegExp; threshold: number }>> = {
  FI: { pattern: /[äöÄÖ]/g,              threshold: 5 },
  SE: { pattern: /[äöåÄÖÅ]/g,            threshold: 5 },
  NO: { pattern: /[æøåÆØÅ]/g,            threshold: 5 },
  DK: { pattern: /[æøåÆØÅ]/g,            threshold: 5 },
  IS: { pattern: /[þðÞÐ]/g,              threshold: 3 }, // þ/ð never appear in English
  DE: { pattern: /[äöüßÄÖÜ]/g,           threshold: 5 },
  AT: { pattern: /[äöüßÄÖÜ]/g,           threshold: 5 },
  EE: { pattern: /[äöõÄÖÕ]/g,            threshold: 5 },
  LV: { pattern: /[āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ]/g, threshold: 5 },
  LT: { pattern: /[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/g,    threshold: 5 },
  PL: { pattern: /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g,       threshold: 5 },
};

function descriptionContainsNativeChars(
  text: string,
  countryCode: string,
): { count: number; sample: string } | null {
  const entry = COUNTRY_NATIVE_CHARS[countryCode];
  if (!entry) return null;
  const matches = text.match(entry.pattern);
  if (!matches || matches.length < entry.threshold) return null;
  const unique = [...new Set(matches)].sort().join('');
  return { count: matches.length, sample: unique };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function stripHtml(html: string): string {
  // Remove entire sections that are never part of the job description body.
  // These are stripped with their contents to prevent navigation/footer text
  // (often in the local language) from triggering the tinyld language detector
  // on otherwise English job ads. Script/style contents are removed for the
  // same reason — minified JS produces garbage chunks.
  const stripped = html.replace(
    /<(script|style|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi,
    '',
  );
  // Convert block-level tags to newlines so paragraph structure survives for
  // tinyld chunk detection. Inline tags become spaces.
  return stripped
    .replace(/<\/?(p|div|li|h[1-6]|br|section|article|blockquote|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}



/**
 * Builds compound "advantage" signal phrases for a given language keyword, e.g.:
 *   "finnish is an advantage", "knowledge of german would be beneficial"
 *
 * These indicate the language is preferred / nice-to-have, not required.
 */
const LANG_MENTIONS = (lang: string) => [
  lang,
  `${lang} skills`,
  `${lang} language`,
  `${lang} language skills`,
  `${lang} proficiency`,
  `proficiency in ${lang}`,
  `knowledge of ${lang}`,
  `${lang} knowledge`,
  `${lang} communication`,
  `preferably also ${lang}`,
];

/**
 * Regex that matches "mention + (is|would be|as) a(n) [optional adjectives] (advantage|plus|bonus|asset)".
 * Handles any intensifier adjective(s) between the article and the noun without enumerating them.
 * Examples: "is an advantage", "is a big plus", "would be a strong asset", "seen as a huge advantage".
 */
function buildAdvantageRegex(lang: string): RegExp {
  const escaped = LANG_MENTIONS(lang).map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(
    `(?:${escaped.join('|')})\\s+(?:(?:is|are|would be)(?:\\s+(?:considered|seen\\s+as))?|(?:seen\\s+)?as)\\s+(?:a|an)\\s+(?:\\w+\\s+){0,2}(?:advantage|asset|plus|bonus)\\b`,
  );
}

function buildAdvantageSignals(lang: string): string[] {
  // Only modifiers that don't follow the "is a(n) [adj] advantage/plus/asset/bonus" pattern —
  // those are handled by buildAdvantageRegex above.
  const advantageModifiers = [
    ' is preferred',
    ' is desirable',
    ' is nice to have',
    ' is beneficial',
    ' would be beneficial',
    ' is considered an additional qualification',
  ];

  const signals: string[] = [];
  for (const mention of LANG_MENTIONS(lang)) {
    for (const modifier of advantageModifiers) {
      signals.push(`${mention}${modifier}`);
    }
  }
  signals.push(`nice to have: ${lang}`);
  signals.push(`nice to have ${lang}`);
  signals.push(`preferably ${lang}`);
  signals.push(`preferably also ${lang}`);
  return signals;
}

/** Explicit phrases that indicate the local language is required. */
function buildRequirementSignals(lang: string): string[] {
  return [
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
    `fluent language skills in ${lang}`,
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
    `mother language ${lang}`,
    `${lang} as mother language`,
    `${lang} as a mother language`,
    // Speaker / communication
    `${lang} speaker`,
    `${lang} speaking`,
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
    `english, and ${lang}`,
    `${lang}/english`,
    `english/${lang}`,
    `written and spoken English and ${lang}`,
    // "skills in X and in English" — co-requirement with "in" before each language
    `in ${lang} and in english`,
    `in english and in ${lang}`,
    `in ${lang} and english`,
    `${lang} and in english`,
    // Discussion / communication ability
    `discussions in ${lang}`,
    // Minimum level requirements — even basic knowledge means English alone isn't enough
    `basic ${lang}`,
    `basic in ${lang}`,
    `basic knowledge of ${lang}`,
    `basic level of ${lang}`,
    `some ${lang}`,
  ];
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type SignalEntry = {
  phase: '1a' | '1b' | '1b-chars' | '1c' | '2a' | '2a-nordic' | '2a-cross' | '2b' | '2c' | '2d-none';
  description: string;
  matched?: string; // exact phrase or character that triggered this signal
};

export type NativeLanguageResult = {
  value: boolean;
  local_language_advantage: boolean;
  requiredLanguages: string[];
  preferredLanguages: string[];
  signals: SignalEntry[];
};

/**
 * Like anyChunkInNativeLanguage but returns the matching chunk and detected
 * language code so callers can log exactly what triggered detection.
 *
 * For countries with distinctive native characters (see COUNTRY_NATIVE_CHARS),
 * the tinyld result is cross-checked against a minimum native-char count in
 * the same chunk. This prevents a single loanword or proper noun containing
 * one accented letter from causing a false positive — tinyld can be fooled by
 * even one unusual character in an otherwise English paragraph.
 */
function findNativeLanguageChunk(
  text: string,
  langCodes: string[],
  countryCode?: string,
): { chunk: string; detectedCode: string } | null {
  if (!langCodes.length) return null;
  const chunks = text.split(/\n+/).map((c) => c.trim()).filter((c) => c.length >= 80);
  const candidates = chunks.length > 0 ? chunks : [text.trim()];
  const nativeCharEntry = countryCode ? COUNTRY_NATIVE_CHARS[countryCode] : undefined;
  for (const chunk of candidates) {
    const code = detect(chunk);
    if (!langCodes.includes(code)) continue;
    // If we have a native-char pattern for this country, require at least 2
    // such characters in the chunk. A single accented letter from one word is
    // not enough evidence — it too easily misleads tinyld on English text.
    if (nativeCharEntry) {
      const matches = chunk.match(nativeCharEntry.pattern);
      if (!matches || matches.length < 2) continue;
    }
    return { chunk, detectedCode: code };
  }
  return null;
}

/**
 * Determines whether a job requires (or advantages) knowledge of the local
 * language. Classification happens in two phases:
 *
 * **Phase 1 — Is the job ad itself in the native language?**
 * A non-English title or native-language description is a high-confidence
 * signal that the role requires native language skills.
 *
 * One subtlety: advantage-signal phrases are evaluated *before* running
 * tinyld. When `fetchPageHtml` is used the `descriptionHtml` may contain
 * a full HTML page — including native-language navigation, headers, and
 * footers — that would cause tinyld to fire even though the actual job
 * description says "Finnish is a plus". An explicit advantage phrase in the
 * combined text is a stronger, more specific signal and wins.
 *
 * **Phase 2 — English content analysis**
 * The description appears to be in English. Scan for explicit language
 * requirement or advantage phrases. If none are found, the absence of any
 * local language signal is itself strong evidence that English is sufficient.
 */
export function detectNativeLanguage(
  title: string,
  descriptionText: string | undefined,
  countryCode: string,
): NativeLanguageResult {
  const cc = countryCode.toUpperCase();
  const languages = COUNTRY_LANGUAGE_MAP[cc] ?? [];
  const langCodes = COUNTRY_LANG_CODES[cc] ?? [];
  const langNames = COUNTRY_LANGUAGE_NAMES[cc] ?? [];

  // ── Phase 1a: Non-ASCII title ────────────────────────────────────────────
  // A job title with local-language characters is the clearest possible
  // signal — no further analysis needed.
  if (titleAppearsNonEnglish(title)) {
    const nonAsciiChar = title.match(/[äöüåéèêëàâîïôùûçñßãõøæœ]/i)?.[0];
    return {
      value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
      signals: [{ phase: '1a', description: 'non-ASCII title', matched: nonAsciiChar }],
    };
  }

  const descText = descriptionText ?? '';
  // Flatten whitespace (including newlines from stripHtml block-tag conversion)
  // so signal phrases aren't broken by HTML structure. tinyld uses descText
  // directly and still gets the original paragraph breaks.
  // Also normalize parentheses (strip them while keeping content) so that
  // "English (and Dutch)" becomes "English and Dutch", and normalize "&" to
  // "and" so "English & Swedish" matches the same signals as "English and Swedish".
  const combined = `${title} ${descText}`.toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/&/g, 'and')
    .replace(/\s+/g, ' ');

  // ── Phase 1b: Advantage-signal pre-filter (before tinyld) ───────────────
  // Check for explicit "X is a plus / an advantage" phrases before running
  // tinyld. See the JSDoc above for why this ordering matters.
  for (const lang of languages) {
    for (const signal of buildAdvantageSignals(lang)) {
      if (combined.includes(signal)) {
        return {
          value: false, local_language_advantage: true, requiredLanguages: [], preferredLanguages: langNames,
          signals: [{ phase: '1b', description: 'advantage phrase pre-filter', matched: signal }],
        };
      }
    }
    const advMatch = buildAdvantageRegex(lang).exec(combined);
    if (advMatch) {
      return {
        value: false, local_language_advantage: true, requiredLanguages: [], preferredLanguages: langNames,
        signals: [{ phase: '1b', description: 'advantage phrase pre-filter', matched: advMatch[0] }],
      };
    }
  }

  // Group-language advantage phrases (e.g. "fluent in a Nordic language").
  if (NORDIC_COUNTRY_CODES.has(cc)) {
    for (const phrase of NORDIC_LANGUAGE_ADVANTAGE_PHRASES) {
      if (combined.includes(phrase)) {
        return {
          value: false, local_language_advantage: true, requiredLanguages: [], preferredLanguages: langNames,
          signals: [{ phase: '1b', description: 'Nordic/Scandinavian advantage phrase', matched: phrase }],
        };
      }
    }
  }

  // ── Phase 1b-chars: Description character-frequency check ───────────────
  // Counts occurrences of language-specific non-ASCII characters in the
  // description. A sufficient count (see COUNTRY_NATIVE_CHARS thresholds) is
  // a near-certain indicator that the text is written in the local language —
  // more reliable than tinyld for short or mixed-language descriptions.
  // TO REMOVE: delete the block below plus COUNTRY_NATIVE_CHARS and
  // descriptionContainsNativeChars() above, and '1b-chars' from SignalEntry.
  if (descText) {
    const charMatch = descriptionContainsNativeChars(descText, cc);
    if (charMatch) {
      return {
        value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
        signals: [{
          phase: '1b-chars',
          description: `${charMatch.count} native chars in description`,
          matched: charMatch.sample,
        }],
      };
    }
  }

  // ── Phase 1c: tinyld content language detection ──────────────────────────
  // Fallback for languages without distinctive characters (e.g. French, Spanish).
  // If any paragraph of the description is detected as the country's language,
  // the ad is (at least partially) written in that language.
  const nativeChunk = findNativeLanguageChunk(descText, langCodes, cc);
  if (nativeChunk) {
    return {
      value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
      signals: [{
        phase: '1c',
        description: `tinyld detected "${nativeChunk.detectedCode}" in description`,
        matched: nativeChunk.chunk.slice(0, 80) + (nativeChunk.chunk.length > 80 ? '…' : ''),
      }],
    };
  }

  // ── Phase 2a: Explicit language requirement signals ──────────────────────
  // The description is in English — scan for phrases that explicitly require
  // the local language (e.g. "fluent Finnish", "working language is German").

  // Generic "native local/country language" phrase — doesn't name the language
  // but clearly means native fluency in the local language is required.
  const genericMatch = languages.length > 0
    ? combined.match(/native (?:local country|local|country|regional) language/)
    : null;
  if (genericMatch) {
    return {
      value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
      signals: [{ phase: '2a', description: 'generic native language phrase', matched: genericMatch[0] }],
    };
  }

  if (NORDIC_COUNTRY_CODES.has(cc)) {
    for (const phrase of NORDIC_LANGUAGE_REQUIREMENT_PHRASES) {
      if (combined.includes(phrase)) {
        return {
          value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
          signals: [{ phase: '2a-nordic', description: 'Nordic/Scandinavian requirement phrase', matched: phrase }],
        };
      }
    }
  }

  for (const lang of languages) {
    for (const signal of buildRequirementSignals(lang)) {
      if (combined.includes(signal)) {
        return {
          value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
          signals: [{ phase: '2a', description: `"${lang}" requirement phrase`, matched: signal }],
        };
      }
    }
  }

  // ── Phase 2a-cross: Cross-language scan ─────────────────────────────────
  // Checks requirement and advantage signals for every tracked language,
  // not just the country's own. Catches cases like "fluent Norwegian required"
  // on a job located in Latvia. Runs after country-specific phases to keep
  // those as the authoritative signal when the country language does match.
  {
    const countryKeywordSet = new Set(languages);
    for (const [kw, canonicalName] of Object.entries(KEYWORD_TO_CANONICAL_NAME)) {
      if (countryKeywordSet.has(kw)) continue; // already covered by Phase 2a
      // Advantage signals are checked before requirement signals — a phrase like
      // "proficiency in Finnish is a big advantage" contains "proficiency in finnish"
      // which is also a requirement signal substring, so advantage must win.
      const advMatch = buildAdvantageRegex(kw).exec(combined);
      if (advMatch) {
        return {
          value: false, local_language_advantage: true, requiredLanguages: [], preferredLanguages: [canonicalName],
          signals: [{ phase: '2a-cross', description: `cross-language advantage: ${canonicalName}`, matched: advMatch[0] }],
        };
      }
      for (const signal of buildAdvantageSignals(kw)) {
        if (combined.includes(signal)) {
          return {
            value: false, local_language_advantage: true, requiredLanguages: [], preferredLanguages: [canonicalName],
            signals: [{ phase: '2a-cross', description: `cross-language advantage: ${canonicalName}`, matched: signal }],
          };
        }
      }
      for (const signal of buildRequirementSignals(kw)) {
        if (combined.includes(signal)) {
          return {
            value: true, local_language_advantage: false, requiredLanguages: [canonicalName], preferredLanguages: [],
            signals: [{ phase: '2a-cross', description: `cross-language requirement: ${canonicalName}`, matched: signal }],
          };
        }
      }
    }
  }

  // ── Phase 2b: "depending on location" conditional requirement ───────────
  // e.g. "Fluent English and, depending on the location, Finnish, Swedish or Lithuanian."
  // The country's language may not be the first listed, so we can't rely on
  // substring order — we check for the trigger phrase + language anywhere in the text.
  if (/depending on (?:the |your )?location/i.test(combined)) {
    for (const lang of languages) {
      if (combined.includes(lang)) {
        return {
          value: true, local_language_advantage: false, requiredLanguages: langNames, preferredLanguages: [],
          signals: [{ phase: '2b', description: 'location-conditional requirement', matched: `depending on location + ${lang}` }],
        };
      }
    }
  }

  // ── Phase 2c: Explicit English-only confirmation ─────────────────────────
  // Disabled: "working language is English" can coexist with a local language
  // requirement (e.g. "our working language is English, but Finnish is required
  // for client communication"). Falls through to 2d which reaches the same
  // conclusion by absence of any positive signal.
  //
  // for (const phrase of ENGLISH_ONLY_PHRASES) {
  //   if (combined.includes(phrase)) {
  //     return {
  //       value: false, local_language_advantage: false, requiredLanguages: [], preferredLanguages: [],
  //       signals: [{ phase: '2c', description: 'English-only confirmation', matched: phrase }],
  //     };
  //   }
  // }

  // ── Phase 2d default ─────────────────────────────────────────────────────
  // No explicit signals found — absence of any local language requirement is
  // itself a strong signal that English is sufficient.
  return {
    value: false, local_language_advantage: false, requiredLanguages: [], preferredLanguages: [],
    signals: [{ phase: '2d-none', description: 'no signal — English assumed' }],
  };
}
