import { test, expect, describe, vi, afterEach, beforeEach } from 'vitest';
import {
    enrichWorkdayDescriptions,
    fetchWorkdayJobs,
    parseWorkdayUrl,
} from './workday';
import type { RawJob } from './types';
import { titleHash } from '../outcome-cache';

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

interface FakePosting {
    title: string;
    locationsText: string;
    externalPath: string;
}

interface FakeDetail {
    location?: string;
    additionalLocations?: string[];
    country?: string;
    jobDescription?: string;
}

interface FakeTenant {
    company: string;
    site: string;
    /** Postings returned without a locationCountry facet. */
    postings?: FakePosting[];
    /** Country facet id → [descriptor, postings in that country]. */
    countries?: Record<string, [string, FakePosting[]]>;
    details?: Record<string, FakeDetail>;
    failingDetails?: Set<string>;
    html?: Record<string, string>;
    holdDetail?: (path: string) => Promise<void> | undefined;
    holdListing?: (countries?: string[]) => Promise<void> | undefined;
}

function fakeWorkday(tenant: FakeTenant) {
    const listingBase = `/wday/cxs/${tenant.company}/${tenant.site}/jobs`;
    const detailBase = `/wday/cxs/${tenant.company}/${tenant.site}`;
    const log = {
        listing: [] as Array<{ countries?: string[]; offset: number }>,
        detail: [] as string[],
        html: [] as string[],
        inFlightDetail: 0,
        maxInFlightDetail: 0,
        inFlightListing: 0,
        maxInFlightListing: 0,
    };

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const { pathname } = new URL(url);
        if (pathname === listingBase) {
            const body = JSON.parse(String(init!.body));
            const ids: string[] | undefined =
                body.appliedFacets.locationCountry;
            log.listing.push({ countries: ids, offset: body.offset });
            log.inFlightListing++;
            log.maxInFlightListing = Math.max(
                log.maxInFlightListing,
                log.inFlightListing,
            );
            await tenant.holdListing?.(ids);
            log.inFlightListing--;
            const all = ids
                ? ids.flatMap((id) => tenant.countries?.[id]?.[1] ?? [])
                : (tenant.postings ??
                  Object.values(tenant.countries ?? {}).flatMap(([, p]) => p));
            const facets = [
                {
                    facetParameter: 'locationCountry',
                    values: Object.entries(tenant.countries ?? {}).map(
                        ([id, [descriptor, p]]) => ({
                            id,
                            descriptor,
                            count: p.length,
                        }),
                    ),
                },
            ];
            return json({
                total: all.length,
                facets,
                jobPostings: all.slice(body.offset, body.offset + body.limit),
            });
        }
        if (pathname.startsWith(detailBase)) {
            const path = pathname.slice(detailBase.length);
            log.detail.push(path);
            log.inFlightDetail++;
            log.maxInFlightDetail = Math.max(
                log.maxInFlightDetail,
                log.inFlightDetail,
            );
            try {
                await tenant.holdDetail?.(path);
                if (tenant.failingDetails?.has(path))
                    return { ok: false, status: 500, headers: new Headers() };
                const d = tenant.details?.[path] ?? {};
                return json({
                    jobPostingInfo: {
                        location: d.location,
                        additionalLocations: d.additionalLocations,
                        jobDescription: d.jobDescription,
                        ...(d.country && {
                            country: { descriptor: d.country },
                        }),
                    },
                });
            } finally {
                log.inFlightDetail--;
            }
        }
        log.html.push(url);
        const html = tenant.html?.[url];
        return html === undefined
            ? { ok: false, status: 404, headers: new Headers() }
            : { ok: true, status: 200, text: async () => html };
    });
    vi.stubGlobal('fetch', fetchMock);
    return log;
}

const posting = (
    title: string,
    locationsText: string,
    id: string,
): FakePosting => ({
    title,
    locationsText,
    externalPath: `/job/${id}`,
});

const tenantUrl = (company: string, site: string, query = '') =>
    parseWorkdayUrl(
        `https://${company}.wd3.myworkdayjobs.com/${site}${query}`,
    )!;

