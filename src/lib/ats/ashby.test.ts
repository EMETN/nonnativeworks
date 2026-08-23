// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe, vi, afterEach } from 'vitest';
import { fetchAshbyJobsAndCompanyName, mapAshbyPosting } from './ashby';
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

const mockAshby = (jobs: unknown[]) =>
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ apiVersion: '1', jobs }),
        })),
    );

afterEach(() => vi.unstubAllGlobals());

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

describe('fetchAshbyJobsAndCompanyName — excludes unlisted postings', () => {
    // Ashby's job-board endpoint returns unlisted postings (isListed: false) alongside
    // listed ones. These 404 on the public board (e.g. Supercell's "Unlisted TEST job")
    // so they must never reach our data.
    const listed = {
        id: 'a',
        title: 'Listed role',
        jobUrl: 'https://jobs.ashbyhq.com/x/a',
        location: 'Helsinki',
        isListed: true,
    };
    const unlisted = {
        id: 'b',
        title: 'Unlisted TEST job - do not delete',
        jobUrl: 'https://jobs.ashbyhq.com/x/b',
        location: 'Helsinki',
        isListed: false,
    };
    const noFlag = {
        id: 'c',
        title: 'Role with no isListed field',
        jobUrl: 'https://jobs.ashbyhq.com/x/c',
        location: 'Helsinki',
    };

    test('drops postings flagged isListed: false', async () => {
        mockAshby([listed, unlisted]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('x');
        expect(jobs.map((j) => j.title)).toEqual(['Listed role']);
    });

    test('keeps postings that omit isListed (defensive default)', async () => {
        mockAshby([noFlag, unlisted]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('x');
        expect(jobs.map((j) => j.title)).toEqual([
            'Role with no isListed field',
        ]);
    });
});

describe('fetchAshbyJobsAndCompanyName — custom-domain job URLs', () => {
    // Supercell hosts its board only on supercell.com and disables the
    // jobs.ashbyhq.com page, so posting.jobUrl 404s. We rebuild it as
    // {base}/{title-slug}/{id}/ (the slug format is confirmed against a live URL).
    const posting = (id: string, title: string) => ({
        id,
        title,
        jobUrl: `https://jobs.ashbyhq.com/supercell/${id}`,
        location: 'Helsinki',
        isListed: true,
    });

    test('rewrites Supercell URLs to the supercell.com pattern', async () => {
        mockAshby([
            posting(
                'b6b6d432-e4dc-41de-a814-7dee7f1d0adc',
                'Competitive Experience Manager, Clash Royale',
            ),
        ]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('supercell');
        expect(jobs[0].url).toBe(
            'https://supercell.com/en/careers/competitive-experience-manager-clash-royale/b6b6d432-e4dc-41de-a814-7dee7f1d0adc/',
        );
    });

    // Ground-truth slugs from live supercell.com URLs. Punctuation is dropped, not
    // hyphenated: "R.I.S.E" becomes "rise" and "&" vanishes (its spaces collapse to
    // one hyphen). A naive "every non-alphanumeric to a hyphen" rule gets these wrong.
    test.each([
        ['Product Lead, Project R.I.S.E', 'product-lead-project-rise'],
        [
            'Senior Product Manager, Live Ops & Monetization, Hay Day',
            'senior-product-manager-live-ops-monetization-hay-day',
        ],
        [
            'Senior Product Manager, LiveOps & Monetization, Clash Royale',
            'senior-product-manager-liveops-monetization-clash-royale',
        ],
        [
            'Gameplay Capture & Video Artist, Creative Studio',
            'gameplay-capture-video-artist-creative-studio',
        ],
    ])('slugifies %j to match the live URL', async (title, slug) => {
        mockAshby([posting('id1', title)]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('supercell');
        expect(jobs[0].url).toBe(
            `https://supercell.com/en/careers/${slug}/id1/`,
        );
    });

    test('leaves other companies on their jobs.ashbyhq.com URL', async () => {
        mockAshby([posting('z', 'Engineer')]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('someotherco');
        expect(jobs[0].url).toBe('https://jobs.ashbyhq.com/supercell/z');
    });
});

// The isListed filter and primary-location merge run for every Ashby company, not just
// the two this branch added — these pin an ordinary board (e.g. Reaktor) as unchanged.
describe('regression — other Ashby companies stay intact', () => {
    const listed = (id: string, extra: Record<string, unknown> = {}) => ({
        id,
        title: `Role ${id}`,
        jobUrl: `https://jobs.ashbyhq.com/reaktor/${id}`,
        location: 'Helsinki',
        isListed: true,
        ...extra,
    });

    test('a fully-listed board returns every posting (filter drops nothing)', async () => {
        mockAshby([listed('a'), listed('b'), listed('c')]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('reaktor');
        expect(jobs.map((j) => j.title)).toEqual([
            'Role a',
            'Role b',
            'Role c',
        ]);
    });

    test('a board whose postings omit isListed returns every posting', async () => {
        const noFlag = (id: string) => {
            const p = listed(id);
            delete (p as { isListed?: boolean }).isListed;
            return p;
        };
        mockAshby([noFlag('a'), noFlag('b')]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('reaktor');
        expect(jobs).toHaveLength(2);
    });

    test('a non-Supercell company keeps its jobs.ashbyhq.com URL untouched', async () => {
        mockAshby([listed('a')]);
        const { jobs } = await fetchAshbyJobsAndCompanyName('reaktor');
        expect(jobs[0].url).toBe('https://jobs.ashbyhq.com/reaktor/a');
    });

    test('a structured single-location posting resolves to its country and city', () => {
        const posting = {
            ...base,
            location: 'Helsinki',
            address: {
                postalAddress: {
                    addressCountry: 'Finland',
                    addressLocality: 'Helsinki',
                },
            },
        };
        const jobs = mapAshbyPosting(posting);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].location).toBe('Finland');
        expect(jobs[0].city).toBe('Helsinki');
    });

    test('secondaries in one country merge their cities into a single entry', () => {
        const posting = {
            ...base,
            secondaryLocations: [
                {
                    location: 'Helsinki',
                    address: {
                        postalAddress: {
                            addressCountry: 'Finland',
                            addressLocality: 'Helsinki',
                        },
                    },
                },
                {
                    location: 'Tampere',
                    address: {
                        postalAddress: {
                            addressCountry: 'Finland',
                            addressLocality: 'Tampere',
                        },
                    },
                },
            ],
        };
        const jobs = mapAshbyPosting(posting);
        expect(jobs).toHaveLength(1);
        expect(jobs[0].location).toBe('Finland');
        expect(jobs[0].cities).toEqual(['Helsinki', 'Tampere']);
    });

    test('a primary summarising a secondary produces no duplicate country', () => {
        const posting = {
            ...base,
            location: 'Berlin',
            address: { postalAddress: { addressCountry: 'Germany' } },
            secondaryLocations: [
                {
                    address: {
                        postalAddress: {
                            addressCountry: 'Germany',
                            addressLocality: 'Berlin',
                        },
                    },
                },
                {
                    address: {
                        postalAddress: {
                            addressCountry: 'Netherlands',
                            addressLocality: 'Amsterdam',
                        },
                    },
                },
                {
                    address: {
                        postalAddress: {
                            addressCountry: 'Finland',
                            addressLocality: 'Helsinki',
                        },
                    },
                },
            ],
        };
        expect(mapAshbyPosting(posting)).toHaveLength(3);
        expect(resolvedCodes(posting)).toEqual(['DE', 'FI', 'NL']);
    });
});
