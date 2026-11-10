// Run once:  pnpm test
// Watch mode: pnpm test:watch

import { test, expect, describe, vi, afterEach } from 'vitest';
import { fetchCompanyApiJobs } from './company-api-fetcher';
import { COMPANY_APIS } from './company-apis';

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

// Serves `total` positions in pages of `size`, keyed off the `start` offset param.
// With countInBody, every response also reports `count: total`.
const mockOffsetApi = (total: number, size: number, countInBody = true) =>
    vi.fn(async (url: string) => {
        const start = Number(new URL(url).searchParams.get('start') ?? '0');
        const positions: Record<string, unknown>[] = [];
        for (let i = start; i < Math.min(start + size, total); i++) {
            positions.push({
                name: `Job ${i}`,
                location: 'Helsinki,Finland',
                canonicalPositionUrl: `https://explore.jobs.netflix.net/careers/job/${i}`,
                id: i,
            });
        }
        return {
            ok: true,
            status: 200,
            json: async () =>
                countInBody ? { positions, count: total } : { positions },
        };
    });

describe('fields.locations', () => {
    const mockApi = (positions: Record<string, unknown>[]) =>
        vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ positions }),
        }));
    const config = (fields: Record<string, string>) => ({
        url: 'https://careers.example.com/api/search',
        pagination: { type: 'none' as const },
        itemsPath: 'positions',
        fields: { title: 'name', url: 'positionUrl', ...fields },
    });

    test('joins every location of a multi-country posting into job.location', async () => {
        vi.stubGlobal(
            'fetch',
            mockApi([
                {
                    name: 'Cloud Architect',
                    positionUrl: 'https://careers.example.com/job/1',
                    locations: [
                        'Germany, Hessen, Frankfurt',
                        'Netherlands, North Holland, Amsterdam',
                    ],
                },
            ]),
        );

        const jobs = await fetchCompanyApiJobs(
            config({ locations: 'locations' }),
        );

        expect(jobs[0].location).toBe(
            'Germany, Hessen, Frankfurt; Netherlands, North Holland, Amsterdam',
        );
    });

    test('falls back to fields.location when the locations array is missing', async () => {
        vi.stubGlobal(
            'fetch',
            mockApi([
                {
                    name: 'Cloud Architect',
                    positionUrl: 'https://careers.example.com/job/1',
                    location: 'Helsinki, Finland',
                },
            ]),
        );

        const jobs = await fetchCompanyApiJobs(
            config({ locations: 'locations', location: 'location' }),
        );

        expect(jobs[0].location).toBe('Helsinki, Finland');
    });
});

describe('repeatFor with fields.locations', () => {
    test('keeps each posting once with its own locations instead of tagging the queried country', async () => {
        const postings: Record<string, string[]> = {
            Netherlands: ['Belgium, Brussels Region, Brussels'], // leaked neighbour
            Belgium: [
                'Belgium, Brussels Region, Brussels',
                'Germany, Hessen, Frankfurt',
            ],
        };
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => ({
                ok: true,
                status: 200,
                json: async () => ({
                    positions: [
                        {
                            id: 7,
                            name: 'Consultant',
                            positionUrl: 'https://careers.example.com/job/7',
                            locations:
                                postings[
                                    new URL(url).searchParams.get('location')!
                                ],
                        },
                    ],
                }),
            })),
        );

        const jobs = await fetchCompanyApiJobs({
            url: 'https://careers.example.com/api/search?domain=x',
            pagination: { type: 'none' },
            itemsPath: 'positions',
            fields: {
                title: 'name',
                url: 'positionUrl',
                id: 'id',
                locations: 'locations',
            },
            repeatFor: {
                body: [{ location: 'Netherlands' }, { location: 'Belgium' }],
            },
        });

        // Found under both queries, but one job — and neither query's country is forced on it.
        expect(jobs).toHaveLength(1);
        expect(jobs[0].country_code).toBeUndefined();
        expect(jobs[0].sourceId).toBe('7');
    });
});

