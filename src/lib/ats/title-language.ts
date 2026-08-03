import { getCityNames } from './country-lookup';

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

// ── Danish ───────────────────────────────────────────────────────────────────
const DK: string[] = [
  'afdelingsleder', // department manager
  'afvanding',      // drainage
  'arkitekt',       // architect
  'boreformand',    // drilling foreman
  'fagchef',        // head of department
  'fagspecialist',  // subject specialist
  'hjælper',        // assistant
  'karriere',       // career
  'konsulent',      // consultant
  'offentlige',     // public
  'projectchef',    // project manager
  'projectleder',   // project manager
  'rådgiver',       // advisor
  'sagsbehandler',  // case officer
  'sælger',         // salesperson
  'statiker',       // structural engineer
  'tilbudspartner', // offer partner
  'udvikler',       // developer
];

// ── Dutch ─────────────────────────────────────────────────────────────────────
const NL: string[] = [
  'adviseur',       // advisor
  'afstudeer',      // graduate
  'afstuderen',     // graduate
  'automatiseerder', // automater
  'automatisering', // automation
  'beheerder',      // administrator
  'bouwkundig',     // architectural
  'constructeur',   // constructor / manufacturer
  'coördinator',    // coordinator
  'defensie',       // defence
  'gezocht',        // wanted
  'informatie',     // information
  'innovatie',      // innovation
  'medewerker',     // employee / associate
  'monteur',        // installer
  'netwerk',        // network
  'omgeving',       // environment
  'ontwerp',        // design
  'ontwikkelaar',   // developer
  'openbaar',       // public
  'overheid',       // government
  'projectleider',  // project manager
  'publieke',       // public
  'spoordomein',    // railway network
  'stagiair',       // intern
  'technieker',     // technician
  'technisch',      // technical
  'telecommunicatie', // telecommunications
  'transitie',      // transition
  'uitvoerder',     // executor / operative
  'veiligheid',     // safety
  'verkoper',       // salesperson
  'verzekeringen',  // insurance
  'virtualisatie',  // virtualization
  'voorbereider',   // planner
  'voorziening',    // facility
];

// ── Estonian ─────────────────────────────────────────────────────────────────
const EE: string[] = [
  'arendaja',       // developer
  'insener',       // engineer
  'juht',           // manager / head
  'konstruktorit',  // design engineer
  'modelleerija',   // modeler
  'müügijuht',      // sales manager
  'nõustaja',       // advisor
  'projekteerija',  // designer
  'spetsialist',    // specialist
];

// ── Finnish ──────────────────────────────────────────────────────────────────
const FI: string[] = [
  'ammattitaito',   // skill
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
  'tuotannon',      // production (genitive)
  'tutkija',        // researcher
  'valvoja',        // supervisor
  'varasto',        // warehouse
  'vastaanotto',    // reception / front desk
  'vuoromestari',   // shift supervisor
];

// ── French ───────────────────────────────────────────────────────────────────
const FR: string[] = [
  'acheteur',        // buyer / purchaser
  'administrateur',  // director
  'alternance',      // apprenticeship / work-study program
  'amenagement',     // planning / development (accent-free "aménagement")
  'approvisionnement', // procurement / supply
  'approvisionneur', // procurement officer
  'architecte',      // architect
  'batiment',        // building / construction (accent-free "bâtiment")
  'cariste',         // forklift operator
  'concepteur',      // designer
  'conducteur',      // operator, conductor
  'conseiller',      // advisor
  'dessinateur',     // illustrator
  'developpeur',     // developer (accent-free "développeur")
  'electricien',     // electrician (accent-free "électricien")
  'electronique',    // electronics
  'embauche',        // hiring
  'environnement',   // environment
  'evaluateur',      // tester
  'gestion',         // management
  'industriel',      // industrial
  'ingénieur',       // engineer
  'juriste',         // legal counsel
  'logiciel',        // software
  'magasinier',      // warehouse clerk
  'manutentionnaire', // warehouse handler
  'menuisier',       // carpenter / joiner
  'offre',           // offer
  'ordonnanceur',    // scheduler
  'peintre',         // painter
  'planificateur',   // planner
  'plateforme',      // platform
  'plombier',        // plumber
  'produit',         // product
  'projet',          // projects
  'qualite',         // quality (accent-free "qualité")
  'recherche',       // research
  'recrutement',     // recruitment
  'reseau',          // network (accent-free "réseau")
  'responsable',     // manager / lead
  'secteur',         // sector
  'securite',        // security (accent-free "sécurité")
  'soudeur',         // welder
  'soutien',         // support
  'stagiaire',       // intern
  'superviseur',     // supervisor
  'technicien',      // technician
  'testeur',         // tester
  'thermique',       // thermal
  'vendeur',         // salesperson
];

