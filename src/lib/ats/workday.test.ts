import { test, expect, describe, vi, afterEach } from 'vitest';
import { fetchWorkdayJobs, parseWorkdayUrl } from './workday';

const FINLAND = '0afb2fa656da42e8bfb6d47bd24a26fa';
const SPAIN = 'bd34c524a6a04ae6915f5d96fa086199';
const USA = 'bc33aa3152ec42d4995f4791a106ed09';

const facets = [
    {
        facetParameter: 'locationMainGroup',
        values: [
            {
                facetParameter: 'locationCountry',
                values: [
                    {
                        id: USA,
                        descriptor: 'United States of America',
                        count: 9,
                    },
                    { id: FINLAND, descriptor: 'Finland', count: 1 },
                    { id: SPAIN, descriptor: 'Spain', count: 1 },
                ],
            },
        ],
    },
];

const postings: Record<string, unknown[]> = {
    [FINLAND]: [
        {
            title: 'Software Engineer',
            locationsText: 'HEL AA',
            externalPath: '/job/HEL-AA/Software-Engineer_R-1',
        },
    ],
    [SPAIN]: [
        {
            title: 'Field Service Engineer',
            locationsText: 'MAD MA',
            externalPath: '/job/MAD-MA/Field-Service-Engineer_R-2',
        },
    ],
};

const json = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
});

function stubWorkday() {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
        const { appliedFacets } = JSON.parse(String(init.body));
        const ids: string[] | undefined = appliedFacets.locationCountry;
        if (!ids) return json({ total: 11, facets, jobPostings: [] });
        const jobs = postings[ids[0]] ?? [];
        return json({ total: jobs.length, jobPostings: jobs });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

const requestedCountries = (fetchMock: ReturnType<typeof stubWorkday>) =>
    fetchMock.mock.calls.map(
        ([, init]) =>
            JSON.parse(String(init.body)).appliedFacets.locationCountry,
    );

afterEach(() => vi.unstubAllGlobals());

describe('fetchWorkdayJobs for site-code tenants', () => {
    test('discovers tracked countries and tags postings with them', async () => {
        const fetchMock = stubWorkday();

        const jobs = await fetchWorkdayJobs(
            parseWorkdayUrl(
                'https://onehealthineers.wd3.myworkdayjobs.com/SHSJB',
            )!,
        );

        expect(requestedCountries(fetchMock)).toEqual([
            undefined,
            [FINLAND],
            [SPAIN],
        ]);
        expect(jobs).toEqual([
            {
                title: 'Software Engineer',
                url: 'https://onehealthineers.wd3.myworkdayjobs.com/en-US/SHSJB/job/HEL-AA/Software-Engineer_R-1',
                location: 'Finland',
                country_code: 'Finland',
            },
            {
                title: 'Field Service Engineer',
                url: 'https://onehealthineers.wd3.myworkdayjobs.com/en-US/SHSJB/job/MAD-MA/Field-Service-Engineer_R-2',
                location: 'Spain',
                country_code: 'Spain',
            },
        ]);
    });

    test('limits to the countries given on the URL', async () => {
        const fetchMock = stubWorkday();

        const jobs = await fetchWorkdayJobs(
            parseWorkdayUrl(
                `https://onehealthineers.wd3.myworkdayjobs.com/SHSJB?locationCountry=${SPAIN}`,
            )!,
        );

        expect(requestedCountries(fetchMock)).toEqual([undefined, [SPAIN]]);
        expect(jobs.map((j) => j.country_code)).toEqual(['Spain']);
    });
});
