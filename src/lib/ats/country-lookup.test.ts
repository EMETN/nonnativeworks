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