// ── German ───────────────────────────────────────────────────────────────────
const DE: string[] = [
  'anforderung',    // requirement
  'architekt',      // architect
  'assistenz',      // assistant
  'ausbilder',      // instructor, trainer
  'ausbildung',     // apprenticeship / training
  'aushilfe',       // temporary worker
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
  'fachbereich',    // department
  'fachexperte',    // subject matter expert
  'fachgutachter',  // expert / technical consultant
  'fachkraft',      // skilled worker
  'fachplaner',     // specialist planner
  'genehmigung',    // approval
  'geomatiker',     // geomatics engineer
  'glasfaser',      // fibre optic
  'informatik',     // computer science
  'infrastruktur',  // infrastructure
  'ingenieur',      // engineer
  'kauffrau',       // merchant / business person (female form)
  'kaufmann',       // merchant / business person
  'konstrukteur',   // designer / design engineer
  'koordinator',    // coordinator
  'kraftfahrer',    // driver
  'laborant',       // laboratory technician
  'landschaft',     // landscape
  'logistik',       // logistics
  'masterstudium',  // master's degree/programme
  'mechaniker',     // mechanic
  'medienbranche',  // media sector
  'mitarbeiter',    // staff
  'praktikant',     // intern
  'praktikum',      // internship
  'projekt',        // project
  'sachbearbeiter', // clerk / officer
  'schwerpunkt',    // focus
  'spezialist',     // specialist
  'studium',        // degree programme
  'teamleiter',     // team lead
  'teamleitung',    // team leader
  'technischer',    // technical
  'verantwortung',  // responsibility
  'verkehr',        // traffic
  'verkäufer',      // salesperson
  'vertrag',        // contract
  'vertrieb',       // sales
  'werkstudent',    // working student / student employee
  'wirtschaft',     // economy
  'zeichner',       // illustrator / draftsman
];

