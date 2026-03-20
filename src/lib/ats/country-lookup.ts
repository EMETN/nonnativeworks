export interface CountryInfo {
  name: string;
  code: string;
  slug: string;
}

// Keyed by lowercase, trimmed country name or common abbreviation.
const COUNTRY_MAP: Record<string, CountryInfo> = {
  // Nordic
  'finland': { name: 'Finland', code: 'FI', slug: 'finland' },
  'suomi': { name: 'Finland', code: 'FI', slug: 'finland' },
  'sweden': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'sverige': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'norway': { name: 'Norway', code: 'NO', slug: 'norway' },
  'norge': { name: 'Norway', code: 'NO', slug: 'norway' },
  'denmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'danmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'iceland': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'island': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  // DACH
  'germany': { name: 'Germany', code: 'DE', slug: 'germany' },
  'deutschland': { name: 'Germany', code: 'DE', slug: 'germany' },
  'austria': { name: 'Austria', code: 'AT', slug: 'austria' },
  'österreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'osterreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'switzerland': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'schweiz': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'suisse': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  // Western Europe
  'france': { name: 'France', code: 'FR', slug: 'france' },
  'netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'the netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'holland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nederland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'belgium': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgique': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgië': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgie': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'luxembourg': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'spain': { name: 'Spain', code: 'ES', slug: 'spain' },
  'españa': { name: 'Spain', code: 'ES', slug: 'spain' },
  'espana': { name: 'Spain', code: 'ES', slug: 'spain' },
  'portugal': { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'italy': { name: 'Italy', code: 'IT', slug: 'italy' },
  'italia': { name: 'Italy', code: 'IT', slug: 'italy' },
  // British Isles
  'united kingdom': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'uk': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'great britain': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'england': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'scotland': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'wales': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'ireland': { name: 'Ireland', code: 'IE', slug: 'ireland' },
  // Central/Eastern Europe
  'poland': { name: 'Poland', code: 'PL', slug: 'poland' },
  'polska': { name: 'Poland', code: 'PL', slug: 'poland' },
  'czech republic': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'czechia': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'česká republika': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'ceska republika': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'slovakia': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'slovensko': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'hungary': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'magyarország': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'magyarorszag': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'romania': { name: 'Romania', code: 'RO', slug: 'romania' },
  'bulgaria': { name: 'Bulgaria', code: 'BG', slug: 'bulgaria' },
  'croatia': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'hrvatska': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'slovenia': { name: 'Slovenia', code: 'SI', slug: 'slovenia' },
  'serbia': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'srbija': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'bosnia': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'bosnia and herzegovina': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'north macedonia': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'macedonia': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'montenegro': { name: 'Montenegro', code: 'ME', slug: 'montenegro' },
  'albania': { name: 'Albania', code: 'AL', slug: 'albania' },
  // Baltics
  'estonia': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'eesti': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'latvia': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'latvija': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'lithuania': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  'lietuva': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  // Southern/SE Europe
  'greece': { name: 'Greece', code: 'GR', slug: 'greece' },
  'hellas': { name: 'Greece', code: 'GR', slug: 'greece' },
  'turkey': { name: 'Turkey', code: 'TR', slug: 'turkey' },
  'türkiye': { name: 'Turkey', code: 'TR', slug: 'turkey' },
  'turkiye': { name: 'Turkey', code: 'TR', slug: 'turkey' },
  'cyprus': { name: 'Cyprus', code: 'CY', slug: 'cyprus' },
  'malta': { name: 'Malta', code: 'MT', slug: 'malta' },
  // Eastern Europe / Eurasia
  'ukraine': { name: 'Ukraine', code: 'UA', slug: 'ukraine' },
  'russia': { name: 'Russia', code: 'RU', slug: 'russia' },
  'georgia': { name: 'Georgia', code: 'GE', slug: 'georgia' },
  'moldova': { name: 'Moldova', code: 'MD', slug: 'moldova' },
  'belarus': { name: 'Belarus', code: 'BY', slug: 'belarus' },
  // Americas
  'united states': { name: 'United States', code: 'US', slug: 'united-states' },
  'usa': { name: 'United States', code: 'US', slug: 'united-states' },
  'u.s.a.': { name: 'United States', code: 'US', slug: 'united-states' },
  'u.s.': { name: 'United States', code: 'US', slug: 'united-states' },
  'canada': { name: 'Canada', code: 'CA', slug: 'canada' },
  'brazil': { name: 'Brazil', code: 'BR', slug: 'brazil' },
  'brasil': { name: 'Brazil', code: 'BR', slug: 'brazil' },
  'mexico': { name: 'Mexico', code: 'MX', slug: 'mexico' },
  'méxico': { name: 'Mexico', code: 'MX', slug: 'mexico' },
  'argentina': { name: 'Argentina', code: 'AR', slug: 'argentina' },
  'colombia': { name: 'Colombia', code: 'CO', slug: 'colombia' },
  'chile': { name: 'Chile', code: 'CL', slug: 'chile' },
  // Asia-Pacific
  'australia': { name: 'Australia', code: 'AU', slug: 'australia' },
  'new zealand': { name: 'New Zealand', code: 'NZ', slug: 'new-zealand' },
  'japan': { name: 'Japan', code: 'JP', slug: 'japan' },
  'china': { name: 'China', code: 'CN', slug: 'china' },
  'india': { name: 'India', code: 'IN', slug: 'india' },
  'singapore': { name: 'Singapore', code: 'SG', slug: 'singapore' },
  'south korea': { name: 'South Korea', code: 'KR', slug: 'south-korea' },
  'korea': { name: 'South Korea', code: 'KR', slug: 'south-korea' },
  'indonesia': { name: 'Indonesia', code: 'ID', slug: 'indonesia' },
  'malaysia': { name: 'Malaysia', code: 'MY', slug: 'malaysia' },
  'thailand': { name: 'Thailand', code: 'TH', slug: 'thailand' },
  'vietnam': { name: 'Vietnam', code: 'VN', slug: 'vietnam' },
  'philippines': { name: 'Philippines', code: 'PH', slug: 'philippines' },
  // Middle East
  'israel': { name: 'Israel', code: 'IL', slug: 'israel' },
  'united arab emirates': { name: 'United Arab Emirates', code: 'AE', slug: 'united-arab-emirates' },
  'uae': { name: 'United Arab Emirates', code: 'AE', slug: 'united-arab-emirates' },
  'saudi arabia': { name: 'Saudi Arabia', code: 'SA', slug: 'saudi-arabia' },
  // Africa
  'south africa': { name: 'South Africa', code: 'ZA', slug: 'south-africa' },
  'nigeria': { name: 'Nigeria', code: 'NG', slug: 'nigeria' },
  'kenya': { name: 'Kenya', code: 'KE', slug: 'kenya' },
};

// Location strings that should be skipped (not a country)
const SKIP_LOCATION_PATTERNS = [
  /^remote$/i,
  /^worldwide$/i,
  /^global$/i,
  /^anywhere$/i,
  /^work from home$/i,
  /^wfh$/i,
  /^home office$/i,
  /^europe$/i,
  /^emea$/i,
  /^apac$/i,
  /^latam$/i,
  /^americas$/i,
  /^multiple$/i,
  /^various$/i,
  /^n\/a$/i,
];

function normalizeKey(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function lookupCountryFromLocation(location: string): CountryInfo | null {
  if (!location || !location.trim()) return null;

  // Check skip patterns against full location
  for (const pattern of SKIP_LOCATION_PATTERNS) {
    if (pattern.test(location.trim())) return null;
  }

  const segments = location.split(',').map((s) => s.trim()).filter(Boolean);

  // Try from last segment inward (most specific to least)
  for (let i = segments.length - 1; i >= 0; i--) {
    const key = normalizeKey(segments[i]);
    if (COUNTRY_MAP[key]) return COUNTRY_MAP[key];
  }

  // Try full string as a single key
  const fullKey = normalizeKey(location);
  if (COUNTRY_MAP[fullKey]) return COUNTRY_MAP[fullKey];

  return null;
}
