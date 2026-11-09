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

function stubBoardJob(
    location: string,
    offices?: (string | { name: string; location: string | null })[],
) {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
            Response.json({
                jobs: [
                    {
                        id: 1,
                        title: 'Role',
                        location: { name: location },
                        offices: offices?.map((office) =>
                            typeof office === 'string'
                                ? { name: office }
                                : office,
                        ),
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

    it('takes the city from the office when the location only names the country', async () => {
        stubBoardJob('Sweden', [
            { name: 'Sweden', location: 'Stockholm, Sweden' },
        ]);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(lookupCountryFromLocation(job.location!)).toMatchObject([
            { code: 'SE' },
        ]);
        expect(extractCitiesForCountry(job.location!, 'SE')).toEqual([
            'Stockholm',
        ]);
    });

    it('takes the city from the office name when the office has no location', async () => {
        stubBoardJob('Finland', ['Helsinki', 'Tampere']);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(extractCitiesForCountry(job.location!, 'FI')).toEqual([
            'Helsinki',
            'Tampere',
        ]);
    });

    it('ignores offices in other countries when adding a city', async () => {
        stubBoardJob('Sweden', [
            { name: 'Berlin', location: 'Berlin, Germany' },
        ]);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Sweden');
    });

    it('gives remote jobs no office city', async () => {
        stubBoardJob('Remote, Sweden', [
            { name: 'Sweden', location: 'Stockholm, Sweden' },
        ]);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Remote, Sweden');
    });

    it('keeps the city a location already has', async () => {
        stubBoardJob('Gothenburg, Sweden', [
            { name: 'Sweden', location: 'Stockholm, Sweden' },
        ]);

        const [job] = await fetchGreenhouseJobs('acme');

        expect(job.location).toBe('Gothenburg, Sweden');
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

    it.each([
        ['Remote - Europe', ['EU']],
        ['Europe', ['EU']],
        ['Remote – EMEA', []],
    ])(
        'keeps the region %s instead of narrowing it to an office',
        async (location, expectedCodes) => {
            stubBoardJob(location, ['Amsterdam']);

            const [job] = await fetchGreenhouseJobs('acme');

            expect(job.location).toBe(location);
            expect(
                lookupCountryFromLocation(job.location!).map((c) => c.code),
            ).toEqual(expectedCodes);
        },
    );

    it('links Nebius jobs to the page showing their description', async () => {
        stubBoards({ nebius: ['Role'] });

        const [job] = await fetchGreenhouseJobs('nebius');

        expect(job.url).toBe('https://careers.nebius.com/job?gh_jid=0');
    });

    it('links Truecaller jobs to the page showing their description', async () => {
        stubBoards({ truecaller: ['Role'] });

        const [job] = await fetchGreenhouseJobs('truecaller');

        expect(job.url).toBe('https://www.truecaller.com/careers/jobs/0');
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
