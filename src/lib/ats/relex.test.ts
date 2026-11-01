import { afterEach, describe, expect, it, vi } from 'vitest';
import { withRelexSiteLocations } from './relex';

const LOCATIONS = [
    { id: 1, name: 'Barcelona, Spain' },
    { id: 2, name: 'London, United Kingdom' },
    { id: 3, name: 'Stockholm, Sweden' },
    { id: 4, name: 'Atlanta, GA, United States' },
];

const TITLE = 'Forward Deployed Engineer | Merchandising';

function stubSite(jobs: unknown[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
            Response.json(url.includes('/location?') ? LOCATIONS : jobs),
        ),
    );
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('withRelexSiteLocations', () => {
    it('uses the site cities when they cover the board cities', async () => {
        stubSite([{ title: { rendered: TITLE }, location: [1, 2, 3] }]);

        const [job] = await withRelexSiteLocations([
            {
                title: TITLE,
                location: 'Barcelona, Spain; London, United Kingdom',
            },
        ]);

        expect(job.location).toBe(
            'Barcelona, Spain; London, United Kingdom; Stockholm, Sweden',
        );
    });

    it('tells same-titled postings apart by their cities', async () => {
        stubSite([
            { title: { rendered: TITLE }, location: [4] },
            { title: { rendered: TITLE }, location: [1, 3] },
        ]);

        const jobs = await withRelexSiteLocations([
            { title: TITLE, location: 'Atlanta, GA, United States' },
            { title: TITLE, location: 'Barcelona, Spain' },
        ]);

        expect(jobs.map((job) => job.location)).toEqual([
            'Atlanta, GA, United States',
            'Barcelona, Spain; Stockholm, Sweden',
        ]);
    });

    it('matches a title the site renders with an en dash entity', async () => {
        stubSite([
            {
                title: { rendered: 'Senior IAM Engineer &#8211; Entra ID' },
                location: [1, 3],
            },
        ]);

        const [job] = await withRelexSiteLocations([
            {
                title: 'Senior IAM Engineer - Entra ID',
                location: 'Barcelona, Spain',
            },
        ]);

        expect(job.location).toBe('Barcelona, Spain; Stockholm, Sweden');
    });

    it('keeps the board location when no site posting covers it', async () => {
        stubSite([{ title: { rendered: TITLE }, location: [4] }]);
        const jobs = [{ title: TITLE, location: 'Barcelona, Spain' }];

        expect(await withRelexSiteLocations(jobs)).toEqual(jobs);
    });

    it('keeps the board jobs when the site fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 500 })),
        );
        const jobs = [{ title: TITLE, location: 'Barcelona, Spain' }];

        expect(await withRelexSiteLocations(jobs)).toEqual(jobs);
    });
});