describe('offset pagination — large boards', () => {
    // Regression: a board spanning 51 pages of 10 (past the old 50-page cap) must keep its final page.
    test('fetches every page when a board exceeds 50 pages of 10', async () => {
        vi.useFakeTimers();
        const TOTAL = 506;
        const SIZE = 10;
        const fetchMock = mockOffsetApi(TOTAL, SIZE);
        vi.stubGlobal('fetch', fetchMock);

        const promise = fetchCompanyApiJobs(
            COMPANY_APIS['explore.jobs.netflix.net'],
        );
        await vi.runAllTimersAsync();
        const jobs = await promise;

        expect(jobs).toHaveLength(TOTAL);
        // 1 page to learn the count + 50 remaining = 51 requests, none dropped.
        expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(TOTAL / SIZE));
    });

    // No reported total → can't parallelise; probe sequentially until a short page marks
    // the end. 35 jobs in pages of 10 means offsets 0,10,20,30 then a partial page stops it.
    test('falls back to sequential probing when no total is reported', async () => {
        vi.useFakeTimers();
        const TOTAL = 35;
        const SIZE = 10;
        const fetchMock = mockOffsetApi(TOTAL, SIZE, /* countInBody */ false);
        vi.stubGlobal('fetch', fetchMock);

        const config = {
            ...COMPANY_APIS['explore.jobs.netflix.net'],
            pagination: {
                type: 'offset' as const,
                param: 'start',
                pageSize: SIZE,
            },
        };
        const promise = fetchCompanyApiJobs(config);
        await vi.runAllTimersAsync();
        const jobs = await promise;

        expect(jobs).toHaveLength(TOTAL);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    test('rides out a sustained 429 throttle instead of failing the board', async () => {
        vi.useFakeTimers();
        const TOTAL = 386;
        const SIZE = 10;
        const okApi = mockOffsetApi(TOTAL, SIZE);
        const throttledHits = new Map<string, number>();
        const fetchMock = vi.fn(async (url: string) => {
            const start = Number(new URL(url).searchParams.get('start'));
            const hits = throttledHits.get(url) ?? 0;
            if (start >= 210 && hits < 4) {
                throttledHits.set(url, hits + 1);
                return {
                    ok: false,
                    status: 429,
                    headers: new Headers(),
                    json: async () => ({}),
                };
            }
            return okApi(url);
        });
        vi.stubGlobal('fetch', fetchMock);

        const promise = fetchCompanyApiJobs(
            COMPANY_APIS['explore.jobs.netflix.net'],
        );
        await vi.runAllTimersAsync();
        const jobs = await promise;

        expect(jobs).toHaveLength(TOTAL);
    });

    test('waits for the Retry-After header on a 429', async () => {
        vi.useFakeTimers();
        const okApi = mockOffsetApi(5, 10);
        let throttled = false;
        const fetchMock = vi.fn(async (url: string) => {
            if (!throttled) {
                throttled = true;
                return {
                    ok: false,
                    status: 429,
                    headers: new Headers({ 'retry-after': '30' }),
                    json: async () => ({}),
                };
            }
            return okApi(url);
        });
        vi.stubGlobal('fetch', fetchMock);

        const promise = fetchCompanyApiJobs(
            COMPANY_APIS['explore.jobs.netflix.net'],
        );
        await vi.advanceTimersByTimeAsync(29_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await vi.runAllTimersAsync();
        expect(await promise).toHaveLength(5);
    });
});

describe('Autodesk (Eightfold PCSX)', () => {
    const mockPositions = (positions: Record<string, unknown>[]) =>
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    data: { positions, count: positions.length },
                }),
            })),
        );

    test('keeps every location of a multi-country posting', async () => {
        mockPositions([
            {
                id: 1,
                name: 'Account Executive',
                standardizedLocations: ['Dublin, D, IE', 'Barcelona, CT, ES'],
                positionUrl: '/careers/job/1',
            },
        ]);

        const [job] = await fetchCompanyApiJobs(
            COMPANY_APIS['jobs.autodesk.com'],
        );

        expect(job.location).toBe('Dublin, D, IE; Barcelona, CT, ES');
        expect(job.url).toBe('https://jobs.autodesk.com/careers/job/1');
    });

    test('a bare region code does not read as a country', async () => {
        mockPositions([
            {
                id: 2,
                name: 'Remote Engineer',
                standardizedLocations: ['DE,US', 'NL,CA', 'Berlin, BE, DE'],
                positionUrl: '/careers/job/2',
            },
        ]);

        const [job] = await fetchCompanyApiJobs(
            COMPANY_APIS['jobs.autodesk.com'],
        );

        expect(job.location).toBe('US; CA; Berlin, BE, DE');
    });
});

describe('filtered array paths', () => {
    const run = (location: string, categories: unknown) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                status: 200,
                json: async () => ({
                    jobs: [
                        {
                            name: 'Sales Executive',
                            link: 'https://careers.example.com/apply/1',
                            categories,
                        },
                    ],
                }),
            })),
        );
        return fetchCompanyApiJobs({
            url: 'https://careers.example.com/api/jobs',
            pagination: { type: 'none' as const },
            itemsPath: 'jobs',
            fields: { title: 'name', url: 'link', location },
        });
    };

    test('reads the term of the entry whose domain matches, whatever its position', async () => {
        const jobs = await run('categories[domain=City].term', [
            { domain: 'language', term: 'en' },
            { domain: 'Country', term: 'Estonia' },
            { domain: 'City', term: 'Tallinn' },
        ]);

        expect(jobs[0].location).toBe('Tallinn');
    });

    test('leaves the location unset when no entry matches', async () => {
        const jobs = await run('categories[domain=City].term', [
            { domain: 'language', term: 'en' },
        ]);

        expect(jobs[0].location).toBeUndefined();
    });

    test('leaves the location unset when the array is missing', async () => {
        const jobs = await run('categories[domain=City].term', undefined);

        expect(jobs[0].location).toBeUndefined();
    });
});
