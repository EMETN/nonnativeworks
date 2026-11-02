// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe } from 'vitest';
import {
    extractCitiesForCountry,
    extractWorkModelFromLocation,
    lookupCountryFromLocation,
    resolveJobCities,
    canonicalCityNames,
} from './country-lookup';

const codes = (loc: string) =>
    lookupCountryFromLocation(loc)
        .map((c) => c.code)
        .sort();

describe('lookupCountryFromLocation — trailing country token', () => {
    // Ashby locations for companies that prefix the org name and have no structured
    // addressCountry, e.g. Mapbox names its remote-Germany location "Mapbox Germany".
    test('resolves a country that trails an org-name prefix', () => {
        expect(codes('Mapbox Germany')).toEqual(['DE']);
        expect(codes('Mapbox Poland')).toEqual(['PL']);
    });

    test('resolves a multi-word country trailing a prefix', () => {
        expect(codes('Mapbox United Kingdom')).toEqual(['GB']);
    });
});

describe('lookupCountryFromLocation — no false positives from token scan', () => {
    test('does not match short ISO-code substrings hidden in words', () => {
        // "in", "at", "no", "is" are COUNTRY_MAP keys; they must not match as bare tokens.
        expect(codes('Work in a great team')).toEqual([]);
        expect(codes('Great place at heart')).toEqual([]);
    });

    test('still returns nothing for genuinely unknown locations', () => {
        expect(codes('Somewhere Unknown')).toEqual([]);
    });
});

describe('lookupCountryFromLocation — existing behaviour still holds', () => {
    test('clean country names resolve', () => {
        expect(codes('Germany')).toEqual(['DE']);
        expect(codes('Finland')).toEqual(['FI']);
    });

    test('cities resolve', () => {
        expect(codes('Helsinki')).toEqual(['FI']);
    });
});

// This function runs for every company on every ATS, so the n-gram fallback the branch
// appended must stay a last resort: never changing the "City, Country" and remote/aggregate
// shapes other companies already produce.
describe('lookupCountryFromLocation — n-gram fallback does not disturb other companies', () => {
    test('structured "City, Country" strings resolve unchanged', () => {
        expect(codes('Berlin, Germany')).toEqual(['DE']);
        expect(codes('Stockholm, Sweden')).toEqual(['SE']);
        expect(codes('Amsterdam, Netherlands')).toEqual(['NL']);
        expect(codes('Paris, France')).toEqual(['FR']);
        expect(codes('London, United Kingdom')).toEqual(['GB']);
    });

    test('common non-country location labels still resolve to nothing', () => {
        for (const label of [
            'Remote',
            'Multiple Locations',
            'EMEA',
            'Various',
            'Hybrid',
            'Remote - Europe',
            'Anywhere',
            'Global',
        ]) {
            expect(codes(label)).toEqual([]);
        }
    });
});

// Dentsu's Workday lists bare city names in additionalLocations; unknown ones are
// silently dropped when another location in the same posting resolves.
describe('lookupCountryFromLocation — bare Workday city names', () => {
    test('Bulgarian and Portuguese delivery-centre cities resolve', () => {
        expect(codes('Sofia')).toEqual(['BG']);
        expect(codes('Leiria')).toEqual(['PT']);
        expect(codes('Vila Real')).toEqual(['PT']);
        expect(codes('Guarda')).toEqual(['PT']);
    });

    test('a repeated bare city resolves once', () => {
        expect(codes('Niort; Niort')).toEqual(['FR']);
    });

    test('Doctolib locations resolve', () => {
        expect(codes('Wuppertal')).toEqual(['DE']);
        expect(codes('Ile-de-France')).toEqual(['FR']);
        expect(codes('Île-de-France')).toEqual(['FR']);
    });
});

