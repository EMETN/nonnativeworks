import type { CountryInfo } from './country-lookup';
import { foldText } from '../text';
import { TRACKED_COUNTRY_CODES } from '../tracked-countries';

export const OUTSIDE_EUROPE: CountryInfo = {
    name: 'Outside Europe',
    code: 'XX',
    slug: 'outside-europe',
};

const country = (name: string, code: string): CountryInfo => ({
    name,
    code,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
});

const US = country('United States', 'US');
const CA = country('Canada', 'CA');
const IN = country('India', 'IN');

const key = (s: string) =>
    foldText(s).toLowerCase().trim().replace(/\s+/g, ' ');

const US_STATES: Record<string, string> = {
    AL: 'Alabama',
    AK: 'Alaska',
    AZ: 'Arizona',
    AR: 'Arkansas',
    CA: 'California',
    CO: 'Colorado',
    CT: 'Connecticut',
    DE: 'Delaware',
    DC: 'District of Columbia',
    FL: 'Florida',
    GA: 'Georgia',
    HI: 'Hawaii',
    ID: 'Idaho',
    IL: 'Illinois',
    IN: 'Indiana',
    IA: 'Iowa',
    KS: 'Kansas',
    KY: 'Kentucky',
    LA: 'Louisiana',
    ME: 'Maine',
    MD: 'Maryland',
    MA: 'Massachusetts',
    MI: 'Michigan',
    MN: 'Minnesota',
    MS: 'Mississippi',
    MO: 'Missouri',
    MT: 'Montana',
    NE: 'Nebraska',
    NV: 'Nevada',
    NH: 'New Hampshire',
    NJ: 'New Jersey',
    NM: 'New Mexico',
    NY: 'New York',
    NC: 'North Carolina',
    ND: 'North Dakota',
    OH: 'Ohio',
    OK: 'Oklahoma',
    OR: 'Oregon',
    PA: 'Pennsylvania',
    RI: 'Rhode Island',
    SC: 'South Carolina',
    SD: 'South Dakota',
    TN: 'Tennessee',
    TX: 'Texas',
    UT: 'Utah',
    VT: 'Vermont',
    VA: 'Virginia',
    WA: 'Washington',
    WV: 'West Virginia',
    WI: 'Wisconsin',
    WY: 'Wyoming',
};

const CA_PROVINCES: Record<string, string> = {
    AB: 'Alberta',
    BC: 'British Columbia',
    MB: 'Manitoba',
    NB: 'New Brunswick',
    NL: 'Newfoundland and Labrador',
    NS: 'Nova Scotia',
    NT: 'Northwest Territories',
    NU: 'Nunavut',
    ON: 'Ontario',
    PE: 'Prince Edward Island',
    QC: 'Quebec',
    SK: 'Saskatchewan',
    YT: 'Yukon',
};

const NAMED_PLACES = new Map<string, CountryInfo>();
const add = (info: CountryInfo, names: string[]) => {
    for (const name of names) NAMED_PLACES.set(key(name), info);
};

add(US, Object.values(US_STATES));
add(CA, Object.values(CA_PROVINCES));
add(US, [
    'Austin',
    'New York',
    'New York City',
    'San Francisco',
    'Seattle',
    'Boston',
    'Chicago',
    'Los Angeles',
    'San Diego',
    'San Jose',
    'Denver',
    'Atlanta',
    'Dallas',
    'Houston',
    'Miami',
    'Washington DC',
]);
add(CA, ['Toronto', 'Vancouver', 'Montreal', 'Ottawa', 'Calgary']);
add(IN, [
    'Bangalore',
    'Bengaluru',
    'Hyderabad',
    'Pune',
    'Mumbai',
    'Delhi',
    'New Delhi',
    'Chennai',
    'Gurgaon',
    'Gurugram',
    'Noida',
]);
add(country('Singapore', 'SG'), ['Singapore']);
add(country('Japan', 'JP'), ['Tokyo']);
add(country('Australia', 'AU'), ['Sydney', 'Melbourne']);
add(country('Brazil', 'BR'), ['Sao Paulo']);
add(country('Mexico', 'MX'), ['Mexico City']);
add(country('Argentina', 'AR'), ['Buenos Aires']);
add(country('Israel', 'IL'), ['Tel Aviv']);
add(country('United Arab Emirates', 'AE'), ['Dubai']);
add(OUTSIDE_EUROPE, [
    'APAC',
    'LATAM',
    'Americas',
    'North America',
    'Asia',
    'Africa',
]);

const GROUPS: Record<string, string[]> = {
    nordics: ['SE', 'NO', 'DK', 'FI', 'IS'],
    'nordic countries': ['SE', 'NO', 'DK', 'FI', 'IS'],
    dach: ['DE', 'AT', 'CH'],
    benelux: ['BE', 'NL', 'LU'],
    baltics: ['EE', 'LV', 'LT'],
    'baltic states': ['EE', 'LV', 'LT'],
};

const GROUP_MEMBERS: Record<string, CountryInfo> = {
    SE: country('Sweden', 'SE'),
    NO: country('Norway', 'NO'),
    DK: country('Denmark', 'DK'),
    FI: country('Finland', 'FI'),
    IS: country('Iceland', 'IS'),
    DE: country('Germany', 'DE'),
    AT: country('Austria', 'AT'),
    CH: country('Switzerland', 'CH'),
    BE: country('Belgium', 'BE'),
    NL: country('Netherlands', 'NL'),
    LU: country('Luxembourg', 'LU'),
    EE: country('Estonia', 'EE'),
    LV: country('Latvia', 'LV'),
    LT: country('Lithuania', 'LT'),
};

export function lookupWorldPlace(segment: string): CountryInfo | undefined {
    return NAMED_PLACES.get(key(segment));
}

/** Codes shared with a tracked country (DE, IS) never count. */
export function lookupStateCode(code: string): CountryInfo | undefined {
    const upper = code.trim().toUpperCase();
    if (TRACKED_COUNTRY_CODES.has(upper)) return undefined;
    if (upper in US_STATES) return US;
    if (upper in CA_PROVINCES) return CA;
    return undefined;
}

export function expandCountryGroup(segment: string): CountryInfo[] {
    const members = GROUPS[key(segment)] ?? [];
    return members
        .filter((code) => TRACKED_COUNTRY_CODES.has(code))
        .map((code) => GROUP_MEMBERS[code]);
}
