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
  'fin': { name: 'Finland', code: 'FI', slug: 'finland' },
  'fi': { name: 'Finland', code: 'FI', slug: 'finland' },
  'sweden': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'sverige': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'swe': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'se': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'norway': { name: 'Norway', code: 'NO', slug: 'norway' },
  'norge': { name: 'Norway', code: 'NO', slug: 'norway' },
  'nor': { name: 'Norway', code: 'NO', slug: 'norway' },
  'no': { name: 'Norway', code: 'NO', slug: 'norway' },
  'denmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'danmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'dnk': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'dk': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'iceland': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'island': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'isl': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'is': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  // DACH
  'germany': { name: 'Germany', code: 'DE', slug: 'germany' },
  'deutschland': { name: 'Germany', code: 'DE', slug: 'germany' },
  'deu': { name: 'Germany', code: 'DE', slug: 'germany' },
  'de': { name: 'Germany', code: 'DE', slug: 'germany' },
  'austria': { name: 'Austria', code: 'AT', slug: 'austria' },
  'österreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'osterreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'aut': { name: 'Austria', code: 'AT', slug: 'austria' },
  'switzerland': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'schweiz': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'suisse': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'che': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  // Western Europe
  'france': { name: 'France', code: 'FR', slug: 'france' },
  'fra': { name: 'France', code: 'FR', slug: 'france' },
  'netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'the netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'holland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nederland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nld': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nl': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'belgium': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgique': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgië': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgie': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'bel': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'luxembourg': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'lux': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'spain': { name: 'Spain', code: 'ES', slug: 'spain' },
  'españa': { name: 'Spain', code: 'ES', slug: 'spain' },
  'espana': { name: 'Spain', code: 'ES', slug: 'spain' },
  'esp': { name: 'Spain', code: 'ES', slug: 'spain' },
  'portugal': { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'prt': { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'italy': { name: 'Italy', code: 'IT', slug: 'italy' },
  'italia': { name: 'Italy', code: 'IT', slug: 'italy' },
  'ita': { name: 'Italy', code: 'IT', slug: 'italy' },
  // British Isles
  'united kingdom': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'uk': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'great britain': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'england': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'scotland': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'wales': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'gbr': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'ireland': { name: 'Ireland', code: 'IE', slug: 'ireland' },
  'irl': { name: 'Ireland', code: 'IE', slug: 'ireland' },
  // Central/Eastern Europe
  'poland': { name: 'Poland', code: 'PL', slug: 'poland' },
  'polska': { name: 'Poland', code: 'PL', slug: 'poland' },
  'pol': { name: 'Poland', code: 'PL', slug: 'poland' },
  'czech republic': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'czechia': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'česká republika': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'ceska republika': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'cze': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'slovakia': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'slovensko': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'svk': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'hungary': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'magyarország': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'magyarorszag': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'hun': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'romania': { name: 'Romania', code: 'RO', slug: 'romania' },
  'rou': { name: 'Romania', code: 'RO', slug: 'romania' },
  'bulgaria': { name: 'Bulgaria', code: 'BG', slug: 'bulgaria' },
  'bgr': { name: 'Bulgaria', code: 'BG', slug: 'bulgaria' },
  'croatia': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'hrvatska': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'hrv': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'slovenia': { name: 'Slovenia', code: 'SI', slug: 'slovenia' },
  'svn': { name: 'Slovenia', code: 'SI', slug: 'slovenia' },
  'serbia': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'srbija': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'srb': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'bosnia': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'bosnia and herzegovina': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'bih': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'north macedonia': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'macedonia': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'mkd': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'montenegro': { name: 'Montenegro', code: 'ME', slug: 'montenegro' },
  'mne': { name: 'Montenegro', code: 'ME', slug: 'montenegro' },
  'albania': { name: 'Albania', code: 'AL', slug: 'albania' },
  'alb': { name: 'Albania', code: 'AL', slug: 'albania' },
  // Baltics
  'estonia': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'eesti': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'est': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'ee': { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'latvia': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'latvija': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'lva': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'lv': { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'lithuania': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  'lietuva': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  'ltu': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  'lt': { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
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

// City-to-country map for when job APIs return city names instead of country names.
// Only include cities that are unambiguous within the countries this site tracks.
const CITY_MAP: Record<string, CountryInfo> = {
  // ── Finland ──────────────────────────────────────────────────────────────
  'espoo':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'forssa':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'heinola':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'helsinki':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'helsinki metropolitan area': { name: 'Finland', code: 'FI', slug: 'finland' },
  'huittinen':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'hyvinkää':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'hämeenlinna':              { name: 'Finland', code: 'FI', slug: 'finland' },
  'joensuu':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'jyväskylä':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'jyvaskyla':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'järvenpää':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'kajaani':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'kerava':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'kuopio':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'lahti':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'lappeenranta':             { name: 'Finland', code: 'FI', slug: 'finland' },
  'oulu':                     { name: 'Finland', code: 'FI', slug: 'finland' },
  'mikkeli':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'riihimäki':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'rovaniemi':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'savonlinna':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'tampere':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'turku':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'vaasa':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'vantaa':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'varkaus':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  // ── Germany ──────────────────────────────────────────────────────────────
  'berlin':                   { name: 'Germany', code: 'DE', slug: 'germany' },
  'bielefeld':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'bochum':                   { name: 'Germany', code: 'DE', slug: 'germany' },
  'bonn':                     { name: 'Germany', code: 'DE', slug: 'germany' },
  'braunschweig':             { name: 'Germany', code: 'DE', slug: 'germany' },
  'brunswick':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'braunschweig/brunswick':   { name: 'Germany', code: 'DE', slug: 'germany' },
  'donauwörth':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'dortmund':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'dresden':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'duisburg':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'düsseldorf':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'dusseldorf':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'essen':                    { name: 'Germany', code: 'DE', slug: 'germany' },
  'ettlingen':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'frankfurt':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'frankfurt am main':        { name: 'Germany', code: 'DE', slug: 'germany' },
  'hamburg':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'hannover':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'hanover':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'ingolstadt':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'karlsruhe':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'köln':                     { name: 'Germany', code: 'DE', slug: 'germany' },
  'cologne':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'koln':                     { name: 'Germany', code: 'DE', slug: 'germany' },
  'leipzig':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'mannheim':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'münchen':                  { name: 'Germany', code: 'DE', slug: 'germany' },
  'munich':                   { name: 'Germany', code: 'DE', slug: 'germany' },
  'nürnberg':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'nuremberg':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'nurnberg':                 { name: 'Germany', code: 'DE', slug: 'germany' },
  'regensburg':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'remptendorf':              { name: 'Germany', code: 'DE', slug: 'germany' },
  'stuttgart':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'ulm':                      { name: 'Germany', code: 'DE', slug: 'germany' },
  'wetter':                   { name: 'Germany', code: 'DE', slug: 'germany' },
  // ── Austria ──────────────────────────────────────────────────────────────
  'graz':                     { name: 'Austria', code: 'AT', slug: 'austria' },
  'innsbruck':                { name: 'Austria', code: 'AT', slug: 'austria' },
  'linz':                     { name: 'Austria', code: 'AT', slug: 'austria' },
  'salzburg':                 { name: 'Austria', code: 'AT', slug: 'austria' },
  'wien':                     { name: 'Austria', code: 'AT', slug: 'austria' },
  'vienna':                   { name: 'Austria', code: 'AT', slug: 'austria' },
  // ── Spain ────────────────────────────────────────────────────────────────
  'barcelona':                { name: 'Spain', code: 'ES', slug: 'spain' },
  'bilbao':                   { name: 'Spain', code: 'ES', slug: 'spain' },
  'madrid':                   { name: 'Spain', code: 'ES', slug: 'spain' },
  'málaga':                   { name: 'Spain', code: 'ES', slug: 'spain' },
  'malaga':                   { name: 'Spain', code: 'ES', slug: 'spain' },
  'sevilla':                  { name: 'Spain', code: 'ES', slug: 'spain' },
  'seville':                  { name: 'Spain', code: 'ES', slug: 'spain' },
  'valencia':                 { name: 'Spain', code: 'ES', slug: 'spain' },
  // ── Sweden ───────────────────────────────────────────────────────────────
  'göteborg':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'gothenburg':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'goteborg':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kalix':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kalmar':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kiruna':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'linköping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'linkoping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'lulea':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'luleå':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'lund':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'malmö':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'malmo':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'örebro':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'orebro':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skelleftea':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skellefteå':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'solna':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'stockholm':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'umeå':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'umea':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'uppsala':                  { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'västerås':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'vasteras':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'vaesteras':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'ostersund':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'östersund':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  // ── Norway ───────────────────────────────────────────────────────────────
  'bergen':                   { name: 'Norway', code: 'NO', slug: 'norway' },
  'fornebu':                  { name: 'Norway', code: 'NO', slug: 'norway' },
  'oslo':                     { name: 'Norway', code: 'NO', slug: 'norway' },
  'stavanger':                { name: 'Norway', code: 'NO', slug: 'norway' },
  'trondheim':                { name: 'Norway', code: 'NO', slug: 'norway' },
  // ── Denmark ──────────────────────────────────────────────────────────────
  'aalborg':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'aarhus':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'copenhagen':               { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'københavn':                { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'kobenhavn':                { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'odense':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'taastrup':                 { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'viby':                      { name: 'Denmark', code: 'DK', slug: 'denmark' },
  // ── Netherlands ──────────────────────────────────────────────────────────
  'amsterdam':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'bergen op zoom':           { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'ede':                      { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'eindhoven':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'den haag':                 { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'the hague':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'hoofddorp':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'purmerend':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'rotterdam':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'utrecht':                  { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  // ── France ───────────────────────────────────────────────────────────────
  'bordeaux':                 { name: 'France', code: 'FR', slug: 'france' },
  'lille':                    { name: 'France', code: 'FR', slug: 'france' },
  'lyon':                     { name: 'France', code: 'FR', slug: 'france' },
  'marseille':                { name: 'France', code: 'FR', slug: 'france' },
  'nantes':                   { name: 'France', code: 'FR', slug: 'france' },
  'nice':                     { name: 'France', code: 'FR', slug: 'france' },
  'paris':                    { name: 'France', code: 'FR', slug: 'france' },
  'strasbourg':               { name: 'France', code: 'FR', slug: 'france' },
  'toulouse':                 { name: 'France', code: 'FR', slug: 'france' },
  // ── United Kingdom ───────────────────────────────────────────────────────
  'birmingham':               { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'bristol':                  { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'cambridge':                { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'edinburgh':                { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'glasgow':                  { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'leeds':                    { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'london':                   { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'manchester':               { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'oxford':                   { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  // ── Poland ───────────────────────────────────────────────────────────────
  'gdańsk':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'gdansk':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'kraków':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'krakow':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'łódź':                     { name: 'Poland', code: 'PL', slug: 'poland' },
  'lodz':                     { name: 'Poland', code: 'PL', slug: 'poland' },
  'poznań':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'poznan':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'warsaw':                   { name: 'Poland', code: 'PL', slug: 'poland' },
  'warszawa':                 { name: 'Poland', code: 'PL', slug: 'poland' },
  'wrocław':                  { name: 'Poland', code: 'PL', slug: 'poland' },
  'wroclaw':                  { name: 'Poland', code: 'PL', slug: 'poland' },
  // ── Czech Republic ───────────────────────────────────────────────────────
  'brno':                     { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'prague':                   { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'praha':                    { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  // ── Hungary ──────────────────────────────────────────────────────────────
  'budapest':                 { name: 'Hungary', code: 'HU', slug: 'hungary' },
  // ── Romania ──────────────────────────────────────────────────────────────
  'bucurești':                { name: 'Romania', code: 'RO', slug: 'romania' },
  'bucharest':                { name: 'Romania', code: 'RO', slug: 'romania' },
  'cluj':                     { name: 'Romania', code: 'RO', slug: 'romania' },
  'cluj-napoca':              { name: 'Romania', code: 'RO', slug: 'romania' },
  // ── Switzerland ──────────────────────────────────────────────────────────
  'basel':                    { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'bern':                     { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'genève':                   { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'geneve':                   { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'geneva':                   { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'zürich':                   { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'zurich':                   { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  // ── Baltics ──────────────────────────────────────────────────────────────
  'rīga':                     { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'riga':                     { name: 'Latvia', code: 'LV', slug: 'latvia' },
  'tallinn':                  { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'tartu':                    { name: 'Estonia', code: 'EE', slug: 'estonia' },
  'vilnius':                  { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  'kaunas':                   { name: 'Lithuania', code: 'LT', slug: 'lithuania' },
  // ── Ireland ──────────────────────────────────────────────────────────────
  'dublin':                   { name: 'Ireland', code: 'IE', slug: 'ireland' },
  // ── Belgium ──────────────────────────────────────────────────────────────
  'antwerp':                  { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'antwerpen':                { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'brussels':                 { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'bruxelles':                { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'brussel':                  { name: 'Belgium', code: 'BE', slug: 'belgium' },
  // ── Portugal ─────────────────────────────────────────────────────────────
  'lisbon':                   { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'lisboa':                   { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'porto':                    { name: 'Portugal', code: 'PT', slug: 'portugal' },
  // ── United States (states) ───────────────────────────────────────────────
  // COUNTRY_MAP takes priority for 'georgia' (country Georgia/GE), so adding it here is safe.
  'alabama':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'alaska':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'arizona':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'arkansas':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'california':               { name: 'United States', code: 'US', slug: 'united-states' },
  'colorado':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'connecticut':              { name: 'United States', code: 'US', slug: 'united-states' },
  'delaware':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'florida':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'georgia':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'hawaii':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'idaho':                    { name: 'United States', code: 'US', slug: 'united-states' },
  'illinois':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'indiana':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'iowa':                     { name: 'United States', code: 'US', slug: 'united-states' },
  'kansas':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'kentucky':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'louisiana':                { name: 'United States', code: 'US', slug: 'united-states' },
  'maine':                    { name: 'United States', code: 'US', slug: 'united-states' },
  'maryland':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'massachusetts':            { name: 'United States', code: 'US', slug: 'united-states' },
  'michigan':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'minnesota':                { name: 'United States', code: 'US', slug: 'united-states' },
  'mississippi':              { name: 'United States', code: 'US', slug: 'united-states' },
  'missouri':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'montana':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'nebraska':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'nevada':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'new hampshire':            { name: 'United States', code: 'US', slug: 'united-states' },
  'new jersey':               { name: 'United States', code: 'US', slug: 'united-states' },
  'new mexico':               { name: 'United States', code: 'US', slug: 'united-states' },
  'new york':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'north carolina':           { name: 'United States', code: 'US', slug: 'united-states' },
  'north dakota':             { name: 'United States', code: 'US', slug: 'united-states' },
  'ohio':                     { name: 'United States', code: 'US', slug: 'united-states' },
  'oklahoma':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'oregon':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'pennsylvania':             { name: 'United States', code: 'US', slug: 'united-states' },
  'rhode island':             { name: 'United States', code: 'US', slug: 'united-states' },
  'south carolina':           { name: 'United States', code: 'US', slug: 'united-states' },
  'south dakota':             { name: 'United States', code: 'US', slug: 'united-states' },
  'tennessee':                { name: 'United States', code: 'US', slug: 'united-states' },
  'texas':                    { name: 'United States', code: 'US', slug: 'united-states' },
  'utah':                     { name: 'United States', code: 'US', slug: 'united-states' },
  'vermont':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'virginia':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'washington':               { name: 'United States', code: 'US', slug: 'united-states' },
  'west virginia':            { name: 'United States', code: 'US', slug: 'united-states' },
  'wisconsin':                { name: 'United States', code: 'US', slug: 'united-states' },
  'wyoming':                  { name: 'United States', code: 'US', slug: 'united-states' },
  // ── United States (major cities) ─────────────────────────────────────────
  'atlanta':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'austin':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'boston':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'chicago':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'dallas':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'denver':                   { name: 'United States', code: 'US', slug: 'united-states' },
  'houston':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'los angeles':              { name: 'United States', code: 'US', slug: 'united-states' },
  'miami':                    { name: 'United States', code: 'US', slug: 'united-states' },
  'minneapolis':              { name: 'United States', code: 'US', slug: 'united-states' },
  'nashville':                { name: 'United States', code: 'US', slug: 'united-states' },
  'new york city':            { name: 'United States', code: 'US', slug: 'united-states' },
  'nyc':                      { name: 'United States', code: 'US', slug: 'united-states' },
  'philadelphia':             { name: 'United States', code: 'US', slug: 'united-states' },
  'phoenix':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'portland':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'raleigh':                  { name: 'United States', code: 'US', slug: 'united-states' },
  'san diego':                { name: 'United States', code: 'US', slug: 'united-states' },
  'san francisco':            { name: 'United States', code: 'US', slug: 'united-states' },
  'san jose':                 { name: 'United States', code: 'US', slug: 'united-states' },
  'seattle':                  { name: 'United States', code: 'US', slug: 'united-states' },
};

// Companies that only operate in one country — keyed by a substring of their career page URL.
// When location lookup fails for a job from one of these companies, fall back to this country
// instead of skipping the job.
const COMPANY_COUNTRY_FALLBACKS: Array<{ urlSubstring: string; country: CountryInfo }> = [
  { urlSubstring: 'posti.', country: { name: 'Finland', code: 'FI', slug: 'finland' } },
];

/**
 * Returns a fallback country for the given career URL if the company is known to operate
 * exclusively in that country. Returns null if no fallback is configured.
 */
export function getCompanyCountryFallback(careerUrl: string): CountryInfo | null {
  const lower = careerUrl.toLowerCase();
  for (const entry of COMPANY_COUNTRY_FALLBACKS) {
    if (lower.includes(entry.urlSubstring)) return entry.country;
  }
  return null;
}

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

// Strips work-mode prefixes like "Hybrid - ", "Remote - ", "On-site - " from location segments.
const LOCATION_PREFIX_RE = /^(hybrid|remote|on-?site|in-?office)\s*[-–]\s*/i;

/**
 * Extract a work model from a raw location string by looking for prefixes like
 * "Hybrid - ", "Remote - ", "On-site - ".
 * Returns 'remote', 'hybrid', or 'on-site' when all semicolon-separated segments
 * share the same prefix; returns null when there is no prefix, or segments disagree.
 */
export function extractWorkModelFromLocation(location: string): 'remote' | 'hybrid' | 'on-site' | null {
  if (!location?.trim()) return null;
  const parts = location.split(';').map((s) => s.trim()).filter(Boolean);
  const models = new Set<string>();
  for (const part of parts) {
    const match = part.match(LOCATION_PREFIX_RE);
    if (match) {
      const raw = match[1].toLowerCase().replace(/-/g, '');
      if (raw === 'remote') models.add('remote');
      else if (raw === 'hybrid') models.add('hybrid');
      else if (raw === 'onsite' || raw === 'inoffice') models.add('on-site');
    }
  }
  if (models.size === 1) return [...models][0] as 'remote' | 'hybrid' | 'on-site';
  return null;
}

/**
 * From a raw location string (e.g. "Hybrid - Helsinki, Uusimaa; Hybrid - Tallinn, Estonia"),
 * extract only the city names that belong to the given ISO alpha-2 country code.
 * Country names and cities from other countries are discarded.
 * Returns an empty array when no matching cities are found.
 */
export function extractCitiesForCountry(location: string, countryCode: string): string[] {
  if (!location?.trim()) return [];
  const parts = location.split(';').map((s) => s.trim()).filter(Boolean);
  const segments = parts.flatMap((part) => {
    const stripped = part.replace(LOCATION_PREFIX_RE, '');
    return stripped.split(',').map((s) => s.trim()).filter(Boolean);
  });
  const results: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const key = normalizeKey(segment);
    const info = CITY_MAP[key];
    if (info && info.code === countryCode) {
      if (!seen.has(key)) {
        seen.add(key);
        results.push(segment);
      }
    }
  }
  return results;
}

export function lookupCountryFromLocation(location: string): CountryInfo[] {
  if (!location || !location.trim()) return [];

  // Check skip patterns against full location
  for (const pattern of SKIP_LOCATION_PATTERNS) {
    if (pattern.test(location.trim())) return [];
  }

  // Split by semicolon first (Greenhouse: "Hybrid - Helsinki, Uusimaa; Hybrid - Oulu, North Ostrobothnia")
  // then by comma within each part. Strip work-mode prefixes before lookup.
  const parts = location.split(';').map((s) => s.trim()).filter(Boolean);
  const segments = parts.flatMap((part) => {
    const stripped = part.replace(LOCATION_PREFIX_RE, '');
    return stripped.split(',').map((s) => s.trim()).filter(Boolean);
  });

  // Collect all unique countries found in any segment — check country map first, then city map
  const seen = new Set<string>();
  const results: CountryInfo[] = [];
  for (const segment of segments) {
    const key = normalizeKey(segment);
    const info = COUNTRY_MAP[key] ?? CITY_MAP[key];
    if (info && !seen.has(info.code)) {
      seen.add(info.code);
      results.push(info);
    }
  }
  if (results.length > 0) return results;

  // Try full string as a single key (country map, then city map)
  const fullKey = normalizeKey(location);
  const fullMatch = COUNTRY_MAP[fullKey] ?? CITY_MAP[fullKey];
  if (fullMatch) return [fullMatch];

  return [];
}