describe('lookupCountryFromLocation — "City, XX" code qualifies the city', () => {
    test.each([
        ['San Francisco, CA', ['US']],
        ['Boston, MA', ['US']],
        ['Seattle, WA', ['US']],
    ])('%s → %j', (loc, expected) => {
        expect(codes(loc)).toEqual(expected);
    });

    test('a code that agrees with the city still resolves', () => {
        expect(codes('Dublin, IE')).toEqual(['IE']);
        expect(codes('Zürich, CH')).toEqual(['CH']);
    });

    test('each pipe/semicolon part is judged on its own', () => {
        expect(
            codes(
                'Boston, MA; San Francisco, CA | Munich, Germany; Zürich, CH',
            ),
        ).toEqual(['CH', 'DE', 'US']);
    });

    test('a bare code with no city before it is still a country', () => {
        expect(codes('Remote, DE')).toEqual(['DE']);
        expect(codes('DE')).toEqual(['DE']);
    });

    test('a country named later in the part outranks a colliding code', () => {
        expect(codes('Smyrna, DE, USA')).toEqual(['US']);
        expect(codes("St. John's, NL, Canada")).toEqual(['CA']);
    });

    test('a known US city outranks a colliding code', () => {
        expect(codes('Wilmington, DE')).toEqual(['US']);
    });

    test('an unknown city with a bare DE still defaults to Germany', () => {
        expect(codes('Walldorf, DE')).toEqual(['DE']);
        expect(codes('Berlin, DE')).toEqual(['DE']);
    });

    test('Saskatchewan cities outrank the SK code', () => {
        expect(codes('Regina, SK')).toEqual(['CA']);
        expect(codes('Saskatoon, SK')).toEqual(['CA']);
    });

    test('Slovak cities resolve with or without diacritics', () => {
        expect(codes('Bratislava, SK')).toEqual(['SK']);
        expect(codes('Košice, SK')).toEqual(['SK']);
        expect(codes('Košice')).toEqual(['SK']);
        expect(codes('Žilina')).toEqual(['SK']);
        expect(codes('Zilina')).toEqual(['SK']);
    });
});

describe('lookupCountryFromLocation — Washington DC', () => {
    test('resolves without a comma', () => {
        expect(codes('Washington DC')).toEqual(['US']);
        expect(codes('Washington, DC')).toEqual(['US']);
    });
});

describe('lookupCountryFromLocation — Czechia', () => {
    test('both the short and long names resolve to the canonical Czechia entry', () => {
        for (const loc of [
            'Czechia',
            'Czech Republic',
            'Prague, Czech Republic',
            'Brno, Czechia',
        ]) {
            expect(lookupCountryFromLocation(loc)).toEqual([
                { name: 'Czechia', code: 'CZ', slug: 'czechia' },
            ]);
        }
    });
});

describe('canonicalCityNames', () => {
    test('replaces a local name with its English name', () => {
        expect(canonicalCityNames(['München', 'Wien'])).toEqual([
            'Munich',
            'Vienna',
        ]);
    });

    test('merges a local and English name for the same city', () => {
        expect(canonicalCityNames(['Antwerpen', 'Antwerp'])).toEqual([
            'Antwerp',
        ]);
    });

    test('drops a team suffix from the city', () => {
        expect(canonicalCityNames(['Berlin Tech', 'Berlin'])).toEqual([
            'Berlin',
        ]);
    });

    test('leaves other cities unchanged', () => {
        expect(canonicalCityNames(['Mo i Rana'])).toEqual(['Mo i Rana']);
    });
});

describe('lookupCountryFromLocation — city prefix matches', () => {
    test('ignores a city prefix when the location names its country', () => {
        expect(codes('Porto Seguro, Bahia, Brazil')).toEqual(['BR']);
    });

    test('keeps a city prefix when nothing else resolves', () => {
        expect(codes('Riga Central')).toEqual(['LV']);
    });

    test('resolves each semicolon-separated location on its own', () => {
        expect(codes('Porto Seguro, Brazil; Riga Central')).toEqual([
            'BR',
            'LV',
        ]);
    });
});

test('resolves Campobasso without a country in the location', () => {
    expect(codes('Campobasso')).toEqual(['IT']);
});

