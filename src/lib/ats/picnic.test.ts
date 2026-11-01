import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGreenhouseJobs } from './greenhouse';
import { fetchPicnicSiteJobs } from './picnic';

vi.mock('./public-fetch', () => ({
    fetchPublic: (url: string, init: RequestInit) => fetch(url, init),
}));

function listing(
    name: string,
    template: string,
    url: string,
    location: { city: string; country?: string },
) {
    return {
        data: {
            location: { state: '', ...location },
            teams: 'Operations',
        },
        _id: name,
        name,
        visibility: 'external',
        template,
        locales: ['en'],
        url,
    };
}

function rscPayload(jobs: unknown[]) {
    const row = JSON.stringify([
        '$',
        '$L2f',
        null,
        { data: { filter_title: 'Filters' }, mobileView: false, jobs },
    ]);
    return `0:{"b":"build"}\n5:T12,not json at all\n3a:${row}\n`;
}

function stubSite(jobs: unknown[], pages: Record<string, string> = {}) {
    const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('boards-api.greenhouse.io')) {
            return Response.json({
                jobs: [
                    {
                        id: 1,
                        title: 'Tech Lead',
                        location: { name: 'Amsterdam, Netherlands' },
                        content: '',
                        departments: [],
                        absolute_url: 'https://jobs.picnic.app/nl/vacancies',
                    },
                ],
            });
        }
        if (url === 'https://jobs.picnic.app/en/jobs') {
            return new Response(rscPayload(jobs));
        }
        return new Response(pages[url] ?? '', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

describe('fetchPicnicSiteJobs', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('keeps only the listings that are not Greenhouse postings', async () => {
        stubSite([
            listing('Tech Lead', 'auto', '/en/vacancies/ABC/tech-lead', {
                city: 'Amsterdam',
                country: 'Netherlands',
            }),
            listing(
                'Bezorger',
                'job-runner-redesign',
                '/en/vacancies/bezorger',
                {
                    city: '',
                    country: 'Netherlands',
                },
            ),
        ]);

        const jobs = await fetchPicnicSiteJobs();

        expect(jobs.map((job) => job.title)).toEqual(['Bezorger']);
    });

    it('maps the listing to a job', async () => {
        stubSite([
            listing(
                'Fahrer (m/w/d)',
                'job-runner-de',
                '/de/jobangebot/fahrer',
                {
                    city: 'Nürnberg',
                    country: 'Germany',
                },
            ),
        ]);

        const [job] = await fetchPicnicSiteJobs();

        expect(job).toMatchObject({
            title: 'Fahrer (m/w/d)',
            location: 'Nürnberg, Germany',
            url: 'https://jobs.picnic.app/de/jobangebot/fahrer',
            department: 'Operations',
            jobFunction: 'Operations',
        });
    });

    it('uses the country alone when the listing has no city', async () => {
        stubSite([
            listing('Livreur', 'job-runner-fr', '/fr/poste-vacant/livreur', {
                city: '',
                country: 'France',
            }),
        ]);

        const [job] = await fetchPicnicSiteJobs();

        expect(job.location).toBe('France');
    });

    it('reads the description from the page of an English-titled job', async () => {
        const url = 'https://jobs.picnic.app/en/vacancies/warehouse-worker';
        stubSite(
            [
                listing(
                    'Warehouse worker',
                    'job-shopper',
                    '/en/vacancies/warehouse-worker',
                    {
                        city: '',
                        country: 'Netherlands',
                    },
                ),
            ],
            { [url]: '<p>You speak basic Dutch or English</p>' },
        );

        const [job] = await fetchPicnicSiteJobs();

        expect(job.descriptionHtml).toContain('basic Dutch or English');
    });

    it.each([
        ['I can understand and speak basic German or English', false],
        ['You speak and understand Dutch or English fluently', false],
        ['Du sprichst fließend Deutsch', undefined],
    ])('reads the language rule from "%s"', async (text, expected) => {
        const url = 'https://jobs.picnic.app/en/vacancies/order-picker';
        stubSite(
            [
                listing(
                    'Warehouse worker',
                    'job-shopper',
                    '/en/vacancies/order-picker',
                    { city: '', country: 'Germany' },
                ),
            ],
            { [url]: `<p>${text}</p><script>"or English"</script>` },
        );

        const [job] = await fetchPicnicSiteJobs();

        expect(job.requires_native_language).toBe(expected);
    });

    it('ignores the phrase when it only appears in a script', async () => {
        const url = 'https://jobs.picnic.app/en/vacancies/order-picker';
        stubSite(
            [
                listing(
                    'Warehouse worker',
                    'job-shopper',
                    '/en/vacancies/order-picker',
                    { city: '', country: 'Germany' },
                ),
            ],
            { [url]: '<script>"German or English"</script>' },
        );

        const [job] = await fetchPicnicSiteJobs();

        expect(job.requires_native_language).toBeUndefined();
    });

    it('drops the district from a city', async () => {
        stubSite([
            listing(
                'Fahrer (m/w/d)',
                'job-runner-bsl-de',
                '/de/jobangebot/fahrer-berlin-marienfelde',
                { city: 'Berlin - Marienfelde', country: 'Germany' },
            ),
        ]);

        const [job] = await fetchPicnicSiteJobs();

        expect(job.location).toBe('Berlin, Germany');
    });

    it('returns no jobs when the site is down', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('', { status: 503 })),
        );

        await expect(fetchPicnicSiteJobs()).resolves.toEqual([]);
    });

    it('returns no jobs when the page no longer carries the list', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('0:{"b":"build"}\n')),
        );

        await expect(fetchPicnicSiteJobs()).resolves.toEqual([]);
    });
});

describe('fetchGreenhouseJobs for Picnic', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('adds the site-only listings to the board jobs', async () => {
        stubSite([
            listing(
                'Bezorger',
                'job-runner-redesign',
                '/en/vacancies/bezorger',
                {
                    city: '',
                    country: 'Netherlands',
                },
            ),
        ]);

        const jobs = await fetchGreenhouseJobs('teampicnic');

        expect(jobs.map((job) => job.title)).toEqual(['Tech Lead', 'Bezorger']);
    });

    it('leaves other boards alone', async () => {
        const fetchMock = stubSite([]);

        await fetchGreenhouseJobs('acme');

        expect(fetchMock).not.toHaveBeenCalledWith(
            'https://jobs.picnic.app/en/jobs',
            expect.anything(),
        );
    });
});