// ── Icelandic ────────────────────────────────────────────────────────────────
const IS: string[] = [
  'sérfræðingur',   // specialist / expert
  'stjórnandi',     // manager
  'þróunarfulltrúi', // development representative
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

// ── Polish ───────────────────────────────────────────────────────────────────
const PL: string[] = [
  'brygadzista',    // foreman / shift supervisor
  'doradca',        // advisor
  'elektromonter',  // electrical installer
  'elektryk',       // electrician
  'handlowiec',     // salesperson
  'informatyk',     // IT specialist
  'inżynier',       // engineer
  'inzynier',       // engineer (accent-free "inżynier")
  'kelner',         // waiter
  'kierowca',       // driver
  'kierownictwo',   // management
  'kierownik',      // manager / head
  'konsultant',     // consultant
  'koordynator',    // coordinator
  'księgowy',       // accountant
  'ksiegowy',       // accountant (accent-free "księgowy")
  'kucharz',        // cook / chef
  'magazyn',        // warehouse
  'magazynier',     // warehouse worker
  'malarz',         // painter
  'mechanik',       // mechanic
  'monter',         // installer / assembler
  'opiekun',        // caregiver
  'opiekunka',      // caregiver (female form)
  'praktykant',     // intern
  'pracownik',      // employee / worker
  'prawnik',        // lawyer
  'programista',    // programmer
  'przedstawiciel', // representative
  'recepcjonista',  // receptionist
  'rekrutacja',     // recruitment
  'specjalista',    // specialist
  'spawacz',        // welder
  'sprzedawca',     // salesperson
  'stażysta',       // intern
  'stazysta',       // intern (accent-free "stażysta")
  'stolarz',        // carpenter
  'zaopatrzenie',   // procurement / supply
];

// ── Swedish ───────────────────────────────────────────────────────────────────
const SE: string[] = [
  'ansvarig',       // responsible / manager
  'arkitekt',       // architect
  'ekonom',         // economist
  'erfaren',        // experienced
  'förvaltare',     // administrator / manager
  'gruppchef',      // group leader
  'handläggare',    // administrator / officer
  'informatiker',   // computer scientist
  'konsult',        // consultant
  'mekaniker',      // mechanic
  'projektledare',  // project manager
  'rådgivare',      // advisor
  'samordnare',     // coordinator
  'säljare',        // salesperson
  'tekniker',       // technician
  'teknisk',        // technical
  'testare',        // tester
  'uppdragsledare', // project manager
  'utredare',       // investigator
  'utvecklare',     // developer
  'validering',     // validation
  'verksamhet',     // operations / business
];

// ─────────────────────────────────────────────────────────────────────────────

const ALL_KEYWORDS: string[] = [
  ...DK, ...NL, ...EE, ...FI, ...FR, ...DE, ...IS, ...LV, ...LT, ...NO, ...PL, ...SE,
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

// Non-ASCII characters used by tracked-country languages.
const NON_ASCII_RE = /[äöüåéèêëàâîïôùûçñßãõøæœþðāčēģīķļņšūžąęėįųłńśźżćóășț]/i;

/**
 * Strip bilingual slash suffixes from job titles.
 * Some companies (e.g. SEB Latvia) post titles like
 *   "Finance Developer/ Finanšu izstrādātājs/-a in Finance, Risk and Data Tribe"
 * or  "Information Security Manager / Informācijas drošības vadītājs (-a) (GRC)"
 * This finds the first "/" whose right-hand side contains non-ASCII characters
 * and keeps only the left-hand (English) side.
 */
export function stripBilingualSuffix(title: string): string {
  const latvianRe = /[āčēģīķļņōŗšūž]/i;
  let idx = 0;
  while (idx < title.length) {
    const slashPos = title.indexOf('/', idx);
    if (slashPos === -1) break;
    const nextSlash = title.indexOf('/', slashPos + 1);
    const segment = nextSlash === -1
      ? title.slice(slashPos + 1)
      : title.slice(slashPos + 1, nextSlash);
    if (latvianRe.test(segment)) {
      return title.slice(0, slashPos).trim();
    }
    idx = slashPos + 1;
  }
  return title;
}

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
  //   Polish: ł ń ś ź ż ć ó ą ę
  if (NON_ASCII_RE.test(title)) return true;
  return KEYWORDS_RE.test(title);
}

let _cityNamePattern: RegExp | null | undefined;

function stripNonAsciiCityNames(title: string): string {
  if (_cityNamePattern === undefined) {
    const cityNames = getCityNames().filter((n) => /[^\x00-\x7F]/.test(n));
    if (cityNames.length === 0) {
      _cityNamePattern = null;
    } else {
      const escaped = cityNames
        .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .sort((a, b) => b.length - a.length);
      _cityNamePattern = new RegExp(escaped.join('|'), 'gi');
    }
  }
  if (!_cityNamePattern) return title;
  _cityNamePattern.lastIndex = 0;
  return title.replace(_cityNamePattern, ' ');
}

/**
 * Like titleAppearsNonEnglish, but first strips known non-ASCII city names.
 *
 * A city name is not a reliable enough signal on its own to skip fetching a
 * job's description entirely — e.g. "Besiktningsman VVS till Linköping" has
 * "Linköping" as its only non-ASCII content, but so would an English title
 * that merely happens to be based in an accented-named city. Rather than
 * guess, when the ONLY non-English signal in a title is a city name, this
 * returns false — meaning "go ahead and fetch the description" — so the real
 * classifier (which also strips city names, but has the description text and
 * full signal-phrase/tinyld machinery available) gets a chance to decide
 * properly instead of the job silently defaulting to English for lack of any
 * fetched content.
 */
export function titleAppearsNonEnglishExcludingCityNames(title: string): boolean {
  return titleAppearsNonEnglish(stripNonAsciiCityNames(title));
}
