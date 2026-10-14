// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe } from 'vitest';
import { lookupCountryFromLocation } from './country-lookup';

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
