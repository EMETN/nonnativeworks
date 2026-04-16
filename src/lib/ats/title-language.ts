/**
 * Shared utility for detecting non-English job titles.
 * Used by fetchers to skip description enrichment for titles that already
 * signal a local-language requirement.
 *
 * HOW TO ADD KEYWORDS
 * ───────────────────
 * Only add words that are unambiguous — i.e. they would never appear in an
 * English job title. Avoid words shared with English (e.g. "chef", "director")
 * or other languages (e.g. "koordinator" exists in many languages).
 * Words containing non-ASCII characters (ä, ö, å, …) are already caught by
 * the regex check and don't need to be listed here, but may be included for
 * documentation purposes.
 * Mirror any changes in scraper/main.py (_TITLE_KEYWORDS_BY_LANG).
 */

// ── Finnish ──────────────────────────────────────────────────────────────────
const FI: string[] = [
  'ammattitaitoinen', // skilled
  'ammattitaitoisia', // skilled (plural)
  'asiakas',        // customer
  'asennus',        // installation
  'asentaja',       // installer
  'asentajia',      // installers
  'asiantuntija',   // specialist / expert
  'hankinta',       // procurement
  'hitsaaja',       // welder
  'hoitaja',
  'hakemus',        // application (open application postings)
  'hovimestari',    // headwaiter
  'huolto',         // maintenance
  'johtaja',        // manager
  'kehitys',        // development
  'kokki',          // chef
  'kokoonpanija',    // assembler
  'koneistaja',     // machinist
  'konsultti',      // consultant
  'koordinaattori', // coordinator
  'kuljettaja',     // driver
  'liiketoiminta',  // business
  'mekaanikko',     // mechanic
  'myynti',         // sales
  'osaaja',         // specialist / expert
  'palvelu',        // service
  'rakennus',       // building
  'rakentaja',      // builder
  'ravintola',      // restaurant
  'rekrytointi',    // recruitment
  'suunnittelija',  // designer / planner
  'tarjoilija',     // waiter
  'testaaja',       // tester
  'tiimi',          // team
  'timpuri',        // carpenter
  'tuotanto',       // production
  'tuotannon',
  'varasto',        // warehouse
  'vastaanotto',    // reception / front desk
  'vuoromestari',   // shift supervisor
];

// ── Swedish ───────────────────────────────────────────────────────────────────
const SE: string[] = [
  'ansvarig',       // responsible / manager
  'ekonom',         // economist
  'förvaltare',     // administrator / manager
  'handläggare',    // administrator / officer
  'rådgivare',      // advisor
  'samordnare',     // coordinator
  'säljare',        // salesperson
  'utvecklare',     // developer
  'verksamhet',     // operations / business
];

// ── Norwegian ─────────────────────────────────────────────────────────────────
const NO: string[] = [
  'avdelingsleder', // department manager
  'fagansvarlig',   // subject-matter responsible
  'koordinator',    // coordinator (unambiguous in NO context when combined with NO chars)
  'rådgiver',       // advisor
  'saksbehandler',  // case officer
  'selger',         // salesperson
  'utvikler',       // developer
];

// ── Danish ───────────────────────────────────────────────────────────────────
const DK: string[] = [
  'afdelingsleder', // department manager
  'rådgiver',       // advisor
  'sagsbehandler',  // case officer
  'sælger',         // salesperson
  'udvikler',       // developer
];

// ── German ───────────────────────────────────────────────────────────────────
const DE: string[] = [
  'ausbilder',      // instructor, trainer
  'ausbildung',     // apprenticeship / training
  'berater',        // consultant / advisor
  'entwickler',     // developer
  'fachkraft',      // skilled worker
  'kauffrau',       // merchant / business person (female form)
  'kaufmann',       // merchant / business person
  'mechaniker',     // mechanic
  'praktikant',     // intern
  'praktikum',      // internship
  'sachbearbeiter', // clerk / officer
  'technischer',    // technical
  'vertrieb',       // sales
  'werkstudent',    // working student / student employee
];

// ── Dutch ─────────────────────────────────────────────────────────────────────
const NL: string[] = [
  'adviseur',       // advisor
  'beheerder',      // administrator
  'coördinator',    // coordinator
  'medewerker',     // employee / associate
  'ontwikkelaar',   // developer
  'uitvoerder',     // executor / operative
  'verkoper',       // salesperson
];

// ── Estonian ─────────────────────────────────────────────────────────────────
const EE: string[] = [
  'arendaja',       // developer
  'juht',           // manager / head
  'nõustaja',       // advisor
  'spetsialist',    // specialist
];

// ── Latvian ───────────────────────────────────────────────────────────────────
const LV: string[] = [
  'izstrādātājs',   // developer
  'konsultants',    // consultant
  'pārdevējs',      // salesperson
  'speciālists',    // specialist
  'vadītājs',       // manager
];

// ── Lithuanian ───────────────────────────────────────────────────────────────
const LT: string[] = [
  'kūrėjas',        // developer / creator
  'konsultantas',   // consultant
  'pardavėjas',     // salesperson
  'specialistas',   // specialist
  'vadovas',        // manager / head
];

// ── Icelandic ────────────────────────────────────────────────────────────────
const IS: string[] = [
  'þróunarfulltrúi', // development representative
  'stjórnandi',     // manager
];

// ─────────────────────────────────────────────────────────────────────────────

const ALL_KEYWORDS: string[] = [
  ...FI, ...SE, ...NO, ...DK, ...DE, ...NL, ...EE, ...LV, ...LT, ...IS,
];

// Pre-compiled regex for performance — rebuilt once at module load.
// No word boundaries — pure substring match so keywords are caught anywhere
// inside a compound word (e.g. "johtaja" matches "myyntijohtaja" and
// "kehitysjohtaja"; "myynti" matches "myyntiassistentti").
// False positives are negligible: these roots never appear inside English words.
export const KEYWORDS_RE = new RegExp(
  `(${ALL_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'i',
);

/**
 * Returns true when the title contains non-ASCII characters typical of
 * non-English languages, or an unambiguous local-language keyword.
 * Used by fetchers to skip description enrichment for titles that already
 * signal a native-language requirement.
 */
export function titleAppearsNonEnglish(title: string): boolean {
  if (/[äöüåéèêëàâîïôùûçñßãõøæœ]/i.test(title)) return true;
  return KEYWORDS_RE.test(title);
}