const jobUrl = (company: string, site: string, id: string) =>
    `https://${company}.wd3.myworkdayjobs.com/en-US/${site}/job/${id}`;

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('fetchWorkdayJobs default mode (existing tenants)', () => {
    test('keeps single-location postings as-is, with the parsed city', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Engineer', 'Helsinki, Finland', 'E_1')],
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toEqual([
            {
                title: 'Engineer',
                location: 'Helsinki, Finland',
                url: jobUrl('acme', 'ext', 'E_1'),
                city: 'Helsinki',
            },
        ]);
    });

    test('pages through the listing until a short page', async () => {
        const many = Array.from({ length: 45 }, (_, i) =>
            posting(`Job ${i}`, 'Helsinki, Finland', `J_${i}`),
        );
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: many,
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toHaveLength(45);
        expect(log.listing.map((l) => l.offset)).toEqual([0, 20, 40]);
    });

    test('splits a multi-location posting into one job per country with its cities', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Designer', '3 Locations', 'D_1')],
            details: {
                '/job/D_1': {
                    location: 'Espoo',
                    additionalLocations: ['Tampere', 'Amsterdam'],
                    jobDescription: '<p>Build &amp; ship</p>',
                },
            },
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toEqual([
            {
                title: 'Designer',
                url: jobUrl('acme', 'ext', 'D_1'),
                location: 'Espoo',
                cities: ['Espoo', 'Tampere'],
                descriptionText: 'Build & ship',
            },
            {
                title: 'Designer',
                url: jobUrl('acme', 'ext', 'D_1'),
                location: 'Amsterdam',
                cities: ['Amsterdam'],
                descriptionText: 'Build & ship',
            },
        ]);
    });

    test('drops unresolvable locations of a multi-location posting when others resolve', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Designer', '2 Locations', 'D_2')],
            details: {
                '/job/D_2': {
                    location: 'Global',
                    additionalLocations: ['Copenhagen'],
                },
            },
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs.map((j) => j.location)).toEqual(['Copenhagen']);
    });

    test('falls back to the detail country when no location of a multi-location posting resolves', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Designer', '2 Locations', 'D_3')],
            details: {
                '/job/D_3': {
                    location: 'Smalltown',
                    additionalLocations: ['Othertown'],
                    country: 'France',
                },
            },
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toEqual([
            {
                title: 'Designer',
                url: jobUrl('acme', 'ext', 'D_3'),
                location: 'Smalltown',
                country_code: 'FR',
                cities: ['Smalltown', 'Othertown'],
            },
        ]);
    });

    test('keeps the listing text when the multi-location detail fetch fails', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Designer', '2 Locations', 'D_4')],
            failingDetails: new Set(['/job/D_4']),
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toEqual([
            {
                title: 'Designer',
                location: '2 Locations',
                url: jobUrl('acme', 'ext', 'D_4'),
            },
        ]);
    });

    test('resolves an unrecognised location through the detail country', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [posting('Analyst', 'Distance office', 'A_1')],
            details: {
                '/job/A_1': { location: 'Distance office', country: 'Denmark' },
            },
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs.map((j) => j.location)).toEqual(['Denmark']);
    });

    test('resolves a venue-name location through the detail location', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: [
                posting('Receptionist', 'SOLO SOKOS HOTEL PIER 4', 'R_1'),
            ],
            details: { '/job/R_1': { location: 'Helsinki, Finland' } },
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(jobs).toEqual([
            {
                title: 'Receptionist',
                url: jobUrl('acme', 'ext', 'R_1'),
                location: 'Helsinki, Finland',
                city: 'Helsinki',
            },
        ]);
    });

    test('forwards URL facets to the listing request', async () => {
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            countries: { [FINLAND]: ['Finland', []] },
        });

        await fetchWorkdayJobs(
            tenantUrl('acme', 'ext', `?locationCountry=${FINLAND}`),
        );

        expect(log.listing).toEqual([{ countries: [FINLAND], offset: 0 }]);
    });
});

describe('enrichWorkdayDescriptions', () => {
    const job = (id: string, title = 'Engineer'): RawJob => ({
        title,
        url: jobUrl('acme', 'ext', id),
        location: 'Helsinki, Finland',
    });

    test('uses the JSON detail description with HTML stripped', async () => {
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            details: {
                '/job/E_1': { jobDescription: '<p>Hyv&auml; tiimi</p>' },
            },
        });
        const jobs = [job('E_1')];

        await enrichWorkdayDescriptions(jobs);

        expect(jobs[0].descriptionText).toBe('Hyvä tiimi');
    });

    test('falls back to the page meta description when the detail API fails', async () => {
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            failingDetails: new Set(['/job/E_2']),
            html: {
                [jobUrl('acme', 'ext', 'E_2')]:
                    '<meta property="og:description" content="English role">',
            },
        });
        const jobs = [job('E_2')];

        await enrichWorkdayDescriptions(jobs);

        expect(jobs[0].descriptionText).toBe('English role');
        expect(log.html).toEqual([jobUrl('acme', 'ext', 'E_2')]);
    });

    test('retries a job whose detail and page both fail once', async () => {
        let pageCalls = 0;
        const url = jobUrl('acme', 'ext', 'E_3');
        fakeWorkday({
            company: 'acme',
            site: 'ext',
            failingDetails: new Set(['/job/E_3']),
            html: {},
        });
        const base = vi.mocked(fetch).getMockImplementation()!;
        vi.mocked(fetch).mockImplementation(async (u, init) => {
            if (u === url && ++pageCalls === 2)
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        '<meta name="description" content="Second try">',
                } as Response;
            return base(u as string, init);
        });
        const jobs = [job('E_3')];

        await enrichWorkdayDescriptions(jobs);

        expect(jobs[0].descriptionText).toBe('Second try');
        expect(pageCalls).toBe(2);
    });

    test('skips cached, non-English-titled and already-described jobs', async () => {
        const log = fakeWorkday({ company: 'acme', site: 'ext' });
        const cached = job('C_1', 'Cached Engineer');
        const finnish = job('F_1', 'Myyntipäällikkö');
        const described = { ...job('D_1'), descriptionText: 'already' };
        const hashes = new Map([[cached.url!, titleHash(cached.title)]]);

        await enrichWorkdayDescriptions([cached, finnish, described], hashes);

        expect(log.detail).toEqual([]);
        expect(log.html).toEqual([]);
    });
});

