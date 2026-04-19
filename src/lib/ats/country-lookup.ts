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
  'denmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'danmark': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'dnk': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'dk': { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'iceland': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'island': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'isl': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'is': { name: 'Iceland', code: 'IS', slug: 'iceland' },
  'norway': { name: 'Norway', code: 'NO', slug: 'norway' },
  'norge': { name: 'Norway', code: 'NO', slug: 'norway' },
  'nor': { name: 'Norway', code: 'NO', slug: 'norway' },
  'no': { name: 'Norway', code: 'NO', slug: 'norway' },
  'sweden': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'sverige': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'swe': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'se': { name: 'Sweden', code: 'SE', slug: 'sweden' },
  // DACH
  'austria': { name: 'Austria', code: 'AT', slug: 'austria' },
  'österreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'osterreich': { name: 'Austria', code: 'AT', slug: 'austria' },
  'aut': { name: 'Austria', code: 'AT', slug: 'austria' },
  'germany': { name: 'Germany', code: 'DE', slug: 'germany' },
  'deutschland': { name: 'Germany', code: 'DE', slug: 'germany' },
  'deu': { name: 'Germany', code: 'DE', slug: 'germany' },
  'de': { name: 'Germany', code: 'DE', slug: 'germany' },
  'switzerland': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'schweiz': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'suisse': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'che': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  // Western Europe
  'belgium': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgique': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgië': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'belgie': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'bel': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'france': { name: 'France', code: 'FR', slug: 'france' },
  'fra': { name: 'France', code: 'FR', slug: 'france' },
  'italy': { name: 'Italy', code: 'IT', slug: 'italy' },
  'italia': { name: 'Italy', code: 'IT', slug: 'italy' },
  'ita': { name: 'Italy', code: 'IT', slug: 'italy' },
  'luxembourg': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'lux': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'the netherlands': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'holland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nederland': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nld': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'nl': { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'spain': { name: 'Spain', code: 'ES', slug: 'spain' },
  'españa': { name: 'Spain', code: 'ES', slug: 'spain' },
  'espana': { name: 'Spain', code: 'ES', slug: 'spain' },
  'esp': { name: 'Spain', code: 'ES', slug: 'spain' },
  'portugal': { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'prt': { name: 'Portugal', code: 'PT', slug: 'portugal' },

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
  'argentina': { name: 'Argentina', code: 'AR', slug: 'argentina' },
  'brasil': { name: 'Brazil', code: 'BR', slug: 'brazil' },
  'brazil': { name: 'Brazil', code: 'BR', slug: 'brazil' },
  'canada': { name: 'Canada', code: 'CA', slug: 'canada' },
  'chile': { name: 'Chile', code: 'CL', slug: 'chile' },
  'colombia': { name: 'Colombia', code: 'CO', slug: 'colombia' },
  'mexico': { name: 'Mexico', code: 'MX', slug: 'mexico' },
  'méxico': { name: 'Mexico', code: 'MX', slug: 'mexico' },
  'united states': { name: 'United States', code: 'US', slug: 'united-states' },
  'united states of america': { name: 'United States', code: 'US', slug: 'united-states' },
  'usa': { name: 'United States', code: 'US', slug: 'united-states' },
  'u.s.a.': { name: 'United States', code: 'US', slug: 'united-states' },
  'u.s.': { name: 'United States', code: 'US', slug: 'united-states' },
  // Asia-Pacific
  'australia': { name: 'Australia', code: 'AU', slug: 'australia' },
  'aus': { name: 'Australia', code: 'AU', slug: 'australia' },
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
  // Americas (additional)
  'peru': { name: 'Peru', code: 'PE', slug: 'peru' },
  'ecuador': { name: 'Ecuador', code: 'EC', slug: 'ecuador' },
  'bolivia': { name: 'Bolivia', code: 'BO', slug: 'bolivia' },
  'paraguay': { name: 'Paraguay', code: 'PY', slug: 'paraguay' },
  'uruguay': { name: 'Uruguay', code: 'UY', slug: 'uruguay' },
  'venezuela': { name: 'Venezuela', code: 'VE', slug: 'venezuela' },
  'panama': { name: 'Panama', code: 'PA', slug: 'panama' },
  'costa rica': { name: 'Costa Rica', code: 'CR', slug: 'costa-rica' },
  'guatemala': { name: 'Guatemala', code: 'GT', slug: 'guatemala' },
  'honduras': { name: 'Honduras', code: 'HN', slug: 'honduras' },
  'el salvador': { name: 'El Salvador', code: 'SV', slug: 'el-salvador' },
  'nicaragua': { name: 'Nicaragua', code: 'NI', slug: 'nicaragua' },
  'belize': { name: 'Belize', code: 'BZ', slug: 'belize' },
  'cuba': { name: 'Cuba', code: 'CU', slug: 'cuba' },
  'dominican republic': { name: 'Dominican Republic', code: 'DO', slug: 'dominican-republic' },
  'haiti': { name: 'Haiti', code: 'HT', slug: 'haiti' },
  'jamaica': { name: 'Jamaica', code: 'JM', slug: 'jamaica' },
  'trinidad and tobago': { name: 'Trinidad and Tobago', code: 'TT', slug: 'trinidad-and-tobago' },
  'trinidad': { name: 'Trinidad and Tobago', code: 'TT', slug: 'trinidad-and-tobago' },
  'barbados': { name: 'Barbados', code: 'BB', slug: 'barbados' },
  'guyana': { name: 'Guyana', code: 'GY', slug: 'guyana' },
  'suriname': { name: 'Suriname', code: 'SR', slug: 'suriname' },
  'puerto rico': { name: 'Puerto Rico', code: 'PR', slug: 'puerto-rico' },
  // Africa
  'south africa': { name: 'South Africa', code: 'ZA', slug: 'south-africa' },
  'nigeria': { name: 'Nigeria', code: 'NG', slug: 'nigeria' },
  'kenya': { name: 'Kenya', code: 'KE', slug: 'kenya' },
  'morocco': { name: 'Morocco', code: 'MA', slug: 'morocco' },
  'egypt': { name: 'Egypt', code: 'EG', slug: 'egypt' },
  'tunisia': { name: 'Tunisia', code: 'TN', slug: 'tunisia' },
  'algeria': { name: 'Algeria', code: 'DZ', slug: 'algeria' },
  'libya': { name: 'Libya', code: 'LY', slug: 'libya' },
  'ghana': { name: 'Ghana', code: 'GH', slug: 'ghana' },
  'tanzania': { name: 'Tanzania', code: 'TZ', slug: 'tanzania' },
  'ethiopia': { name: 'Ethiopia', code: 'ET', slug: 'ethiopia' },
  'uganda': { name: 'Uganda', code: 'UG', slug: 'uganda' },
  'rwanda': { name: 'Rwanda', code: 'RW', slug: 'rwanda' },
  'mozambique': { name: 'Mozambique', code: 'MZ', slug: 'mozambique' },
  'zimbabwe': { name: 'Zimbabwe', code: 'ZW', slug: 'zimbabwe' },
  'cameroon': { name: 'Cameroon', code: 'CM', slug: 'cameroon' },
  'senegal': { name: 'Senegal', code: 'SN', slug: 'senegal' },
  "ivory coast": { name: 'Ivory Coast', code: 'CI', slug: 'ivory-coast' },
  "côte d'ivoire": { name: 'Ivory Coast', code: 'CI', slug: 'ivory-coast' },
  "cote d'ivoire": { name: 'Ivory Coast', code: 'CI', slug: 'ivory-coast' },
  'madagascar': { name: 'Madagascar', code: 'MG', slug: 'madagascar' },
  'angola': { name: 'Angola', code: 'AO', slug: 'angola' },
  'zambia': { name: 'Zambia', code: 'ZM', slug: 'zambia' },
  'mali': { name: 'Mali', code: 'ML', slug: 'mali' },
  'burkina faso': { name: 'Burkina Faso', code: 'BF', slug: 'burkina-faso' },
  'niger': { name: 'Niger', code: 'NE', slug: 'niger' },
  'chad': { name: 'Chad', code: 'TD', slug: 'chad' },
  'sudan': { name: 'Sudan', code: 'SD', slug: 'sudan' },
  'south sudan': { name: 'South Sudan', code: 'SS', slug: 'south-sudan' },
  'somalia': { name: 'Somalia', code: 'SO', slug: 'somalia' },
  'eritrea': { name: 'Eritrea', code: 'ER', slug: 'eritrea' },
  'djibouti': { name: 'Djibouti', code: 'DJ', slug: 'djibouti' },
  'mauritius': { name: 'Mauritius', code: 'MU', slug: 'mauritius' },
  'botswana': { name: 'Botswana', code: 'BW', slug: 'botswana' },
  'namibia': { name: 'Namibia', code: 'NA', slug: 'namibia' },
  'lesotho': { name: 'Lesotho', code: 'LS', slug: 'lesotho' },
  'eswatini': { name: 'Eswatini', code: 'SZ', slug: 'eswatini' },
  'swaziland': { name: 'Eswatini', code: 'SZ', slug: 'eswatini' },
  'malawi': { name: 'Malawi', code: 'MW', slug: 'malawi' },
  'liberia': { name: 'Liberia', code: 'LR', slug: 'liberia' },
  'sierra leone': { name: 'Sierra Leone', code: 'SL', slug: 'sierra-leone' },
  'guinea': { name: 'Guinea', code: 'GN', slug: 'guinea' },
  'guinea-bissau': { name: 'Guinea-Bissau', code: 'GW', slug: 'guinea-bissau' },
  'togo': { name: 'Togo', code: 'TG', slug: 'togo' },
  'benin': { name: 'Benin', code: 'BJ', slug: 'benin' },
  'gabon': { name: 'Gabon', code: 'GA', slug: 'gabon' },
  'republic of the congo': { name: 'Republic of the Congo', code: 'CG', slug: 'republic-of-the-congo' },
  'congo': { name: 'Republic of the Congo', code: 'CG', slug: 'republic-of-the-congo' },
  'democratic republic of the congo': { name: 'Democratic Republic of the Congo', code: 'CD', slug: 'democratic-republic-of-the-congo' },
  'dr congo': { name: 'Democratic Republic of the Congo', code: 'CD', slug: 'democratic-republic-of-the-congo' },
  'drc': { name: 'Democratic Republic of the Congo', code: 'CD', slug: 'democratic-republic-of-the-congo' },
  'central african republic': { name: 'Central African Republic', code: 'CF', slug: 'central-african-republic' },
  'equatorial guinea': { name: 'Equatorial Guinea', code: 'GQ', slug: 'equatorial-guinea' },
  'comoros': { name: 'Comoros', code: 'KM', slug: 'comoros' },
  'cape verde': { name: 'Cape Verde', code: 'CV', slug: 'cape-verde' },
  'cabo verde': { name: 'Cape Verde', code: 'CV', slug: 'cape-verde' },
  'mauritania': { name: 'Mauritania', code: 'MR', slug: 'mauritania' },
  'gambia': { name: 'Gambia', code: 'GM', slug: 'gambia' },
  'the gambia': { name: 'Gambia', code: 'GM', slug: 'gambia' },
  'seychelles': { name: 'Seychelles', code: 'SC', slug: 'seychelles' },
  'sao tome and principe': { name: 'São Tomé and Príncipe', code: 'ST', slug: 'sao-tome-and-principe' },
  // Asia (additional)
  'hong kong': { name: 'Hong Kong', code: 'HK', slug: 'hong-kong' },
  'taiwan': { name: 'Taiwan', code: 'TW', slug: 'taiwan' },
  'pakistan': { name: 'Pakistan', code: 'PK', slug: 'pakistan' },
  'bangladesh': { name: 'Bangladesh', code: 'BD', slug: 'bangladesh' },
  'sri lanka': { name: 'Sri Lanka', code: 'LK', slug: 'sri-lanka' },
  'nepal': { name: 'Nepal', code: 'NP', slug: 'nepal' },
  'myanmar': { name: 'Myanmar', code: 'MM', slug: 'myanmar' },
  'burma': { name: 'Myanmar', code: 'MM', slug: 'myanmar' },
  'cambodia': { name: 'Cambodia', code: 'KH', slug: 'cambodia' },
  'laos': { name: 'Laos', code: 'LA', slug: 'laos' },
  'mongolia': { name: 'Mongolia', code: 'MN', slug: 'mongolia' },
  'kazakhstan': { name: 'Kazakhstan', code: 'KZ', slug: 'kazakhstan' },
  'uzbekistan': { name: 'Uzbekistan', code: 'UZ', slug: 'uzbekistan' },
  'kyrgyzstan': { name: 'Kyrgyzstan', code: 'KG', slug: 'kyrgyzstan' },
  'tajikistan': { name: 'Tajikistan', code: 'TJ', slug: 'tajikistan' },
  'turkmenistan': { name: 'Turkmenistan', code: 'TM', slug: 'turkmenistan' },
  'afghanistan': { name: 'Afghanistan', code: 'AF', slug: 'afghanistan' },
  'azerbaijan': { name: 'Azerbaijan', code: 'AZ', slug: 'azerbaijan' },
  'armenia': { name: 'Armenia', code: 'AM', slug: 'armenia' },
  'maldives': { name: 'Maldives', code: 'MV', slug: 'maldives' },
  'bhutan': { name: 'Bhutan', code: 'BT', slug: 'bhutan' },
  'timor-leste': { name: 'Timor-Leste', code: 'TL', slug: 'timor-leste' },
  'east timor': { name: 'Timor-Leste', code: 'TL', slug: 'timor-leste' },
  'brunei': { name: 'Brunei', code: 'BN', slug: 'brunei' },
  'papua new guinea': { name: 'Papua New Guinea', code: 'PG', slug: 'papua-new-guinea' },
  // Middle East (additional)
  'iraq': { name: 'Iraq', code: 'IQ', slug: 'iraq' },
  'iran': { name: 'Iran', code: 'IR', slug: 'iran' },
  'jordan': { name: 'Jordan', code: 'JO', slug: 'jordan' },
  'lebanon': { name: 'Lebanon', code: 'LB', slug: 'lebanon' },
  'kuwait': { name: 'Kuwait', code: 'KW', slug: 'kuwait' },
  'qatar': { name: 'Qatar', code: 'QA', slug: 'qatar' },
  'bahrain': { name: 'Bahrain', code: 'BH', slug: 'bahrain' },
  'oman': { name: 'Oman', code: 'OM', slug: 'oman' },
  'yemen': { name: 'Yemen', code: 'YE', slug: 'yemen' },
  'syria': { name: 'Syria', code: 'SY', slug: 'syria' },
  'palestine': { name: 'Palestine', code: 'PS', slug: 'palestine' },
  // Europe (additional)
  'kosovo': { name: 'Kosovo', code: 'XK', slug: 'kosovo' },
  'liechtenstein': { name: 'Liechtenstein', code: 'LI', slug: 'liechtenstein' },
  'monaco': { name: 'Monaco', code: 'MC', slug: 'monaco' },
  'andorra': { name: 'Andorra', code: 'AD', slug: 'andorra' },
  'san marino': { name: 'San Marino', code: 'SM', slug: 'san-marino' },
  // Oceania
  'fiji': { name: 'Fiji', code: 'FJ', slug: 'fiji' },
  'solomon islands': { name: 'Solomon Islands', code: 'SB', slug: 'solomon-islands' },
  'vanuatu': { name: 'Vanuatu', code: 'VU', slug: 'vanuatu' },
  'samoa': { name: 'Samoa', code: 'WS', slug: 'samoa' },
  'tonga': { name: 'Tonga', code: 'TO', slug: 'tonga' },
  // 2-letter ISO codes not already listed above.
  // Needed for Workday venue-code prefix detection, e.g. "USCNC05 - Charlotte" → 'us' → United States.
  // Europe
  'al': { name: 'Albania', code: 'AL', slug: 'albania' },
  'am': { name: 'Armenia', code: 'AM', slug: 'armenia' },
  'at': { name: 'Austria', code: 'AT', slug: 'austria' },
  'az': { name: 'Azerbaijan', code: 'AZ', slug: 'azerbaijan' },
  'ba': { name: 'Bosnia and Herzegovina', code: 'BA', slug: 'bosnia-and-herzegovina' },
  'be': { name: 'Belgium', code: 'BE', slug: 'belgium' },
  'bg': { name: 'Bulgaria', code: 'BG', slug: 'bulgaria' },
  'by': { name: 'Belarus', code: 'BY', slug: 'belarus' },
  'ch': { name: 'Switzerland', code: 'CH', slug: 'switzerland' },
  'cy': { name: 'Cyprus', code: 'CY', slug: 'cyprus' },
  'cz': { name: 'Czech Republic', code: 'CZ', slug: 'czech-republic' },
  'es': { name: 'Spain', code: 'ES', slug: 'spain' },
  'fr': { name: 'France', code: 'FR', slug: 'france' },
  'gb': { name: 'United Kingdom', code: 'GB', slug: 'united-kingdom' },
  'ge': { name: 'Georgia', code: 'GE', slug: 'georgia' },
  'gr': { name: 'Greece', code: 'GR', slug: 'greece' },
  'hr': { name: 'Croatia', code: 'HR', slug: 'croatia' },
  'hu': { name: 'Hungary', code: 'HU', slug: 'hungary' },
  'ie': { name: 'Ireland', code: 'IE', slug: 'ireland' },
  'it': { name: 'Italy', code: 'IT', slug: 'italy' },
  'lu': { name: 'Luxembourg', code: 'LU', slug: 'luxembourg' },
  'md': { name: 'Moldova', code: 'MD', slug: 'moldova' },
  'me': { name: 'Montenegro', code: 'ME', slug: 'montenegro' },
  'mk': { name: 'North Macedonia', code: 'MK', slug: 'north-macedonia' },
  'mt': { name: 'Malta', code: 'MT', slug: 'malta' },
  'pl': { name: 'Poland', code: 'PL', slug: 'poland' },
  'pt': { name: 'Portugal', code: 'PT', slug: 'portugal' },
  'ro': { name: 'Romania', code: 'RO', slug: 'romania' },
  'rs': { name: 'Serbia', code: 'RS', slug: 'serbia' },
  'ru': { name: 'Russia', code: 'RU', slug: 'russia' },
  'si': { name: 'Slovenia', code: 'SI', slug: 'slovenia' },
  'sk': { name: 'Slovakia', code: 'SK', slug: 'slovakia' },
  'tr': { name: 'Turkey', code: 'TR', slug: 'turkey' },
  'ua': { name: 'Ukraine', code: 'UA', slug: 'ukraine' },
  // Americas
  'us': { name: 'United States', code: 'US', slug: 'united-states' },
  'ca': { name: 'Canada', code: 'CA', slug: 'canada' },
  'br': { name: 'Brazil', code: 'BR', slug: 'brazil' },
  'mx': { name: 'Mexico', code: 'MX', slug: 'mexico' },
  'ar': { name: 'Argentina', code: 'AR', slug: 'argentina' },
  'co': { name: 'Colombia', code: 'CO', slug: 'colombia' },
  'cl': { name: 'Chile', code: 'CL', slug: 'chile' },
  // Asia-Pacific
  'au': { name: 'Australia', code: 'AU', slug: 'australia' },
  'nz': { name: 'New Zealand', code: 'NZ', slug: 'new-zealand' },
  'jp': { name: 'Japan', code: 'JP', slug: 'japan' },
  'cn': { name: 'China', code: 'CN', slug: 'china' },
  'in': { name: 'India', code: 'IN', slug: 'india' },
  'sg': { name: 'Singapore', code: 'SG', slug: 'singapore' },
  'kr': { name: 'South Korea', code: 'KR', slug: 'south-korea' },
  'id': { name: 'Indonesia', code: 'ID', slug: 'indonesia' },
  'my': { name: 'Malaysia', code: 'MY', slug: 'malaysia' },
  'th': { name: 'Thailand', code: 'TH', slug: 'thailand' },
  'vn': { name: 'Vietnam', code: 'VN', slug: 'vietnam' },
  'ph': { name: 'Philippines', code: 'PH', slug: 'philippines' },
  'hk': { name: 'Hong Kong', code: 'HK', slug: 'hong-kong' },
  'tw': { name: 'Taiwan', code: 'TW', slug: 'taiwan' },
  'pk': { name: 'Pakistan', code: 'PK', slug: 'pakistan' },
  'kz': { name: 'Kazakhstan', code: 'KZ', slug: 'kazakhstan' },
  // Middle East & Africa
  'il': { name: 'Israel', code: 'IL', slug: 'israel' },
  'ae': { name: 'United Arab Emirates', code: 'AE', slug: 'united-arab-emirates' },
  'sa': { name: 'Saudi Arabia', code: 'SA', slug: 'saudi-arabia' },
  'qa': { name: 'Qatar', code: 'QA', slug: 'qatar' },
  'za': { name: 'South Africa', code: 'ZA', slug: 'south-africa' },
  'eg': { name: 'Egypt', code: 'EG', slug: 'egypt' },
  'ng': { name: 'Nigeria', code: 'NG', slug: 'nigeria' },
  'ke': { name: 'Kenya', code: 'KE', slug: 'kenya' },
  'ma': { name: 'Morocco', code: 'MA', slug: 'morocco' },
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
  'huittinen':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'hyvinkää':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'hyvinkaa':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'hämeenlinna':              { name: 'Finland', code: 'FI', slug: 'finland' },
  'hameenlinna':              { name: 'Finland', code: 'FI', slug: 'finland' },
  'iisalmi':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'imatra':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'joensuu':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'jyväskylä':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'jyvaskyla':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'jämsä':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'jamsa':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'järvenpää':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'jarvenpaa':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'kajaani':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'kangasala':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'kankaanpää':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'karkkila':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'karstula':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'kemi':                     { name: 'Finland', code: 'FI', slug: 'finland' },
  'kerava':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'kirkkonummi':              { name: 'Finland', code: 'FI', slug: 'finland' },
  'kokkola':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'kotka':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'kouvola':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'kuopio':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'lahti':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'lappeenranta':             { name: 'Finland', code: 'FI', slug: 'finland' },
  'lempäälä':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'lempala':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'lohja':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'mikkeli':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'mäntyharju':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'nokia':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'nurmijärvi':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'nurmijarvi':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'oulu':                     { name: 'Finland', code: 'FI', slug: 'finland' },
  'pieksämäki':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'pieksamaki':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'pirkkala':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'pori':                     { name: 'Finland', code: 'FI', slug: 'finland' },
  'porvoo':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'rauma':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'riihimäki':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'riihimaki':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'rovaniemi':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'salo':                     { name: 'Finland', code: 'FI', slug: 'finland' },
  'savonlinna':               { name: 'Finland', code: 'FI', slug: 'finland' },
  'seinäjoki':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'seinajoki':                { name: 'Finland', code: 'FI', slug: 'finland' },
  'sipoo':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'tampere':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'tornio':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'turku':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'vaasa':                    { name: 'Finland', code: 'FI', slug: 'finland' },
  'valkeakoski':              { name: 'Finland', code: 'FI', slug: 'finland' },
  'vantaa':                   { name: 'Finland', code: 'FI', slug: 'finland' },
  'varkaus':                  { name: 'Finland', code: 'FI', slug: 'finland' },
  'ylöjärvi':                 { name: 'Finland', code: 'FI', slug: 'finland' },
  'ylojarvi':                 { name: 'Finland', code: 'FI', slug: 'finland' },
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
  'heidelberg':               { name: 'Germany', code: 'DE', slug: 'germany' },
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
  'pronsfeld':                { name: 'Germany', code: 'DE', slug: 'germany' },
  'regensburg':               { name: 'Germany', code: 'DE', slug: 'germany' },
  'remptendorf':              { name: 'Germany', code: 'DE', slug: 'germany' },
  'rosenheim':                { name: 'Germany', code: 'DE', slug: 'germany' },
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
  'bollnäs':                  { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'borås':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'boras':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'enkoping':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'enköping':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'fors':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'falkenberg':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'gothenburg':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'goteborg':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'goetene':                  { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'götene':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'gävle':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'gavle':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'hamlstad':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'helsingborg':              { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'jönköping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'jonkoping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kalix':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kalmar':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'karlstad':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'kiruna':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'linköping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'linkoping':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'ljusdal':                  { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'lulea':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'luleå':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'lund':                     { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'malmö':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'malmo':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'mölndal':                  { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'norrköping':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'norrkoping':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'örebro':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'orebro':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skelleftea':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skellefteå':               { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skillingaryd':             { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'skoghall':                 { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'solna':                    { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'stockholm':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'sundsvall':                { name: 'Sweden', code: 'SE', slug: 'sweden' },
  'torsby':                   { name: 'Sweden', code: 'SE', slug: 'sweden' },
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
  'fredrikstad':              { name: 'Norway', code: 'NO', slug: 'norway' },
  'grimstad':                 { name: 'Norway', code: 'NO', slug: 'norway' },
  'hafrsfjord':               { name: 'Norway', code: 'NO', slug: 'norway' },
  'oslo':                     { name: 'Norway', code: 'NO', slug: 'norway' },
  'sarpsborg':                { name: 'Norway', code: 'NO', slug: 'norway' },
  'stavanger':                { name: 'Norway', code: 'NO', slug: 'norway' },
  'strommen':                 { name: 'Norway', code: 'NO', slug: 'norway' },
  'strømmen':                 { name: 'Norway', code: 'NO', slug: 'norway' },
  'tromsø':                   { name: 'Norway', code: 'NO', slug: 'norway' },
  'tromso':                   { name: 'Norway', code: 'NO', slug: 'norway' },
  'trondheim':                { name: 'Norway', code: 'NO', slug: 'norway' },
  // ── Denmark ──────────────────────────────────────────────────────────────
  'aalborg':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'aarhus':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'branderup':                { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'christiansfeld':           { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'copenhagen':               { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'esbjerg':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'holster':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'ishoej':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'københavn':                { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'kobenhavn':                { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'krusaa':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'kruså':                    { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'odense':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'taastrup':                 { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'tinglev':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'slagelse':                 { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'viby':                     { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'videbæk':                  { name: 'Denmark', code: 'DK', slug: 'denmark' },
  'vojens':                   { name: 'Denmark', code: 'DK', slug: 'denmark' },
  // ── Netherlands ──────────────────────────────────────────────────────────
  'amsterdam':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'bergen op zoom':           { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'ede':                      { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'eindhoven':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'de lier':                  { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'den haag':                 { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'the hague':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'hilversum':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'den hoorn':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'dronten':                  { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'maastricht':               { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'hoofddorp':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'purmerend':                { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'rj nijkerk':               { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
  'roosendaal':               { name: 'Netherlands', code: 'NL', slug: 'netherlands' },
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
  'pärnu':                    { name: 'Estonia', code: 'EE', slug: 'estonia' },
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
  { urlSubstring: 'academicwork.fi', country: { name: 'Finland', code: 'FI', slug: 'finland' } },
  { urlSubstring: 'sok.wd', country: { name: 'Finland', code: 'FI', slug: 'finland' } },
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

/** Returns true if the string is a known country name or abbreviation (COUNTRY_MAP only, not cities). */
export function isCountryKey(s: string): boolean {
  return normalizeKey(s) in COUNTRY_MAP;
}

/**
 * Looks up a city by checking whether a known CITY_MAP key is a leading word-boundary
 * prefix of the segment. Handles location suffixes like "riga central" → "riga" or
 * "tartu kontor" → "tartu" without requiring every variant to be listed explicitly.
 */
function lookupCityByPrefix(key: string): CountryInfo | undefined {
  for (const [cityKey, info] of Object.entries(CITY_MAP)) {
    if (key.startsWith(cityKey + ' ')) return info;
  }
  return undefined;
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
    const info = CITY_MAP[key] ?? lookupCityByPrefix(key);
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

  // Collect all unique countries found in any segment — check country map first, then city map,
  // then city prefix match (e.g. "riga central" → "riga", "tartu kontor" → "tartu").
  const seen = new Set<string>();
  const results: CountryInfo[] = [];
  for (const segment of segments) {
    const key = normalizeKey(segment);
    const info = COUNTRY_MAP[key] ?? CITY_MAP[key] ?? lookupCityByPrefix(key);
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

  // Try to extract a trailing 2-letter ISO country code, e.g. "Home office DK" → "DK" → Denmark.
  // \b ensures the code is a standalone word, preventing e.g. "bridge" matching "ge".
  const trailingCode = fullKey.match(/\b([a-z]{2})$/);
  if (trailingCode) {
    const codeInfo = COUNTRY_MAP[trailingCode[1]];
    if (codeInfo) return [codeInfo];
  }

  // Try a leading ISO country code — handles two Workday location formats:
  //   "FI - Helsinki" (ISO prefix with dash, used by e.g. Maersk multi-location jobs)
  //   "NLGWV03 - The Hague - De Kroon" (venue code where the first 2 chars are the ISO code)
  const leadingCode = fullKey.match(/^([a-z]{2})(?:\s*-|[a-z0-9]{2,})/);
  if (leadingCode) {
    const codeInfo = COUNTRY_MAP[leadingCode[1]];
    if (codeInfo) return [codeInfo];
  }

  // Try a 3-letter leading ISO code followed by a dash, e.g. "ESP - Madrid" → 'esp' → Spain.
  const leadingCode3 = fullKey.match(/^([a-z]{3})\s*-/);
  if (leadingCode3) {
    const codeInfo = COUNTRY_MAP[leadingCode3[1]];
    if (codeInfo) return [codeInfo];
  }

  return [];
}
