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