describe('extractCitiesForCountry', () => {
    test('reads the city from "Country (City)"', () => {
        expect(extractCitiesForCountry('Norway (Oslo)', 'NO')).toEqual([
            'Oslo',
        ]);
        expect(
            extractCitiesForCountry(
                'England, United Kingdom; Germany; Norway (Oslo)',
                'NO',
            ),
        ).toEqual(['Oslo']);
    });

    test('takes no city from a work mode in parentheses', () => {
        expect(extractCitiesForCountry('Norway (remote)', 'NO')).toEqual([]);
    });

    test('takes no city from a venue in parentheses', () => {
        expect(
            extractCitiesForCountry(
                'KQB (Amsterdam - Herengracht 578-58)',
                'NL',
            ),
        ).toEqual([]);
    });

    test('keeps every city of a multi-location posting', () => {
        expect(
            extractCitiesForCountry(
                'Agen, Lot-et-Garonne, France; Arcachon, Gironde, France',
                'FR',
            ),
        ).toEqual(['Agen', 'Arcachon']);
    });

    test('drops the HQ suffix from a city', () => {
        expect(extractCitiesForCountry('Dublin; Helsinki HQ', 'FI')).toEqual([
            'Helsinki',
        ]);
    });

    test('keeps unknown cities alongside known ones', () => {
        expect(
            extractCitiesForCountry(
                'Bordeaux, Gironde, France; Niort, Deux-Sèvres, France',
                'FR',
            ),
        ).toEqual(['Bordeaux', 'Niort']);
    });

    test('ignores cities in other countries', () => {
        expect(
            extractCitiesForCountry('Agen, France; Berlin, Germany', 'FR'),
        ).toEqual(['Agen']);
    });

    test('does not treat a work mode as a city', () => {
        expect(
            extractCitiesForCountry('Berlin, Germany; Remote, Germany', 'DE'),
        ).toEqual(['Berlin']);
    });

    test('reads Luxembourg as a city in its own country', () => {
        expect(
            extractCitiesForCountry('Luxembourg, Luxembourg, Luxembourg', 'LU'),
        ).toEqual(['Luxembourg']);
    });

    test('finds no city in a bare country', () => {
        expect(extractCitiesForCountry('Netherlands', 'NL')).toEqual([]);
    });
});

test('reads the work model from a leading comma segment', () => {
    expect(extractWorkModelFromLocation('Remote, Germany')).toBe('remote');
});

describe('resolveJobCities', () => {
    test('falls back to the location when the supplied city is in another country', () => {
        expect(
            resolveJobCities(
                { city: 'Stockholm', location: 'Warsaw, Poland' },
                'PL',
            ),
        ).toEqual(['Warsaw']);
    });

    test('leaves no city when only the country is known', () => {
        expect(
            resolveJobCities({ city: 'Bratislava', location: 'Poland' }, 'PL'),
        ).toEqual([]);
    });

    test('keeps only the cities of the given country', () => {
        expect(
            resolveJobCities(
                { cities: ['Stockholm', 'Warsaw', 'Krakow'], location: '' },
                'PL',
            ),
        ).toEqual(['Warsaw', 'Kraków']);
    });

    test('keeps a supplied city missing from the lookup', () => {
        expect(
            resolveJobCities({ city: 'Mo i Rana', location: 'Norway' }, 'NO'),
        ).toEqual(['Mo i Rana']);
    });

    test.each([
        ['Drôme', 'FR'],
        ['Liège', 'BE'],
    ])('keeps %s, whose ending looks like a country code', (city, code) => {
        expect(resolveJobCities({ city }, code)).toEqual([city]);
    });

    test('translates the supplied city to English', () => {
        expect(resolveJobCities({ city: 'Warszawa' }, 'PL')).toEqual([
            'Warsaw',
        ]);
    });

    test('extracts from the location when no city is supplied', () => {
        expect(
            resolveJobCities(
                { location: 'Helsinki, Finland; Tallinn, Estonia' },
                'EE',
            ),
        ).toEqual(['Tallinn']);
    });
});

describe('canonicalCityNames spelling', () => {
    test.each([
        ['Krakow', 'Kraków'],
        ['KRAKÓW', 'Kraków'],
        ['Wroclaw', 'Wrocław'],
        ['Gdansk', 'Gdańsk'],
        ['POZNAŃ', 'Poznań'],
        ['Lodz', 'Łódź'],
        ['RZESZÓW', 'Rzeszów'],
        ['Elblag', 'Elbląg'],
        ['Dusseldorf', 'Düsseldorf'],
        ['MALMO', 'Malmö'],
        ['Orleans', 'Orléans'],
        ['SAINT-ETIENNE', 'Saint-Étienne'],
        ['Rīga', 'Riga'],
        ['Saint Nazaire', 'Saint-Nazaire'],
        ['Sophia-Antipolis', 'Sophia Antipolis'],
    ])('spells %s as %s', (raw, expected) => {
        expect(canonicalCityNames([raw])).toEqual([expected]);
    });

    test.each([
        ['KATOWICE', 'Katowice'],
        ['TCZEW', 'Tczew'],
        ['lummen', 'Lummen'],
        ['LE MANS', 'Le Mans'],
        ['ST LAURENT DU VAR', 'St Laurent du Var'],
    ])('fixes the case of %s', (raw, expected) => {
        expect(canonicalCityNames([raw])).toEqual([expected]);
    });

    test('merges every spelling of a city', () => {
        expect(
            canonicalCityNames(['Krakow', 'KRAKÓW', 'Kraków', 'Krakow Area']),
        ).toEqual(['Kraków']);
    });

    test('keeps a parenthesised part of the real name', () => {
        expect(canonicalCityNames(['Halle (Saale)'])).toEqual([
            'Halle (Saale)',
        ]);
    });

    test.each([
        ['Frankfurt am Main', 'Frankfurt am Main'],
        ['Frankfurt Am Main', 'Frankfurt am Main'],
        ['Frankfurt / Main', 'Frankfurt am Main'],
        ['Frankfurt/Main', 'Frankfurt am Main'],
        ['Mo i Rana', 'Mo i Rana'],
    ])('does not shorten %s', (raw, expected) => {
        expect(canonicalCityNames([raw])).toEqual([expected]);
    });
});

