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
  'arkkitehti',     // architect
  'asiakas',        // customer
  'asennus',        // installation
  'asentaja',       // installer
  'asentajia',      // installers
  'asiantuntija',   // specialist / expert
  'finanssiala',    // finance sector
  'hakemus',        // application (open application postings)
  'hankinta',       // procurement
  'hitsaaja',       // welder
  'hoitaja',        // caregiver / nurse
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
  'toimiala',       // industry
  'tuotanto',       // production
  'tuotannon',
  'varasto',        // warehouse
  'vastaanotto',    // reception / front desk
  'vuoromestari',   // shift supervisor
];

// ── Swedish ───────────────────────────────────────────────────────────────────
const SE: string[] = [
  'ansvarig',       // responsible / manager
  'arkitekt',       // architect
  'ekonom',         // economist
  'förvaltare',     // administrator / manager
  'handläggare',    // administrator / officer
  'informatiker',   // computer scientist
  'konsult',        // consultant
  'projektledare',  // project manager
  'rådgivare',      // advisor
  'samordnare',     // coordinator
  'säljare',        // salesperson
  'tekniker',       // technician
  'teknisk',        // technical
  'testare',        // tester
  'utvecklare',     // developer
  'verksamhet',     // operations / business
];

// ── Norwegian ─────────────────────────────────────────────────────────────────
const NO: string[] = [
  'avdelingsleder', // department manager
  'fagansvarlig',   // subject-matter responsible
  'karriere',       // career
  'konsulent',      // consultant
  'koordinator',    // coordinator (unambiguous in NO context when combined with NO chars)
  'rådgiver',       // advisor
  'saksbehandler',  // case officer
  'selger',         // salesperson
  'utvikler',       // developer
];

// ── Danish ───────────────────────────────────────────────────────────────────
const DK: string[] = [
  'afdelingsleder', // department manager
  'arkitekt',       // architect
  'karriere',       // career
  'konsulent',      // consultant
  'offentlige',     // public
  'rådgiver',       // advisor
  'sagsbehandler',  // case officer
  'sælger',         // salesperson
  'udvikler',       // developer
];

// ── German ───────────────────────────────────────────────────────────────────
const DE: string[] = [
  'anforderung',    // requirement
  'architekt',      // architect
  'assistenz',      // assistant
  'ausbilder',      // instructor, trainer
  'ausbildung',     // apprenticeship / training
  'ausschreiberung', // tender
  'auszubildender',  // trainee
  'berater',        // consultant / advisor
  'datenbank',      // database
  'digitalisierung', // digitalization
  'elektroniker',   // electrician
  'energiebranche', // energy sector
  'entwickler',     // developer
  'entwicklung',    // development
  'erfahrung',      // experience
  'fachexperte',    // subject matter expert
  'fachkraft',      // skilled worker
  'glasfaser',      // fibre optic
  'informatiker',   // computer scientist
  'infrastruktur',  // infrastructure
  'kauffrau',       // merchant / business person (female form)
  'kaufmann',       // merchant / business person
  'koordinator',    // coordinator
  'kraftfahrer',    // driver
  'laborant',       // laboratory technician
  'logistik',       // logistics
  'masterstudium',  // master's degree/programme
  'mechaniker',     // mechanic
  'medienbranche',  // media sector
  'praktikant',     // intern
  'praktikum',      // internship
  'projekt',        // project
  'sachbearbeiter', // clerk / officer
  'schwerpunkt',    // focus
  'spezialist',     // specialist
  'studium',        // degree programme
  'teamleiter',     // team lead
  'technischer',    // technical
  'verantwortung',  // responsibility
  'verkehr',        // traffic
  'verkäufer',      // salesperson
  'vertrieb',       // sales
  'werkstudent',    // working student / student employee
  'wirtschaft',     // economy
];

// ── Dutch ─────────────────────────────────────────────────────────────────────
const NL: string[] = [
  'adviseur',       // advisor
  'afstuderen',     // graduate
  'automatiseerder', // automater
  'automatisering', // automation
  'beheerder',      // administrator
  'coördinator',    // coordinator
  'defensie',       // defence
  'gezocht',        // wanted
  'informatie',     // information
  'innovatie',      // innovation
  'medewerker',     // employee / associate
  'netwerk',        // network
  'ontwikkelaar',   // developer
  'openbaar',       // public
  'overheid',       // government
  'publieke',       // public
  'spoordomein',    // railway network
  'stagiair',       // intern
  'technisch',      // technical
  'telecommunicatie', // telecommunications
  'transitie',      // transition
  'uitvoerder',     // executor / operative
  'veiligheid',     // safety
  'verkoper',       // salesperson
  'verzekeringen',  // insurance
  'virtualisatie',  // virtualization
];

// ── Estonian ─────────────────────────────────────────────────────────────────
const EE: string[] = [
  'arendaja',       // developer
  'juht',           // manager / head
  'müügijuht',      // sales manager
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
  'sérfræðingur',   // specialist / expert
  'stjórnandi',     // manager
  'þróunarfulltrúi', // development representative
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
  // Covers all tracked-country native character sets:
  //   Nordic/Germanic: ä ö ü å ø æ ß
  //   French/Romance: é è ê ë à â î ï ô ù û ç ñ ã õ œ ă ș ț
  //   Icelandic: þ ð
  //   Baltic (LV/LT): ā č ē ģ ī ķ ļ ņ š ū ž ą ę ė į ų
  //   Polish: ł ń ś ź ż
  if (/[äöüåéèêëàâîïôùûçñßãõøæœþðāčēģīķļņšūžąęėįųłńśźżășț]/i.test(title)) return true;
  return KEYWORDS_RE.test(title);
}
