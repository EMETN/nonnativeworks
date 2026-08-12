import { detect } from 'tinyld';
import { titleAppearsNonEnglish, KEYWORDS_RE } from '../ats/title-language';

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
    LU: [
        'luxembourgish',
        'luxembourgeois',
        'lëtzebuergesch',
        'french',
        'français',
        'francais',
        'german',
        'deutsch',
    ],
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
    NO: ['no', 'nb', 'nn', 'da'], // tinyld often misdetects Norwegian as Danish — treat da as a NO signal too
    DK: ['da', 'no', 'nb', 'nn'], // symmetrically, Norwegian misdetected as Danish is also a DK signal
    IS: ['is'],
    NL: ['nl'],
    DE: ['de'],
    AT: ['de'],
    CH: ['de', 'fr', 'it'],
    BE: ['nl', 'fr'],
    FR: ['fr'],
    LU: ['fr', 'de'],
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
    LU: ['Luxembourgish', 'French', 'German'],
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
    finnish: 'Finnish',
    suomi: 'Finnish',
    suomen: 'Finnish',
    swedish: 'Swedish',
    svenska: 'Swedish',
    norwegian: 'Norwegian',
    norsk: 'Norwegian',
    bokmål: 'Norwegian',
    nynorsk: 'Norwegian',
    danish: 'Danish',
    dansk: 'Danish',
    icelandic: 'Icelandic',
    íslenska: 'Icelandic',
    german: 'German',
    deutsch: 'German',
    luxembourgish: 'Luxembourgish',
    luxembourgeois: 'Luxembourgish',
    lëtzebuergesch: 'Luxembourgish',
    dutch: 'Dutch',
    nederlands: 'Dutch',
    flemish: 'Dutch',
    french: 'French',
    français: 'French',
    francais: 'French',
    italian: 'Italian',
    italiano: 'Italian',
    spanish: 'Spanish',
    español: 'Spanish',
    espanol: 'Spanish',
    castellano: 'Spanish',
    portuguese: 'Portuguese',
    português: 'Portuguese',
    portugues: 'Portuguese',
    polish: 'Polish',
    polski: 'Polish',
    czech: 'Czech',
    čeština: 'Czech',
    cestina: 'Czech',
    slovak: 'Slovak',
    slovenčina: 'Slovak',
    hungarian: 'Hungarian',
    magyar: 'Hungarian',
    romanian: 'Romanian',
    română: 'Romanian',
    romana: 'Romanian',
    moldovan: 'Romanian',
    bulgarian: 'Bulgarian',
    български: 'Bulgarian',
    croatian: 'Croatian',
    hrvatski: 'Croatian',
    slovenian: 'Slovenian',
    slovenščina: 'Slovenian',
    serbian: 'Serbian',
    srpski: 'Serbian',
    estonian: 'Estonian',
    eesti: 'Estonian',
    latvian: 'Latvian',
    latviešu: 'Latvian',
    lithuanian: 'Lithuanian',
    lietuvių: 'Lithuanian',
    greek: 'Greek',
    ελληνικά: 'Greek',
    turkish: 'Turkish',
    türkçe: 'Turkish',
    ukrainian: 'Ukrainian',
    українська: 'Ukrainian',
    russian: 'Russian',
    русский: 'Russian',
    georgian: 'Georgian',
    ქართული: 'Georgian',
    hebrew: 'Hebrew',
    עברית: 'Hebrew',
    japanese: 'Japanese',
    日本語: 'Japanese',
    chinese: 'Chinese',
    mandarin: 'Chinese',
    普通话: 'Chinese',
    korean: 'Korean',
    한국어: 'Korean',
    bosnian: 'Bosnian',
    macedonian: 'Macedonian',
    montenegrin: 'Montenegrin',
    albanian: 'Albanian',
    shqip: 'Albanian',
    belarusian: 'Belarusian',
    arabic: 'Arabic',
};

// Every recognized language keyword, plus 'english' — used to detect when an
// advantage/requirement phrase actually names a DIFFERENT language than the one
// currently being evaluated (see textNamesOtherLanguageBefore below).
const ALL_LANG_KEYWORDS = new Set([
    ...Object.keys(KEYWORD_TO_CANONICAL_NAME),
    'english',
]);

// Nordic/Scandinavian countries — used to gate group-language advantage phrases.
const NORDIC_COUNTRY_CODES = new Set(['FI', 'SE', 'NO', 'DK', 'IS']);

// Baltic countries — used to gate Baltic group-language phrases.
const BALTIC_COUNTRY_CODES = new Set(['LV', 'LT', 'EE']);

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
    'a nordic language is mandatory',
    'a nordic language is required',
    'a scandinavian language is mandatory',
    'a scandinavian language is required',
    'at least one nordic language is required',
    'at least one scandinavian language is required',
    'at least one nordic language is mandatory',
    'at least one scandinavian language is mandatory',
    'fluent in one scandinavian language',
    'fluent in one nordic language',
    'fluent in one scandinavian language and english',
    'fluent in one nordic language and english',
    'nordic language skills are required',
    'nordic language skills are mandatory',
    'nordic language skills is required',
    'nordic language skills is mandatory',
    'scandinavian language skills are required',
    'scandinavian language skills are mandatory',
    'scandinavian language skills is required',
    'scandinavian language skills is mandatory',
];

const BALTIC_LANGUAGE_REQUIREMENT_PHRASES = [
    'at least one of local baltic language',
    'at least one baltic language',
    'at least one baltic language is required',
    'at least one baltic language is mandatory',
    'fluency in english and at least one baltic language',
    'fluent in english and at least one baltic language',
    'english and at least one baltic language',
    'a baltic language is mandatory',
    'a baltic language is required',
    'baltic language skills are required',
    'baltic language skills are mandatory',
    'baltic language skills is required',
    'baltic language skills is mandatory',
];

const BALTIC_LANGUAGE_ADVANTAGE_PHRASES = [
    'a baltic language is an advantage',
    'a baltic language is a plus',
    'a baltic language is a bonus',
    'a baltic language is preferred',
    'a baltic language would be an advantage',
    'a baltic language would be a plus',
    'knowledge of a baltic language',
    'baltic language skills is an advantage',
    'baltic language skills is a plus',
    'baltic language skills are an advantage',
    'baltic language skills are a plus',
    'baltic language skills are preferred',
    'another baltic language is an advantage',
    'another baltic language is a plus',
    'another baltic language is a bonus',
    'another baltic language is preferred',
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
    'nordic language skills are an advantage',
    'nordic language skills are a plus',
    'nordic language skills are preferred',
    'scandinavian language skills is an advantage',
    'scandinavian language skills is a plus',
    'scandinavian language skills are an advantage',
    'scandinavian language skills are a plus',
    'another nordic language is an advantage',
    'another nordic language is a plus',
    'another nordic language is a bonus',
    'another nordic language is preferred',
    'another nordic language is beneficial',
    'another scandinavian language is an advantage',
    'another scandinavian language is a plus',
    'another scandinavian language is a bonus',
    'another scandinavian language is preferred',
    'another scandinavian language is beneficial',
    'a nordic language is a strong advantage',
    'a scandinavian language is a strong advantage',
    'proficiency in one of the nordic languages is beneficial',
    'proficiency in one of the scandinavian languages is beneficial',
    'knowledge of other nordic languages is considered an additional qualification',
    'nordic language is considered an additional qualification',
    'scandinavian language is considered an additional qualification',
    'nordic languages are a plus but not a requirement',
    'nordic language is a plus but not a requirement',
    'scandinavian languages are a plus but not a requirement',
    'scandinavian language is a plus but not a requirement',
    'nordic languages are not a requirement',
    'scandinavian languages are not a requirement',
    'any nordics language will be value addition',
    'any nordic language will be value addition',
    'any scandinavian language will be value addition',
    'any nordics language is a value addition',
    'any nordic language is a value addition',
    'any scandinavian language is a value addition',
    'nordics language will be value addition',
    'nordic language will be value addition',
    'scandinavian language will be value addition',
];

