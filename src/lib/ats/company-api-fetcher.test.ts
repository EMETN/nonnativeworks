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
