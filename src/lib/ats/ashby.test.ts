// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe } from 'vitest';
import { mapAshbyPosting } from './ashby';
import { lookupCountryFromLocation } from './country-lookup';

// Resolve the RawJobs a posting maps to into the set of country codes they land in,
// which is what buildScrapeResult ultimately groups by.
const resolvedCodes = (posting: Parameters<typeof mapAshbyPosting>[0]) =>
    [
        ...new Set(
            mapAshbyPosting(posting).flatMap((job) =>
                lookupCountryFromLocation(job.location ?? '').map(
                    (c) => c.code,
                ),
            ),
        ),
    ].sort();

const base = { id: 'x', title: 'Engineer', jobUrl: 'https://example.com/x' };

describe('mapAshbyPosting — multi-country primary attribution', () => {
    // Mapbox lists Germany as the primary location (no structured addressCountry) with
    // the other countries as structured secondaries. The primary must not be dropped.
    test('keeps the primary country alongside structured secondaries', () => {
        const posting = {
            ...base,
            location: 'Mapbox Germany',
            secondaryLocations: [
                {
                    location: 'Mapbox Helsinki',
                    address: { postalAddress: { addressCountry: 'Finland' } },
                },
                {
                    location: 'Mapbox Poland',
                    address: { postalAddress: { addressCountry: 'Poland' } },
                },
                {
                    location: 'Mapbox UK',
                    address: {
                        postalAddress: { addressCountry: 'United Kingdom' },
                    },
                },
            ],
        };
        expect(resolvedCodes(posting)).toEqual(['DE', 'FI', 'GB', 'PL']);
    });

    test('keeps the primary alongside a mix of structured and bare secondaries', () => {
        const posting = {
            ...base,
            location: 'Mapbox Germany',
            secondaryLocations: [
                { location: 'Finland' },
                {
                    location: 'Mapbox UK',
                    address: {
                        postalAddress: { addressCountry: 'United Kingdom' },
                    },
                },
            ],
        };
        expect(resolvedCodes(posting)).toEqual(['DE', 'FI', 'GB']);
    });

    // Guard against double-counting: when the primary duplicates a secondary's country,
    // it must not add a second position for that country.
    test('does not double-count when the primary duplicates a secondary', () => {
        const posting = {
            ...base,
            location: 'Helsinki',
            address: { postalAddress: { addressCountry: 'Finland' } },
            secondaryLocations: [
                {
                    location: 'Espoo',
                    address: { postalAddress: { addressCountry: 'Finland' } },
                },
                {
                    location: 'Oslo',
                    address: { postalAddress: { addressCountry: 'Norway' } },
                },
            ],
        };
        const jobs = mapAshbyPosting(posting);
        const fiCount = jobs.filter(
            (j) =>
                lookupCountryFromLocation(j.location ?? '')[0]?.code === 'FI',
        ).length;
        expect(fiCount).toBe(1);
        expect(resolvedCodes(posting)).toEqual(['FI', 'NO']);
    });
});

describe('mapAshbyPosting — single location still works', () => {
    test('remote primary with no secondaries resolves to its country', () => {
        const posting = { ...base, location: 'Mapbox Germany' };
        expect(resolvedCodes(posting)).toEqual(['DE']);
    });
});