// Stalls the first matching request until `othersToWaitFor` more have started:
// a rolling pool gets there, a fixed batch waits on the stalled one (timeout).
function holdFirst<T>(isTarget: (key: T) => boolean, othersToWaitFor: number) {
    let held = false;
    let started = 0;
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const timer = setTimeout(release, 1500);
    const state = {
        startedBeforeRelease: 0,
        hold(key: T): Promise<void> | undefined {
            started++;
            if (!held && isTarget(key)) {
                held = true;
                return released.then(() => {
                    state.startedBeforeRelease = started;
                });
            }
            if (held && started > othersToWaitFor) {
                clearTimeout(timer);
                release();
            }
            return undefined;
        },
    };
    return state;
}

describe('Workday detail fetches use a rolling pool of 5', () => {
    test('description fetches keep 5 in flight while one request is slow', async () => {
        const gate = holdFirst<string>((p) => p === '/job/S_0', 6);
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            details: Object.fromEntries(
                Array.from({ length: 12 }, (_, i) => [
                    `/job/S_${i}`,
                    { jobDescription: 'Text' },
                ]),
            ),
            holdDetail: (p) => gate.hold(p),
        });
        const jobs: RawJob[] = Array.from({ length: 12 }, (_, i) => ({
            title: 'Engineer',
            url: jobUrl('acme', 'ext', `S_${i}`),
        }));

        await enrichWorkdayDescriptions(jobs);

        expect(gate.startedBeforeRelease).toBeGreaterThan(5);
        expect(log.maxInFlightDetail).toBe(5);
        expect(log.detail).toHaveLength(12);
    });

    test('multi-location expansion keeps 5 in flight while one request is slow', async () => {
        const gate = holdFirst<string>((p) => p === '/job/M_0', 6);
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            postings: Array.from({ length: 12 }, (_, i) =>
                posting(`Job ${i}`, '2 Locations', `M_${i}`),
            ),
            details: Object.fromEntries(
                Array.from({ length: 12 }, (_, i) => [
                    `/job/M_${i}`,
                    { location: 'Espoo', additionalLocations: ['Amsterdam'] },
                ]),
            ),
            holdDetail: (p) => gate.hold(p),
        });

        const jobs = await fetchWorkdayJobs(tenantUrl('acme', 'ext'));

        expect(gate.startedBeforeRelease).toBeGreaterThan(5);
        expect(log.maxInFlightDetail).toBe(5);
        expect(jobs).toHaveLength(24);
    });

    test('a job listed under several countries is described with one fetch', async () => {
        const log = fakeWorkday({
            company: 'acme',
            site: 'ext',
            details: { '/job/X_1': { jobDescription: 'Shared text' } },
        });
        const url = jobUrl('acme', 'ext', 'X_1');
        const jobs: RawJob[] = [
            { title: 'Engineer', url, country_code: 'Finland' },
            { title: 'Engineer', url, country_code: 'Sweden' },
        ];

        await enrichWorkdayDescriptions(jobs);

        expect(log.detail).toEqual(['/job/X_1']);
        expect(jobs.map((j) => j.descriptionText)).toEqual([
            'Shared text',
            'Shared text',
        ]);
    });
});