// ---------------------------------------------------------------------------
// Per-country native-character detection
// Faster and more reliable than tinyld for languages with distinctive scripts.
//
// TO REMOVE THIS FEATURE: delete COUNTRY_NATIVE_CHARS, descriptionContainsNativeChars(),
// and the "Phase 1b-chars" block in detectNativeLanguage(). The SignalEntry
// phase '1b-chars' can be removed from the union type at the same time.
// ---------------------------------------------------------------------------

const COUNTRY_NATIVE_CHARS: Partial<
    Record<string, { pattern: RegExp; threshold: number }>
> = {
    FI: { pattern: /[äöÄÖ]/g, threshold: 15 },
    SE: { pattern: /[äöåÄÖÅ]/g, threshold: 15 },
    NO: { pattern: /[æøåÆØÅ]/g, threshold: 15 },
    DK: { pattern: /[æøåÆØÅ]/g, threshold: 10 },
    IS: { pattern: /[þðÞÐ]/g, threshold: 10 }, // þ/ð never appear in English
    DE: { pattern: /[äöüßÄÖÜ]/g, threshold: 10 },
    AT: { pattern: /[äöüßÄÖÜ]/g, threshold: 10 },
    EE: { pattern: /[äöõÄÖÕ]/g, threshold: 10 },
    LV: { pattern: /[āčēģīķļņšūžĀČĒĢĪĶĻŅŠŪŽ]/g, threshold: 15 },
    LT: { pattern: /[ąčęėįšųūžĄČĘĖĮŠŲŪŽ]/g, threshold: 15 },
    PL: { pattern: /[ąćęłńśźżĄĆĘŁŃŚŹŻ]/g, threshold: 10 },
    // French diacritics are far less diagnostic per-character than Nordic ones — they
    // show up as loanwords and, especially in this dataset, as French place names
    // embedded in otherwise-English ads (e.g. "based in Vélizy-Villacoublay"). A
    // higher threshold (vs. 10-15 for Nordic) keeps a handful of city-name mentions
    // from tripping it, while genuine French body text — even short, boilerplate-free
    // paragraphs — reliably runs 35+ occurrences. Tested against real Thales
    // descriptions (36-106 chars) vs. a worst-case adversarial English paragraph
    // listing every catalogued French city (14 chars).
    FR: { pattern: /[éèêëàâîïôùûçœÉÈÊËÀÂÎÏÔÙÛÇŒ]/g, threshold: 25 },
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

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
};

function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&[a-z]+;/gi, (e) => HTML_ENTITIES[e.toLowerCase()] ?? e)
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
            String.fromCodePoint(parseInt(h, 16)),
        );
}