describe('canonicalCityNames noise', () => {
    test.each([
        ['Krakow_OLD', 'Kraków'],
        ['Contern_EXC', 'Contern'],
        ['Toulouse Area', 'Toulouse'],
        ['München Area', 'Munich'],
        ['Copenhagen Office', 'Copenhagen'],
        ['Helsinki Metropolitan Area', 'Helsinki'],
        ['Prague 6', 'Prague'],
        ['Praha 13', 'Prague'],
        ['PARIS 9ème', 'Paris'],
        ['PARIS CEDEX 16', 'Paris'],
        ['MARSEILLE 08', 'Marseille'],
        ['Copenhagen V, Denmark', 'Copenhagen'],
        ['Munich, Germany', 'Munich'],
        ['Zwycięstwa 23, 44-100 Gliwice', 'Gliwice'],
        ['Paris - 67 avenue Wagram', 'Paris'],
        ['Sofia-  Srebarna 16', 'Sofia'],
        ['Augsburg Karl-Drais-Str. 5', 'Augsburg'],
        ['Bruxelles Avenue Marnix (ING)', 'Brussels'],
        ['France - Lyon - Lyon (Edenred France)', 'Lyon'],
        ['PSS – Lisbon (Central)', 'Lisbon'],
        ['Stockholm - Home Based', 'Stockholm'],
        ['Mapbox Helsinki', 'Helsinki'],
        ['45300 Bouilly en Gatinais', 'Bouilly en Gatinais'],
        ['LYON 6EME', 'Lyon'],
        ['Amersfoort CDI', 'Amersfoort'],
    ])('reduces %s to %s', (raw, expected) => {
        expect(canonicalCityNames([raw])).toEqual([expected]);
    });

    test.each([
        ['PB_Cen_Katowice (ul. Sokolska 34)', 'Katowice'],
        [
            'PB_Det/Korp_Zielona Góra (ul. Bohaterów Westerplatte 19)',
            'Zielona Góra',
        ],
        ['PB_Korp_Łódź (ul. Kopcińskiego 73/75)', 'Łódź'],
        ['Warszawa (Pańska 97)', 'Warsaw'],
        ['CDR (Amsterdam - Cedar)', 'Amsterdam'],
    ])('reads the city from the ING branch code %s', (raw, expected) => {
        expect(canonicalCityNames([raw])).toEqual([expected]);
    });

    test.each([
        ['85748'],
        ['Remote'],
        ['Poland'],
        ['Mapbox Poland'],
        ['Remote - Spain'],
        ['Remote Germany'],
        ['Germany - Home Based'],
        ['Województwo pomorskie'],
        ['Flexible location'],
    ])('treats %s as no city', (raw) => {
        expect(canonicalCityNames([raw])).toEqual([]);
    });

    test('reduces Offshore Poland to Offshore', () => {
        expect(canonicalCityNames(['Offshore Poland'])).toEqual(['Offshore']);
    });

    test('prefers a real location over Offshore', () => {
        expect(canonicalCityNames(['Offshore Poland', 'Łeba'])).toEqual([
            'Łeba',
        ]);
    });
});

test('falls back to the location when the supplied city is not a city', () => {
    expect(
        resolveJobCities(
            { city: '85748', location: 'Garching, Germany' },
            'DE',
        ),
    ).toEqual(['Garching']);
});