// Regression: R1130756 is listed under France only via a "Global" location.
describe('fetchWorkdayJobs for facet-country tenants (Dentsu)', () => {
    const FRANCE = '54c5b6971ffb4bf0b116fe7651ec789a';
    const NETHERLANDS = '9696868b09c64d52a62ee13b052383cc';
    const UK = '29247e57dbaf46fb855b224e03170bc7';
    const dentsu = (path: string) => jobUrl('dentsuaegis', 'DAN_GLOBAL', path);
    const designer = posting(
        'Strategic Business Designer',
        '4 Locations',
        'London/Designer_R1130756',
    );

    test('lists a job under every tracked country facet it appears in', async () => {
        fakeWorkday({
            company: 'dentsuaegis',
            site: 'DAN_GLOBAL',
            countries: {
                [FRANCE]: [
                    'France',
                    [
                        posting(
                            'Consultant Media',
                            'Paris - 67 avenue Wagram',
                            'Paris/Consultant_R1',
                        ),
                        designer,
                    ],
                ],
                [NETHERLANDS]: ['Netherlands', [designer]],
                [UK]: ['United Kingdom', [designer]],
            },
            details: {
                '/job/London/Designer_R1130756': {
                    location: 'London',
                    additionalLocations: ['Copenhagen', 'Amsterdam', 'Global'],
                    country: 'United Kingdom',
                    jobDescription: 'Design things',
                },
            },
        });

        const jobs = await fetchWorkdayJobs(
            tenantUrl('dentsuaegis', 'DAN_GLOBAL'),
        );

        expect(jobs).toEqual([
            {
                title: 'Consultant Media',
                url: dentsu('Paris/Consultant_R1'),
                location: 'Paris - 67 avenue Wagram',
                country_code: 'France',
                city: 'Paris - 67 avenue Wagram',
            },
            {
                title: 'Strategic Business Designer',
                url: dentsu('London/Designer_R1130756'),
                location: 'France',
                country_code: 'France',
                descriptionText: 'Design things',
            },
            {
                title: 'Strategic Business Designer',
                url: dentsu('London/Designer_R1130756'),
                location: 'Amsterdam',
                country_code: 'Netherlands',
                cities: ['Amsterdam'],
                descriptionText: 'Design things',
            },
        ]);
    });

    test('fetches a multi-country posting detail once', async () => {
        const log = fakeWorkday({
            company: 'dentsuaegis',
            site: 'DAN_GLOBAL',
            countries: {
                [FRANCE]: ['France', [designer]],
                [NETHERLANDS]: ['Netherlands', [designer]],
            },
            details: {
                '/job/London/Designer_R1130756': {
                    location: 'London',
                    additionalLocations: ['Amsterdam'],
                },
            },
        });

        await fetchWorkdayJobs(tenantUrl('dentsuaegis', 'DAN_GLOBAL'));

        expect(log.detail).toEqual(['/job/London/Designer_R1130756']);
    });

    test('only queries the tracked countries given on the URL', async () => {
        const log = fakeWorkday({
            company: 'dentsuaegis',
            site: 'DAN_GLOBAL',
            countries: {
                [FRANCE]: ['France', []],
                [NETHERLANDS]: ['Netherlands', []],
                [UK]: ['United Kingdom', []],
            },
        });

        await fetchWorkdayJobs(
            tenantUrl(
                'dentsuaegis',
                'DAN_GLOBAL',
                `?locationCountry=${FRANCE}&locationCountry=${UK}`,
            ),
        );

        expect(log.listing.map((l) => l.countries)).toEqual([
            undefined,
            [FRANCE],
        ]);
    });
});

describe('per-country listing runs countries in parallel, 5 at a time', () => {
    test.each([
        ['dentsuaegis', 'DAN_GLOBAL'],
        ['onehealthineers', 'SHSJB'],
    ])('%s', async (company, site) => {
        const ids = [
            FINLAND,
            SPAIN,
            '54c5b6971ffb4bf0b116fe7651ec789a',
            '9696868b09c64d52a62ee13b052383cc',
            'dcc5b7608d8644b3a93716604e78e995',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
        ];
        const names = [
            'Finland',
            'Spain',
            'France',
            'Netherlands',
            'Germany',
            'Sweden',
            'Norway',
        ];
        const gate = holdFirst<string[] | undefined>(
            (c) => c?.[0] === FINLAND,
            6,
        );
        const log = fakeWorkday({
            company,
            site,
            countries: Object.fromEntries(
                ids.map((id, i) => [
                    id,
                    [names[i], [posting(`Job ${i}`, names[i], `P_${i}`)]],
                ]),
            ),
            holdListing: (c) => (c ? gate.hold(c) : undefined),
        });

        const jobs = await fetchWorkdayJobs(tenantUrl(company, site));

        expect(gate.startedBeforeRelease).toBeGreaterThan(5);
        expect(log.maxInFlightListing).toBe(5);
        // Output order follows the facet order, not completion order.
        expect(jobs.map((j) => j.country_code)).toEqual(names);
    });
});
