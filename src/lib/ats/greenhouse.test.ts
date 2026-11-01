import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    extractCitiesForCountry,
    extractWorkModelFromLocation,
    lookupCountryFromLocation,
} from './country-lookup';
import { fetchGreenhouseJobs } from './greenhouse';

function stubBoards(jobsByBoard: Record<string, string[]>) {
    const fetchMock = vi.fn(async (url: string) => {
        const board = url.match(/boards\/([^/]+)\/jobs/)![1];
        const titles = jobsByBoard[board];
        if (!titles) return new Response('{}', { status: 404 });
        return Response.json({
            jobs: titles.map((title, id) => ({
                id,
                title,
                location: { name: 'Paris, France' },
                content: '',
                departments: [],
                absolute_url: `https://example.com/${board}/${id}`,
            })),
        });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function stubBoardJob(location: string, offices?: string[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
            Response.json({
                jobs: [
                    {
                        id: 1,
                        title: 'Role',
                        location: { name: location },
                        offices: offices?.map((name) => ({ name })),
                        content: '',
                        departments: [],
                        absolute_url: 'https://example.com/1',
                    },
                ],
            }),
        ),
    );
}

describe('fetchGreenhouseJobs', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('takes the country from the office when the location names none', async () => {
        stubBoardJob('Remote', ['Poland']);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Remote; Poland');
        expect(lookupCountryFromLocation(job.location!)).toMatchObject([
            { code: 'PL' },
        ]);
        expect(extractCitiesForCountry(job.location!, 'PL')).toEqual([]);
        expect(extractWorkModelFromLocation(job.location!)).toBe('remote');
    });

    it('keeps a location that names a country, whatever the office', async () => {
        stubBoardJob('Remote, Germany; Remote, Poland', ['United Kingdom']);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Remote, Germany; Remote, Poland');
    });

    it('leaves the location alone when the job has no office', async () => {
        stubBoardJob('Remote');

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Remote');
    });

    it('merges the language boards into the main board', async () => {
        stubBoards({
            vinteden: ['English role'],
            vintedfr: ['French role'],
            vintedde: [],
            vintedes: [],
        });

        const jobs = await fetchGreenhouseJobs('vinteden');

        expect(jobs.map((job) => job.title)).toEqual([
            'English role',
            'French role',
        ]);
    });

    it('only fetches the requested board otherwise', async () => {
        const fetchMock = stubBoards({ acme: ['Role'] });

        await fetchGreenhouseJobs('acme');

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fails when a board cannot be fetched', async () => {
        stubBoards({ vinteden: ['English role'] });

        await expect(fetchGreenhouseJobs('vinteden')).rejects.toThrow(
            'Greenhouse API returned 404',
        );
    });
});