export function stripHtml(html: string): string {
    // Decode entities first so that doubly-encoded HTML (e.g. Greenhouse returns
    // "&lt;li&gt;" as literal text in the JSON) becomes real tags before the
    // stripping regexes run. A second decode pass at the end handles any
    // remaining entities in the text content itself (e.g. "&amp;" → "&").
    const decoded = decodeHtmlEntities(html);

    // Remove entire sections that are never part of the job description body.
    // These are stripped with their contents to prevent navigation/footer text
    // (often in the local language) from triggering the tinyld language detector
    // on otherwise English job ads. Script/style contents are removed for the
    // same reason — minified JS produces garbage chunks.
    const stripped = decoded.replace(
        /<(script|style|nav|footer)[^>]*>[\s\S]*?<\/\1>/gi,
        '',
    );
    // Convert block-level tags to newlines so paragraph structure survives for
    // tinyld chunk detection. Inline tags become spaces.
    return decodeHtmlEntities(
        stripped
            .replace(
                /<\/?(p|div|li|h[1-6]|br|section|article|blockquote|tr)[^>]*>/gi,
                '\n',
            )
            .replace(/<[^>]+>/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n[ \t]*/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim(),
    );
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
    `communicate in ${lang}`,
    `ability to communicate in ${lang}`,
    `preferably also ${lang}`,
    `${lang} speaking`,
];

/**
 * Regex that matches "mention + (is|would be|as) a(n) [optional adjectives] (advantage|plus|bonus|asset)".
 * Handles any intensifier adjective(s) between the article and the noun without enumerating them.
 * Examples: "is an advantage", "is a big plus", "would be a strong asset", "seen as a huge advantage".
 *
 * The bare language name (e.g. "dutch") gets zero gap words to avoid false positives where
 * the language word is used as a geographic adjective: "Dutch retail ecosystem is a strong advantage".
 * Compound mentions (e.g. "dutch language skills") are more specific and allow up to 6 gap words.
 */
function buildAdvantageRegex(lang: string): RegExp {
    const [bare, ...compound] = LANG_MENTIONS(lang).map((m) =>
        m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    // Optional modifier between operator and article: "considered", "considered as", "seen as",
    // or any single word (handles typos like "considerd" and extras like "also", "really").
    // The bare "considered(?: as)?" alternative handles ellipsis where "is" is dropped
    // entirely, e.g. "French or German considered a strong advantage".
    const operatorSuffix = `\\s+(?:(?:is|are|would be)(?:\\s+(?:seen\\s+as|\\w+(?:\\s+as)?))?|(?:seen\\s+)?as|considered(?:\\s+as)?)\\s+(?:(?:a|an)\\s+(?:\\w+\\s+){0,2}(?:advantage|asset|plus|bonus|merit|benefit)|advantageous|preferred)\\b`;
    // Gap words in the compound-mention branch must not cross over a DIFFERENT
    // language's name — otherwise "proficiency in Dutch and English (French is
    // considered an asset)" would let "proficiency in Dutch" reach across "and
    // English" to steal French's advantage phrase. Blocking every other known
    // language keyword (English included) makes the gap stop at the nearest
    // language boundary instead.
    const otherLangKeywords = [...ALL_LANG_KEYWORDS]
        .filter((kw) => kw !== lang)
        .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const gapWord = otherLangKeywords
        ? `(?:\\s+(?!(?:${otherLangKeywords})\\b)\\w+)`
        : `(?:\\s+\\w+)`;
    const parts = [
        `${bare}${operatorSuffix}`,
        // Compound mentions allow up to 8 gap words (e.g. "Finnish skills in both oral and written are seen as…")
        ...(compound.length > 0
            ? [`(?:${compound.join('|')})${gapWord}{0,8}${operatorSuffix}`]
            : []),
    ];
    return new RegExp(`(?:${parts.join('|')})`);
}

/**
 * Matches "{lang}[, lang2, ...] (or|and) [additional/another/other/similar] [adj] language[s]
 * followed by an advantage phrase" — e.g.:
 *   "German, French, or other European languages are a strong advantage"
 *   "German or additional European languages are a plus"
 *   "German or another European language considered a strong advantage"
 *   "Dutch and other European languages are highly valued"
 */
function buildLangOrGroupAdvantageRegex(lang: string): RegExp {
    const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const advantageOp =
        `(?:considered\\s+)?` +
        `(?:(?:is|are|would\\s+be)(?:\\s+(?:seen\\s+as|\\w+(?:\\s+as)?))?\\s+)?` +
        `(?:(?:a|an)\\s+)?(?:\\w+\\s+){0,2}(?:advantage|plus|asset|bonus|merit|benefit|valuable|valued|welcome|appreciated)\\b`;
    return new RegExp(
        `\\b${escaped}(?:\\s*,\\s*(?!(?:or|and)\\s)[a-z]+)*(?:\\s*,)?\\s+(?:or|and)\\s+(?:additional|another|other|similar)\\s+[a-z]+\\s+languages?\\s+${advantageOp}`,
        'i',
    );
}

/**
 * Matches "{lang}" when it appears in a comma/or-separated list of languages
 * followed by an advantage phrase — e.g.:
 *   "German, Italian, Danish, Swedish a bonus"   → German matches
 *   "German or Italian is a plus"                 → German matches
 *   "German, Italian a plus"                      → German matches
 * The language can appear at any position in the list. The advantage phrase
 * uses the same operator patterns as buildAdvantageRegex.
 */
function buildLangListAdvantageRegex(lang: string): RegExp {
    const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Tail: one or more comma/or-separated words after the language
    const listTail = `(?:\\s*[,]\\s*[a-z]+)*(?:\\s*,?\\s+or\\s+[a-z]+)?`;
    // Leading optional "considered " consumes ellipsis phrasing like "French or
    // German considered a strong advantage" without eating into the {0,2} gap-word
    // budget below (which alone can't span "considered a strong").
    const advantageSuffix =
        `\\s+(?:considered\\s+)?` +
        `(?:(?:is|are|would\\s+be)(?:\\s+(?:seen\\s+as|\\w+(?:\\s+as)?))?\\s+)?` +
        `(?:(?:a|an)\\s+)?(?:\\w+\\s+){0,2}(?:advantage|asset|plus|bonus|merit|benefit)\\b`;
    return new RegExp(`\\b${escaped}${listTail}${advantageSuffix}`, 'i');
}

function buildAdvantageSignals(lang: string): string[] {
    // Only modifiers that don't follow the "is a(n) [adj] advantage/plus/asset/bonus" pattern —
    // those are handled by buildAdvantageRegex above.
    const advantageModifiers = [
        ' is preferred',
        ' is desirable',
        ' are desirable',
        ' is highly desirable',
        ' are highly desirable',
        ' is nice to have',
        ' is beneficial',
        ' would be beneficial',
        ' is considered an additional qualification',
        ' is highly valuable',
        ' is preferable',
        ' are preferable',
        ' is of added value',
        ' are of added value',
        ' is of great added value',
        ' are of great added value',
        ' will be value addition',
        ' will be a value addition',
        ' is a benefit',
        ' would be a benefit',
    ];

    const signals: string[] = [];
    for (const mention of LANG_MENTIONS(lang)) {
        for (const modifier of advantageModifiers) {
            signals.push(`${mention}${modifier}`);
        }
    }

    signals.push(`as a plus in ${lang}`);
    signals.push(`as a plus: ${lang}`);
    signals.push(`nice to have: ${lang}`);
    signals.push(`nice to have ${lang}`);
    signals.push(`${lang} – nice to have`);
    signals.push(`preferably ${lang}`);
    signals.push(`preferably in ${lang}`);
    signals.push(`preferably also ${lang}`);
    signals.push(`preferably also in ${lang}`);
    signals.push(`${lang} preferred`);
    signals.push(`${lang} a plus`);
    signals.push(`${lang} a bonus`);
    signals.push(`ideally ${lang}`);
    signals.push(`ideally in ${lang}`);
    signals.push(`ideally including ${lang}`);
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
        `${lang} – mandatory`,
        `mandatory ${lang}`,
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
        `fluent in spoken ${lang}`,
        `fluent level in ${lang}`,
        `fluent language skills in ${lang}`,
        `fluency in ${lang}`,
        `proficiency in ${lang}`,
        `${lang} proficiency`,
        `proficient in ${lang}`,
        `${lang} proficient`,
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
        `${lang} at fluent level`,
        `excellent ${lang}`,
        `strong ${lang}`,
        `communicative ${lang}`,
        `${lang} communicative`,
        // CEFR level suffixes (parens are stripped: "German (C1 level)" → "german c1 level")
        `${lang} a1`,
        `${lang} a2`,
        `${lang} b1`,
        `${lang} b2`,
        `${lang} c1`,
        `${lang} c2`,
        // CEFR level-of-language: "at least a B2 level of German"
        `a1 level of ${lang}`,
        `a2 level of ${lang}`,
        `b1 level of ${lang}`,
        `b2 level of ${lang}`,
        `c1 level of ${lang}`,
        `c2 level of ${lang}`,
        // Generic level-of-language phrasing without a CEFR code: "a very good level of Dutch"
        `level of ${lang}`,
        // Level descriptors
        `elementary ${lang}`,
        `good ${lang}`,
        `very good ${lang}`,
        `good in ${lang}`,
        // Native / mother tongue
        `native level of ${lang}`,
        `native ${lang}`,
        `native in ${lang}`,
        `${lang} native`,
        `${lang}-native`,
        `native-${lang}`,
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
        `understand ${lang}`,
        `communicate in ${lang}`,
        `communicate fluently in ${lang}`,
        `${lang} communication skills`,
        `communication skills in ${lang}`,
        `${lang} language skills`,
        `${lang} skills`,
        `command of ${lang}`,
        `ability in ${lang}`,
        // Understanding / comprehension
        `understanding of ${lang}`,
        `understanding of the ${lang} language`,
        `good understanding of ${lang}`,
        `good understanding of the ${lang} language`,
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
        `both english and ${lang}`,
        `${lang} and english`,
        `english and ${lang}`,
        `english, and ${lang}`,
        `english as well as ${lang}`,
        `${lang} as well as english`,
        `english and also in ${lang}`,
        `in english and also in ${lang}`,
        `${lang} and also in english`,
        `in ${lang} and also in english`,
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
        // Prerequisite / mastery phrasing
        `mastering ${lang}`,
        `${lang} is a prerequisite`,
        `${lang} is prerequisite`,
        // Minimum level requirements — even basic knowledge means English alone isn't enough
        `basic ${lang}`,
        `basic in ${lang}`,
        `basic knowledge of ${lang}`,
        `basic level of ${lang}`,
        `some ${lang}`,
        // "at least {lang}" — e.g. "Fluent in English and at least French or Dutch"
        `at least ${lang}`,
        // "native speaker in/of {lang}" / "native speaker {lang}" — e.g. "A native
        // speaker in French or Dutch", "A native speaker of French or Dutch",
        // "A native speaker Dutch"
        `native speaker in ${lang}`,
        `native speaker of ${lang}`,
        `native speaker ${lang}`,
        // Confident communication
        `communicate confidently in ${lang}`,
        // Comma/semicolon-separated language lists: "English, {lang} and {other}",
        // "{lang}, English", "English; {lang} and {other}"
        `english, ${lang}`,
        `${lang}, english`,
        `english; ${lang}`,
        // "local language Swedish/Danish/Finnish" — umbrella phrasing in multi-country ads
        `local language ${lang}`,
        // "in addition to {lang}" — presupposes the language alongside English
        `in addition to ${lang}`,
        // "secondary language" / "second language" phrasing
        `${lang} as a secondary language`,
        `${lang} as a second language`,
        `${lang} as secondary language`,
        `${lang} as second language`,
        // "either X or Y as a secondary language" — lang appears before "or" in an either/or
        `either ${lang}`,
        // CEFR-style level descriptors
        `full professional proficiency in ${lang}`,
        `professional proficiency in ${lang}`,
        `full proficiency in ${lang}`,
        `conversational ${lang}`,
    ];
}

// Language-context words that legitimately follow "knowledge of {lang}".
// Any other word suggests the language is used as a geographic adjective
// (e.g. "knowledge of Dutch law") rather than a language requirement.
const KNOWLEDGE_OF_LANG_CONTEXT_RE =
    /^(?:is\b|are\b|was\b|were\b|would\b|will\b|required\b|needed\b|mandatory\b|essential\b|language\b|skills\b|proficiency\b|fluency\b|spoken\b|written\b|level\b|and\b|or\b)/;

function knowledgeOfSignalIsAdjective(
    combined: string,
    signal: string,
): boolean {
    if (!signal.startsWith('knowledge of ')) return false;
    const idx = combined.indexOf(signal);
    if (idx === -1) return false;
    const after = combined.slice(idx + signal.length).replace(/^[ \t]+/, '');
    if (!after || !/^[a-z]/.test(after)) return false; // punctuation/EOS → genuine signal
    return !KNOWLEDGE_OF_LANG_CONTEXT_RE.test(after);
}

// Negation patterns that immediately follow a requirement signal phrase
// (within ~80 characters), indicating the language is a nice-to-have.
// e.g. "fluent Dutch being a nice-to-have but certainly not compulsory"
// The negative lookahead on nice-to-have prevents section headings like
// "Nice-to-have Skills:" from being mistaken for a negation qualifier.
const REQUIREMENT_NEGATION_ADVANTAGE_RE =
    /\b(?:nice-?to-?have(?!\s+\w+\s*:|\s*:)|not\s+(?:compulsory|required|mandatory|essential|necessary|needed)|is\s+(?:optional|not\s+(?:required|mandatory|compulsory|essential))|not\s+a\s+(?:must|requirement)|considered\s+(?:as\s+)?(?:a|an)\s+(?:\w+\s+){0,2}(?:advantage|plus|asset|bonus|merit))\b/;

// Negation patterns indicating English alone is fully sufficient — not even an advantage signal.
// e.g. "fluent in German or English" → English is enough, German is not preferred
const REQUIREMENT_NEGATION_NONE_RE = /\bor\s+(?:in\s+)?english\b/;

// Advantage prefix patterns that immediately precede a requirement signal phrase
// (within ~80 characters), indicating the language is actually a nice-to-have.
// e.g. "bonus points if you speak German", "it is meritorious if you have Finnish skills"
//
// `IF_YOU` allows one filler verb between "you" and the language mention
// ("if you have/possess/hold Finnish skills") — without it, only phrasings
// where the signal itself is the verb ("if you speak German") would match.
//
// The trailing `[:.]?` tolerates a colon (a literal list intro, e.g. "meritorious
// if you have:") or a period — block-tag newlines from stripHtml are converted to
// ". " earlier (see the `combined` construction), so a cue phrase immediately
// followed by a bullet-list line break ("It is meritorious if you have\n• Finnish
// skills") would otherwise fail to match right at the sentence boundary.
const IF_YOU = 'if(?:\\s+you(?:\\s+\\w+)?)?';
const REQUIREMENT_ADVANTAGE_PREFIX_RE = new RegExp(
    `\\b(?:bonus\\s+points?\\s+${IF_YOU}|bonus\\s+${IF_YOU}|(?:it(?:'s|\\s+is)\\s+)?(?:a\\s+)?(?:big\\s+)?(?:plus|bonus|advantage|benefit|meritorious)\\s+${IF_YOU}|nice\\s+to\\s+have\\s+(?:${IF_YOU}\\s+)?|would\\s+be\\s+(?:great|nice|ideal|a\\s+plus|an\\s+advantage|a\\s+bonus|a\\s+benefit|meritorious)\\s+${IF_YOU})\\s*[:.]?\\s*$`,
);

// Alternation of every recognized language keyword, used below to let the advantage-cue
// check skip over an intervening list of other languages, e.g. "Swedish, Danish or
// Norwegian would be beneficial" — after matching the "Swedish" signal, the ", Danish or
// Norwegian" gap must be consumed before reaching "would be beneficial".
const LANG_KEYWORD_ALT_SRC = [...ALL_LANG_KEYWORDS]
    .map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
const ADVANTAGE_SUFFIX_LANG_LIST_GAP = `(?:\\s*,\\s*(?:${LANG_KEYWORD_ALT_SRC}))*(?:\\s*,?\\s+or\\s+(?:${LANG_KEYWORD_ALT_SRC}))?`;

// Advantage modifiers that appear DIRECTLY after a requirement signal, optionally past a
// trailing list of other languages (see ADVANTAGE_SUFFIX_LANG_LIST_GAP above). Anchored
// with ^ so we only match when the modifier immediately continues the signal (plus any
// language-list gap) — prevents "Fluent Finnish required. Swedish is preferred." from
// falsely downgrading the Finnish requirement (the 80-char window check would catch it
// otherwise), since "required." doesn't satisfy the gap or the cue alternation below.
// Covers: "is preferred/desirable/beneficial/welcome/nice to have", "would be beneficial",
// and the buildAdvantageRegex operator patterns (is/are/would be a(n) [adj] advantage/plus/etc.)
const DIRECT_ADVANTAGE_SUFFIX_RE = new RegExp(
    `^${ADVANTAGE_SUFFIX_LANG_LIST_GAP}\\s+(?:preferred\\b|(?:is|are)\\s+(?:preferred|preferable|desirable|beneficial|welcome|nice\\s+to\\s+have|considered\\s+an?\\s+additional\\s+qualification)|would\\s+be\\s+(?:preferred|preferable|desirable|beneficial|nice(?:\\s+to\\s+have)?)|(?:is|are|would\\s+be)(?:\\s+(?:seen\\s+as|\\w+(?:\\s+as)?))?\\s+(?:a|an)\\s+(?:\\w+\\s+){0,2}(?:advantage|asset|plus|bonus|merit|benefit)\\b|(?:is|are|would\\s+be)\\s+of\\s+(?:\\w+\\s+){0,2}added\\s+value\\b)\\b`,
);

type NegationKind = 'advantage' | 'none' | false;

/**
 * True when a different tracked language keyword (not `lang` itself) appears
 * anywhere in `text` before `beforeIdx` — meaning a nearby advantage phrase
 * more plausibly names that other language than `lang`. e.g. in "...Dutch and
 * English (French is considered an asset)", checking lang='dutch' against the
 * text up to the "is considered an asset" match finds "english" and "french"
 * in between, so the advantage phrase shouldn't be attributed to Dutch.
 */
function textNamesOtherLanguageBefore(
    text: string,
    lang: string,
    beforeIdx: number,
): boolean {
    const words = text.slice(0, beforeIdx).match(/[a-zà-öø-ÿ]+/g) ?? [];
    return words.some((w) => w !== lang && ALL_LANG_KEYWORDS.has(w));
}

/**
 * Returns the negation kind when a requirement-signal match is immediately
 * qualified by optional/negation language in the surrounding ~80 characters:
 * - 'advantage': language is a nice-to-have (e.g. "not compulsory", "nice-to-have")
 * - 'none': English alone is sufficient (e.g. "or English") — not even an advantage
 * - false: no negation found
 *
 * `lang` (when provided) is the language the signal was built for — used to avoid
 * attributing an advantage phrase that actually names a different language (see
 * textNamesOtherLanguageBefore above).
 */
function requirementNegatedByContext(
    combined: string,
    signal: string,
    lang?: string,
): NegationKind {
    const idx = combined.indexOf(signal);
    if (idx === -1) return false;
    const after = combined.slice(idx + signal.length, idx + signal.length + 80);
    // "or english" must appear in the same clause as the signal — stop at sentence
    // boundaries so that a later "speak either X or English" doesn't negate an
    // earlier "understand X and English" requirement.
    const sameClause = after.split(/[.;]\s|,?\s+and\s+can\s/)[0];
    if (REQUIREMENT_NEGATION_NONE_RE.test(sameClause)) return 'none';
    // Scoped to sameClause, not the full 80-char "after" window — otherwise an
    // unrelated advantage phrase in a later clause (e.g. "Fluent English and
    // Norwegian; Danish or Finnish considered as an advantage") would wrongly
    // negate the requirement in the earlier clause.
    const sameClauseAdvMatch =
        REQUIREMENT_NEGATION_ADVANTAGE_RE.exec(sameClause);
    if (
        sameClauseAdvMatch &&
        !(
            lang &&
            textNamesOtherLanguageBefore(
                sameClause,
                lang,
                sameClauseAdvMatch.index,
            )
        )
    ) {
        return 'advantage';
    }
    // Check for an advantage modifier that DIRECTLY follows the signal (anchored, no gap
    // words). Uses a tighter window than the 80-char checks above to avoid false negatives
    // where the modifier belongs to a later clause about a different language.
    // e.g. "proficiency in Norwegian is preferred" → 'advantage'
    // but NOT "Fluent Finnish required. Swedish is preferred." → no match here (falls through)
    if (DIRECT_ADVANTAGE_SUFFIX_RE.test(after)) return 'advantage';
    // Also check for advantage context in the ~80 characters *before* the signal,
    // e.g. "bonus points if you speak German" where "speak german" is the signal.
    const before = combined.slice(Math.max(0, idx - 80), idx);
    return REQUIREMENT_ADVANTAGE_PREFIX_RE.test(before) ? 'advantage' : false;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export type SignalEntry = {
    phase:
        | '1a'
        | '1b'
        | '1b-chars'
        | '1c'
        | '1c-any'
        | '2a'
        | '2a-nordic'
        | '2a-cross'
        | '2b'
        | '2c'
        | '2c-none'
        | '2d-none';
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

// Some sources (e.g. Capgemini's description_stripped field) provide the job
// description as one giant blob with no paragraph breaks at all, so the \n-based
// splitting below collapses to a single oversized chunk. tinyld's n-gram frequency
// detection becomes unreliable past a few thousand characters — a single confusing
// span (heavy English tech jargon mixed into otherwise-native text) can pull the
// whole-text verdict to a wrong language even though every sub-window resolves
// correctly on its own. Any chunk over this length is broken into fixed-size
// windows before detection so one bad span can't drown out the rest.
const MAX_DETECTION_CHUNK_LENGTH = 1500;
const DETECTION_WINDOW_SIZE = 500;

function windowOversizedChunk(chunk: string): string[] {
    if (chunk.length <= MAX_DETECTION_CHUNK_LENGTH) return [chunk];
    const windows: string[] = [];
    for (let i = 0; i < chunk.length; i += DETECTION_WINDOW_SIZE) {
        const window = chunk.slice(i, i + DETECTION_WINDOW_SIZE).trim();
        if (window.length >= 200) windows.push(window);
    }
    return windows.length > 0 ? windows : [chunk];
}

/**
 * Detects the language of `chunk`, using majority vote across its windows when
 * it was split by windowOversizedChunk. A 500-char window is short enough that
 * tinyld regularly misfires on ONE window even for genuinely English text (e.g.
 * a single window scored "de" out of nine otherwise-"en" windows for a real
 * English Capgemini ad) — accepting any single matching window turns that per-
 * window noise into a wrong verdict for the whole (long) description. Requiring
 * a strict majority means a lone noisy window can't flip it, while a
 * genuinely native-language description still wins comfortably (e.g. 8 "nl" vs
 * 3 "ber" out of 11 windows in a real Dutch ad).
 */
function detectChunkLanguage(chunk: string): string {
    const windows = windowOversizedChunk(chunk);
    if (windows.length <= 1) return detect(chunk);
    const counts = new Map<string, number>();
    for (const window of windows) {
        const code = detect(window);
        counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    let winner = '';
    let winnerCount = 0;
    for (const [code, count] of counts) {
        if (count > winnerCount) {
            winner = code;
            winnerCount = count;
        }
    }
    return winnerCount > windows.length / 2 ? winner : '';
}

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
    const chunks = text
        .split(/\n+/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 200);
    const candidates = chunks.length > 0 ? chunks : [text.trim()];
    const nativeCharEntry = countryCode
        ? COUNTRY_NATIVE_CHARS[countryCode]
        : undefined;
    for (const chunk of candidates) {
        const code = detectChunkLanguage(chunk);
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

// Derived from COUNTRY_LANG_CODES — only these codes are trusted for cross-language detection.
const TRUSTED_LANG_CODES = new Set(Object.values(COUNTRY_LANG_CODES).flat());

// English boilerplate suffixes that appear at the end of job descriptions regardless of
// the job's actual language (e.g. company equal-opportunity statements). Everything from
// the first match onwards is stripped before language classification so these English
// paragraphs don't dilute the native-language signal.
const DESCRIPTION_BOILERPLATE_MARKERS = [
    'At KONE, we are focused on creating an innovative and collaborative working culture',
];

function stripDescriptionBoilerplate(text: string): string {
    const lower = text.toLowerCase();
    for (const marker of DESCRIPTION_BOILERPLATE_MARKERS) {
        const idx = lower.indexOf(marker.toLowerCase());
        if (idx !== -1) return text.slice(0, idx).trimEnd();
    }
    return text;
}

// Languages where tinyld is prone to false positives on corporate English text.
// Require a longer chunk before accepting a match.
const MEDIUM_CONFIDENCE_LANGS = new Set([
    'fr',
    'es',
    'it',
    'pt',
    'ro',
    'el',
    'nl',
    'de',
    'cs',
    'sk',
    'pl',
    'hr',
    'sl',
    'hu',
    'no',
]);
const MEDIUM_CONFIDENCE_MIN_CHUNK = 400;

// Languages that use a non-Latin script: require at least one native-script
// character in the chunk before trusting tinyld. English text can never
// legitimately be Greek, Arabic, Hebrew, etc., so zero native chars = false positive.
const SCRIPT_GATED_LANGS: Partial<Record<string, RegExp>> = {
    el: /[\u0370-\u03FF\u1F00-\u1FFF]/, // Greek
};

/**
 * Checks whether any chunk of the text is detected as a non-English language
 * by tinyld. Used as a fallback when the description is written in a language
 * that doesn't match the job's country (e.g. Swedish description on a Finland
 * posting, or German on a Netherlands job). Only considers chunks ≥ 200 chars
 * to keep false-positive risk low.
 */
function findAnyNonEnglishChunk(
    text: string,
): { chunk: string; detectedCode: string } | null {
    const chunks = text
        .split(/\n+/)
        .map((c) => c.trim())
        .filter((c) => c.length >= 200);
    const candidates =
        chunks.length > 0
            ? chunks
            : text.trim().length >= 200
              ? [text.trim()]
              : [];
    for (const chunk of candidates) {
        const code = detectChunkLanguage(chunk);
        if (!code || code.length !== 2 || code === 'en') continue;
        if (!TRUSTED_LANG_CODES.has(code)) continue;
        if (
            MEDIUM_CONFIDENCE_LANGS.has(code) &&
            chunk.length < MEDIUM_CONFIDENCE_MIN_CHUNK
        )
            continue;
        const scriptGate = SCRIPT_GATED_LANGS[code];
        if (scriptGate && !scriptGate.test(chunk)) continue;
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
        const keyword = nonAsciiChar ? undefined : KEYWORDS_RE.exec(title)?.[0];
        return {
            value: true,
            local_language_advantage: false,
            requiredLanguages: langNames,
            preferredLanguages: [],
            signals: [
                {
                    phase: '1a',
                    description: nonAsciiChar
                        ? 'non-ASCII title'
                        : 'local-language keyword in title',
                    matched: nonAsciiChar ?? keyword,
                },
            ],
        };
    }

    const descText = stripDescriptionBoilerplate(descriptionText ?? '');
    // Flatten whitespace (including newlines from stripHtml block-tag conversion)
    // so signal phrases aren't broken by HTML structure. tinyld uses descText
    // directly and still gets the original paragraph breaks.
    // Also normalize parentheses (strip them while keeping content) so that
    // "English (and Dutch)" becomes "English and Dutch", and normalize "&" to
    // "and" so "English & Swedish" matches the same signals as "English and Swedish".
    const combined = `${title} ${descText}`
        .toLowerCase()
        .replace(/[()]/g, ' ')
        .replace(/[–—]/g, ' – ')
        .replace(/&/g, 'and')
        .replace(/\s\+\s/g, ' and ')
        // Normalise "and/or" to "/" so the slash expansion below handles it:
        // "Finnish and/or Swedish skills" → "Finnish/Swedish skills" → "Finnish skills Swedish skills"
        .replace(/\s*\band\/or\b\s*/g, '/')
        // Expand slash-separated language alternatives so that per-language signal
        // phrases match each option independently — but only when the slash group is
        // followed by a language-context word (speaking, skills, etc.) to avoid
        // expanding unrelated slash patterns (e.g. "ruby/python skills").
        // "norwegian/swedish/danish speaking" → "norwegian speaking swedish speaking danish speaking"
        // "norwegian/swedish/danish language skills" → "norwegian language skills swedish language skills danish language skills"
        .replace(
            /([a-z]+)((?:\/[a-z]+)+)(\s+(?:speaking|speaker|languages?|skills|knowledge|proficiency|fluency|required|native|communication)(?:\s+[a-z]+)?)/g,
            (_, first, rest, suffix) => {
                const parts = [first, ...rest.slice(1).split('/')];
                return parts.map((p) => p + suffix).join(' ');
            },
        )
        // Treat line breaks (paragraph/list-item boundaries from stripHtml's block-tag
        // conversion) as sentence boundaries — otherwise requirementNegatedByContext's
        // "same clause" window can't tell "Norwegian" apart from an advantage phrase in
        // the next paragraph when there's no punctuation between them (e.g. "Fluent in
        // English and Norwegian\n\nDanish or Finnish considered as an advantage").
        .replace(/\n+/g, '. ')
        .replace(/\s+/g, ' ');

    // For multi-language countries (CH, BE, LU) a requirement signal for one
    // language (e.g. French) must win over an advantage signal for another
    // language (e.g. German) found earlier in COUNTRY_LANGUAGE_MAP's iteration
    // order — otherwise "Very good French skills; German is an advantage" would
    // short-circuit on German's advantage phrase before French's requirement is
    // ever checked. This mirrors the exact acceptance logic Phase 2a's per-lang
    // loop uses to decide a genuine (non-negated) requirement match.
    const languageHasGenuineRequirement = (lang: string): boolean => {
        const langAdvRegex = buildAdvantageRegex(lang);
        for (const signal of buildRequirementSignals(lang)) {
            if (!combined.includes(signal)) continue;
            if (knowledgeOfSignalIsAdjective(combined, signal)) continue;
            const negation = requirementNegatedByContext(
                combined,
                signal,
                lang,
            );
            if (negation === 'none' || negation === 'advantage') continue;
            const sigIdx = combined.indexOf(signal);
            const advOverlap = langAdvRegex.exec(combined);
            if (
                advOverlap &&
                advOverlap.index <= sigIdx &&
                advOverlap.index + advOverlap[0].length >=
                    sigIdx + signal.length
            )
                continue;
            return true;
        }
        return false;
    };
    // Also true when a DIFFERENT tracked language (not one of the country's own)
    // is genuinely required — e.g. "Fluent German and English skills, and Finnish
    // language skills are an advantage" on a Finland job. Without this, Phase 1b/2a
    // would short-circuit on Finnish's own (negated-to-advantage) mention before
    // Phase 2a-cross ever gets a chance to flag German as the real requirement.
    const anyGenuineRequirement =
        languages.some(languageHasGenuineRequirement) ||
        Object.keys(KEYWORD_TO_CANONICAL_NAME).some(
            (kw) =>
                !languages.includes(kw) && languageHasGenuineRequirement(kw),
        );

    // ── Phase 1b: Advantage-signal pre-filter (before tinyld) ───────────────
    // Check for explicit "X is a plus / an advantage" phrases before running
    // tinyld. See the JSDoc above for why this ordering matters.
    for (const lang of languages) {
        const hasRequirement = anyGenuineRequirement;

        for (const signal of buildAdvantageSignals(lang)) {
            if (combined.includes(signal)) {
                if (hasRequirement) break; // a country language is genuinely required — fall through to phase 2a
                return {
                    value: false,
                    local_language_advantage: true,
                    requiredLanguages: [],
                    preferredLanguages: langNames,
                    signals: [
                        {
                            phase: '1b',
                            description: 'advantage phrase pre-filter',
                            matched: signal,
                        },
                    ],
                };
            }
        }

        const advMatch = buildAdvantageRegex(lang).exec(combined);
        if (advMatch) {
            if (!hasRequirement) {
                return {
                    value: false,
                    local_language_advantage: true,
                    requiredLanguages: [],
                    preferredLanguages: langNames,
                    signals: [
                        {
                            phase: '1b',
                            description: 'advantage phrase pre-filter',
                            matched: advMatch[0],
                        },
                    ],
                };
            }
        }

        // "{lang}, {lang2}, ... a bonus" / "{lang} or {lang2} is a plus"
        const langListAdvMatch =
            buildLangListAdvantageRegex(lang).exec(combined);
        if (langListAdvMatch && !hasRequirement) {
            return {
                value: false,
                local_language_advantage: true,
                requiredLanguages: [],
                preferredLanguages: langNames,
                signals: [
                    {
                        phase: '1b',
                        description: 'advantage phrase pre-filter',
                        matched: langListAdvMatch[0],
                    },
                ],
            };
        }

        // "{lang}[, lang2] or [additional/another/other] [group] languages are a plus/advantage"
        const langGroupAdvMatch =
            buildLangOrGroupAdvantageRegex(lang).exec(combined);
        if (langGroupAdvMatch && !hasRequirement) {
            return {
                value: false,
                local_language_advantage: true,
                requiredLanguages: [],
                preferredLanguages: langNames,
                signals: [
                    {
                        phase: '1b',
                        description: 'advantage phrase pre-filter',
                        matched: langGroupAdvMatch[0],
                    },
                ],
            };
        }
    }

    // Group-language advantage phrases (e.g. "fluent in a Nordic language").
    if (NORDIC_COUNTRY_CODES.has(cc)) {
        for (const phrase of NORDIC_LANGUAGE_ADVANTAGE_PHRASES) {
            if (combined.includes(phrase)) {
                return {
                    value: false,
                    local_language_advantage: true,
                    requiredLanguages: [],
                    preferredLanguages: langNames,
                    signals: [
                        {
                            phase: '1b',
                            description: 'Nordic/Scandinavian advantage phrase',
                            matched: phrase,
                        },
                    ],
                };
            }
        }
    }
    if (BALTIC_COUNTRY_CODES.has(cc)) {
        for (const phrase of BALTIC_LANGUAGE_ADVANTAGE_PHRASES) {
            if (combined.includes(phrase)) {
                return {
                    value: false,
                    local_language_advantage: true,
                    requiredLanguages: [],
                    preferredLanguages: langNames,
                    signals: [
                        {
                            phase: '1b',
                            description: 'Baltic advantage phrase',
                            matched: phrase,
                        },
                    ],
                };
            }
        }
    }
    // "{Language} or other Nordic/Scandinavian/Baltic languages are a plus"
    // "Knowledge of Nordic or Baltic languages is an advantage"
    if (NORDIC_COUNTRY_CODES.has(cc) || BALTIC_COUNTRY_CODES.has(cc)) {
        const LANG_GROUP_RE = /(?:nordic|scandinavian|baltic)/;
        const ADVANTAGE_SUFFIX_RE =
            /(?:(?:is|are|would\s+be)(?:\s+(?:considered|seen\s+as))?\s+)?(?:a(?:n)?\s+)?(?:advantage|plus|bonus|asset|benefit)\b/;
        const nordicOrOtherMatch = combined.match(
            new RegExp(
                `\\b\\w+\\s+or\\s+other\\s+${LANG_GROUP_RE.source}\\s+languages?\\s+${ADVANTAGE_SUFFIX_RE.source}`,
            ),
        );
        const nordicGroupMatch =
            !nordicOrOtherMatch &&
            combined.match(
                new RegExp(
                    `knowledge\\s+of\\s+(?:\\w+\\s+or\\s+)?${LANG_GROUP_RE.source}\\s+languages?\\s+${ADVANTAGE_SUFFIX_RE.source}`,
                ),
            );
        const nordicAdvMatch = nordicOrOtherMatch ?? nordicGroupMatch;
        if (nordicAdvMatch) {
            return {
                value: false,
                local_language_advantage: true,
                requiredLanguages: [],
                preferredLanguages: langNames,
                signals: [
                    {
                        phase: '1b',
                        description: 'Nordic/Scandinavian advantage phrase',
                        matched: nordicAdvMatch[0],
                    },
                ],
            };
        }
    }

    // Generic "local language is a plus/advantage" — doesn't name the specific language
    // but signals it is a nice-to-have (e.g. "local language is a plus i.e. French, Dutch").
    if (languages.length > 0) {
        const genericAdvantageMatch = combined.match(
            /\b(?:a\s+)?local language[^.]{0,80}(?:is|are|would\s+be)\s+(?:a\s+)?(?:plus|bonus|advantage|preferred|beneficial|preferable|an?\s+asset)\b/,
        );
        if (genericAdvantageMatch) {
            return {
                value: false,
                local_language_advantage: true,
                requiredLanguages: [],
                preferredLanguages: langNames,
                signals: [
                    {
                        phase: '1b',
                        description: 'generic local-language advantage phrase',
                        matched: genericAdvantageMatch[0],
                    },
                ],
            };
        }

        // Generic "additional/other EU/European/local/regional languages is a plus" —
        // same idea, but phrased as "additional languages" rather than "local language"
        // (e.g. "knowledge of additional EU languages is a plus").
        const genericAdditionalLangMatch = combined.match(
            /\b(?:knowledge of\s+)?(?:additional|other)\s+(?:eu|european|local|regional)\s+languages?[^.]{0,40}(?:is|are|would\s+be)\s+(?:a\s+)?(?:plus|bonus|advantage|preferred|beneficial|preferable|an?\s+asset)\b/,
        );
        if (genericAdditionalLangMatch) {
            return {
                value: false,
                local_language_advantage: true,
                requiredLanguages: [],
                preferredLanguages: langNames,
                signals: [
                    {
                        phase: '1b',
                        description:
                            'generic "additional languages" advantage phrase',
                        matched: genericAdditionalLangMatch[0],
                    },
                ],
            };
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
                value: true,
                local_language_advantage: false,
                requiredLanguages: langNames,
                preferredLanguages: [],
                signals: [
                    {
                        phase: '1b-chars',
                        description: `${charMatch.count} native chars in description`,
                        matched: charMatch.sample,
                    },
                ],
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
            value: true,
            local_language_advantage: false,
            requiredLanguages: langNames,
            preferredLanguages: [],
            signals: [
                {
                    phase: '1c',
                    description: `tinyld detected "${nativeChunk.detectedCode}" in description`,
                    matched:
                        nativeChunk.chunk.slice(0, 80) +
                        (nativeChunk.chunk.length > 80 ? '…' : ''),
                },
            ],
        };
    }

    // ── Phase 1c-any: non-English language in description (cross-language) ───
    // Catches descriptions written in a language other than the country's own —
    // e.g. a Swedish-language job ad classified under Finland. tinyld detects
    // "sv" but COUNTRY_LANG_CODES['FI'] = ['fi'], so Phase 1c above misses it.
    // Any non-English description requires that language → flag accordingly.
    const nonEnglishChunk = findAnyNonEnglishChunk(descText);
    if (nonEnglishChunk) {
        // Map the detected code to a canonical language name if known.
        const detectedName = Object.entries(COUNTRY_LANG_CODES).find(
            ([, codes]) => codes.includes(nonEnglishChunk.detectedCode),
        );
        const requiredLanguages = detectedName
            ? (COUNTRY_LANGUAGE_NAMES[detectedName[0]] ?? langNames)
            : langNames;
        return {
            value: true,
            local_language_advantage: false,
            requiredLanguages,
            preferredLanguages: [],
            signals: [
                {
                    phase: '1c-any',
                    description: `tinyld detected non-English language "${nonEnglishChunk.detectedCode}" in description`,
                    matched:
                        nonEnglishChunk.chunk.slice(0, 80) +
                        (nonEnglishChunk.chunk.length > 80 ? '…' : ''),
                },
            ],
        };
    }

    // ── Phase 2a: Explicit language requirement signals ──────────────────────
    // The description is in English — scan for phrases that explicitly require
    // the local language (e.g. "fluent Finnish", "working language is German").

    // Generic "native local/country language" phrase — doesn't name the language
    // but clearly means native fluency in the local language is required.
    const genericMatch =
        languages.length > 0
            ? combined.match(
                  /native (?:local country|local|country|regional) language|local language (?:is |are )?required|local language skills|fluent in (?:the )?local language|local language:\s*(?:fluent|native|business level|proficient|good)|in addition to the local language/,
              )
            : null;
    if (genericMatch) {
        return {
            value: true,
            local_language_advantage: false,
            requiredLanguages: langNames,
            preferredLanguages: [],
            signals: [
                {
                    phase: '2a',
                    description: 'generic native language phrase',
                    matched: genericMatch[0],
                },
            ],
        };
    }

    // "your local language (LANG)" — parens are already stripped from combined,
    // so "(Lithuanian)" becomes "lithuanian". Capture the first word after the phrase.
    const localLangParenMatch = combined.match(/your local language\s+(\w+)/);
    if (localLangParenMatch) {
        const canonicalName = KEYWORD_TO_CANONICAL_NAME[localLangParenMatch[1]];
        if (canonicalName) {
            return {
                value: true,
                local_language_advantage: false,
                requiredLanguages: [canonicalName],
                preferredLanguages: [],
                signals: [
                    {
                        phase: '2a',
                        description: 'local language parenthetical phrase',
                        matched: localLangParenMatch[0],
                    },
                ],
            };
        }
    }

    if (NORDIC_COUNTRY_CODES.has(cc)) {
        for (const phrase of NORDIC_LANGUAGE_REQUIREMENT_PHRASES) {
            if (combined.includes(phrase)) {
                return {
                    value: true,
                    local_language_advantage: false,
                    requiredLanguages: langNames,
                    preferredLanguages: [],
                    signals: [
                        {
                            phase: '2a-nordic',
                            description:
                                'Nordic/Scandinavian requirement phrase',
                            matched: phrase,
                        },
                    ],
                };
            }
        }
    }

    if (BALTIC_COUNTRY_CODES.has(cc)) {
        for (const phrase of BALTIC_LANGUAGE_REQUIREMENT_PHRASES) {
            if (combined.includes(phrase)) {
                return {
                    value: true,
                    local_language_advantage: false,
                    requiredLanguages: langNames,
                    preferredLanguages: [],
                    signals: [
                        {
                            phase: '2a-nordic',
                            description: 'Baltic requirement phrase',
                            matched: phrase,
                        },
                    ],
                };
            }
        }
    }

    // "{Lang1}, {Lang2}, and {Lang3}: [preamble] proficiency is required for all
    // N languages" — an explicit enumeration where every listed language is
    // mandated, not just one. This doesn't fit the single-language requirement
    // templates above (there's no "advantage"/"required" attached to any one
    // language name directly), so it's handled as its own signal: extract the
    // listed languages via KEYWORD_TO_CANONICAL_NAME and flag as required
    // whenever any of them is not English — regardless of whether it happens to
    // be this country's own language. A posting can legitimately require a
    // language that has nothing to do with where the job is based (e.g. this
    // exact phrase turning up on a job in a country other than NL/BE/FR), and
    // the actual required language(s) still need to be recorded, not just the
    // country's default. e.g. "Dutch, French, and English: Professional working
    // proficiency is required for all three languages."
    {
        const ALL_LANGUAGES_REQUIRED_RE =
            /\b((?:[a-zà-öø-ÿ]+(?:,\s*[a-zà-öø-ÿ]+)*,?\s+and\s+[a-zà-öø-ÿ]+)):\s*[a-zà-öø-ÿ ]*?(?:proficiency|fluency)\s+is\s+required\s+for\s+all\s+(?:two|three|four|five|the)\s+languages\b/;
        const allLangsMatch = combined.match(ALL_LANGUAGES_REQUIRED_RE);
        if (allLangsMatch) {
            const listedWords = allLangsMatch[1]
                .split(/,|\band\b/)
                .map((w) => w.trim())
                .filter(Boolean);
            const requiredNames = [
                ...new Set(
                    listedWords
                        .filter((w) => w !== 'english')
                        .map((w) => KEYWORD_TO_CANONICAL_NAME[w])
                        .filter((n): n is string => Boolean(n)),
                ),
            ];
            if (requiredNames.length > 0) {
                return {
                    value: true,
                    local_language_advantage: false,
                    requiredLanguages: requiredNames,
                    preferredLanguages: [],
                    signals: [
                        {
                            phase: '2a',
                            description:
                                'enumerated "required for all N languages" phrase',
                            matched: allLangsMatch[0],
                        },
                    ],
                };
            }
        }
    }

    for (const lang of languages) {
        const langAdvRegex = buildAdvantageRegex(lang);
        for (const signal of buildRequirementSignals(lang)) {
            if (combined.includes(signal)) {
                if (knowledgeOfSignalIsAdjective(combined, signal)) continue;
                const negation = requirementNegatedByContext(
                    combined,
                    signal,
                    lang,
                );
                if (negation === 'none') continue;
                if (negation === 'advantage') {
                    // Only treat this as the final verdict if no OTHER country language is
                    // genuinely required elsewhere in the text — otherwise a multi-language
                    // country (CH, BE, LU) would wrongly resolve to "advantage" based on
                    // this language's negated signal before the genuine requirement (found
                    // later in loop order) is ever reached. See languageHasGenuineRequirement.
                    if (!anyGenuineRequirement) {
                        return {
                            value: false,
                            local_language_advantage: true,
                            requiredLanguages: [],
                            preferredLanguages: langNames,
                            signals: [
                                {
                                    phase: '2a',
                                    description: `"${lang}" requirement phrase negated by context`,
                                    matched: signal,
                                },
                            ],
                        };
                    }
                    continue;
                }
                // If the advantage regex fully contains the requirement signal's match position,
                // the requirement phrase is part of a larger advantage phrase (e.g. "dutch speaking
                // skills on top of that are preferred") — the advantage wins.
                const sigIdx = combined.indexOf(signal);
                const advOverlap = langAdvRegex.exec(combined);
                if (
                    advOverlap &&
                    advOverlap.index <= sigIdx &&
                    advOverlap.index + advOverlap[0].length >=
                        sigIdx + signal.length
                ) {
                    if (!anyGenuineRequirement) {
                        return {
                            value: false,
                            local_language_advantage: true,
                            requiredLanguages: [],
                            preferredLanguages: langNames,
                            signals: [
                                {
                                    phase: '2a',
                                    description: `"${lang}" requirement phrase contained in advantage phrase`,
                                    matched: advOverlap[0],
                                },
                            ],
                        };
                    }
                    continue;
                }
                return {
                    value: true,
                    local_language_advantage: false,
                    requiredLanguages: langNames,
                    preferredLanguages: [],
                    signals: [
                        {
                            phase: '2a',
                            description: `"${lang}" requirement phrase`,
                            matched: signal,
                        },
                    ],
                };
            }
        }
    }

    // "in addition to {other language} or {lang}" — the country's own language appears
    // as a later item in an "in addition to X or Y" list, so the direct
    // `in addition to ${lang}` signal above (which only matches when {lang} immediately
    // follows the phrase) misses it and it would otherwise fall through to Phase 2a-cross,
    // misattributing the requirement to whichever language came first in the list.
    for (const lang of languages) {
        const escaped = lang.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const orListMatch = combined.match(
            new RegExp(
                `in addition to (?:[a-z]+(?:,\\s*[a-z]+)*\\s+or\\s+)+${escaped}\\b`,
            ),
        );
        if (orListMatch) {
            return {
                value: true,
                local_language_advantage: false,
                requiredLanguages: langNames,
                preferredLanguages: [],
                signals: [
                    {
                        phase: '2a',
                        description: `"${lang}" in "in addition to X or Y" list`,
                        matched: orListMatch[0],
                    },
                ],
            };
        }
    }

    // ── Phase 2a-cross: Cross-language scan ─────────────────────────────────
    // Checks requirement and advantage signals for every tracked language,
    // not just the country's own. Catches cases like "fluent Norwegian required"
    // on a job located in Latvia. Runs after country-specific phases to keep
    // those as the authoritative signal when the country language does match.
    {
        const countryKeywordSet = new Set(languages);
        for (const [kw, canonicalName] of Object.entries(
            KEYWORD_TO_CANONICAL_NAME,
        )) {
            if (countryKeywordSet.has(kw)) continue; // already covered by Phase 2a
            // Collect any advantage match first, but only commit to it after confirming
            // no requirement signal also fires. A requirement always wins over an advantage
            // (e.g. "excellent written and spoken Dutch" + "additional languages is an asset"
            // should flag Dutch as required, not as a nice-to-have).
            let foundAdvantage: string | null = null;
            const advMatch = buildAdvantageRegex(kw).exec(combined);
            if (advMatch) foundAdvantage = advMatch[0];
            if (!foundAdvantage) {
                for (const signal of buildAdvantageSignals(kw)) {
                    if (combined.includes(signal)) {
                        foundAdvantage = signal;
                        break;
                    }
                }
            }
            for (const signal of buildRequirementSignals(kw)) {
                if (combined.includes(signal)) {
                    if (knowledgeOfSignalIsAdjective(combined, signal))
                        continue;
                    const negation = requirementNegatedByContext(
                        combined,
                        signal,
                        kw,
                    );
                    if (negation === 'none') continue;
                    if (negation === 'advantage') {
                        return {
                            value: false,
                            local_language_advantage: true,
                            requiredLanguages: [],
                            preferredLanguages: [canonicalName],
                            signals: [
                                {
                                    phase: '2a-cross',
                                    description: `cross-language requirement negated by context: ${canonicalName}`,
                                    matched: signal,
                                },
                            ],
                        };
                    }
                    return {
                        value: true,
                        local_language_advantage: false,
                        requiredLanguages: [canonicalName],
                        preferredLanguages: [],
                        signals: [
                            {
                                phase: '2a-cross',
                                description: `cross-language requirement: ${canonicalName}`,
                                matched: signal,
                            },
                        ],
                    };
                }
            }
            if (!foundAdvantage) {
                const listAdvMatch =
                    buildLangListAdvantageRegex(kw).exec(combined);
                if (listAdvMatch) foundAdvantage = listAdvMatch[0];
            }
            if (!foundAdvantage) {
                const groupAdvMatch =
                    buildLangOrGroupAdvantageRegex(kw).exec(combined);
                if (groupAdvMatch) foundAdvantage = groupAdvMatch[0];
            }
            if (foundAdvantage) {
                return {
                    value: false,
                    local_language_advantage: true,
                    requiredLanguages: [],
                    preferredLanguages: [canonicalName],
                    signals: [
                        {
                            phase: '2a-cross',
                            description: `cross-language advantage: ${canonicalName}`,
                            matched: foundAdvantage,
                        },
                    ],
                };
            }
        }
    }

    // ── Phase 2b: "depending on location" conditional requirement ───────────
    // e.g. "Fluent English and, depending on the location, Finnish, Swedish or Lithuanian."
    // Requires the language to appear within 150 characters of the trigger phrase
    // to avoid spurious matches when the language is mentioned elsewhere in the text.
    {
        const LOC_WINDOW = 60;
        const triggerRe = /depending on (?:the |your )?location/gi;
        let triggerMatch: RegExpExecArray | null;

        while ((triggerMatch = triggerRe.exec(combined)) !== null) {
            const start = Math.max(0, triggerMatch.index - LOC_WINDOW);
            const end = Math.min(
                combined.length,
                triggerMatch.index + triggerMatch[0].length + LOC_WINDOW,
            );
            const window = combined.slice(start, end);

            for (const lang of languages) {
                if (window.includes(lang)) {
                    return {
                        value: true,
                        local_language_advantage: false,
                        requiredLanguages: langNames,
                        preferredLanguages: [],
                        signals: [
                            {
                                phase: '2b',
                                description: 'location-conditional requirement',
                                matched: `depending on location + ${lang}`,
                            },
                        ],
                    };
                }
            }
        }
    }
    // ── Phase 2c default ─────────────────────────────────────────────────────
    // No explicit signals found — absence of any local language requirement is
    // itself a strong signal that English is sufficient.
    return {
        value: false,
        local_language_advantage: false,
        requiredLanguages: [],
        preferredLanguages: [],
        signals: [
            { phase: '2c-none', description: 'no signal — English assumed' },
        ],
    };
}
