import { test, expect, describe, vi, afterEach } from 'vitest';
import {
    fetchSmartRecruitersJobs,
    enrichSmartRecruitersDescriptions,
} from './smartrecruiters';

const posting = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    name: `Engineer ${id}`,
    company: { identifier: 'SomeCo', name: 'Some Co' },
    location: {
        city: 'Walldorf',
        country: 'de',
        remote: false,
        hybrid: true,
        fullLocation: 'Walldorf, , Germany',
    },
    function: { id: 'engineering', label: 'Engineering' },
    ...overrides,
});

const json = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchSmartRecruitersJobs', () => {
    test('pages through every posting and maps the structured fields', async () => {
        const page1 = Array.from({ length: 100 }, (_, i) => posting(`${i}`));
        const page2 = [posting('100', { location: { country: 'fi' } })];
        const fetchMock = vi.fn(async (url: string) =>
            json({
                totalFound: 101,
                content: url.includes('offset=0') ? page1 : page2,
            }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { jobs, companyName } = await fetchSmartRecruitersJobs('SomeCo');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls[1][0]).toContain('offset=100');
        expect(companyName).toBe('Some Co');
        expect(jobs).toHaveLength(101);
        expect(jobs[0]).toEqual({
            title: 'Engineer 0',
            location: 'Walldorf, , Germany',
            country_code: 'DE',
            city: 'Walldorf',
            url: 'https://jobs.smartrecruiters.com/SomeCo/0',
            sourceId: '0',
            jobFunction: 'Engineering',
            work_model: 'hybrid',
        });
        expect(jobs[100].country_code).toBe('FI');
        expect(jobs[100].work_model).toBeUndefined();
    });

    test('stops on an empty page even if totalFound overstates', async () => {
        const fetchMock = vi.fn(async () =>
            json({ totalFound: 500, content: [] }),
        );
        vi.stubGlobal('fetch', fetchMock);

        const { jobs } = await fetchSmartRecruitersJobs('SomeCo');

        expect(jobs).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('throws on a non-OK response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => json({}, 500)),
        );
        await expect(fetchSmartRecruitersJobs('SomeCo')).rejects.toThrow(
            'SmartRecruiters API returned 500',
        );
    });
});

describe('enrichSmartRecruitersDescriptions', () => {
    test('fetches details only for tracked-country jobs and joins the sections', async () => {
        const jobs = [
            { title: 'Engineer', country_code: 'DE', sourceId: 'de1' },
            { title: 'Engineer', country_code: 'US', sourceId: 'us1' },
            { title: 'Gone role', country_code: 'FI', sourceId: 'gone' },
        ];
        const fetchMock = vi.fn(async (url: string) =>
            url.endsWith('/gone')
                ? json({}, 404)
                : json({
                      jobAd: {
                          sections: {
                              companyDescription: { text: '' },
                              jobDescription: { text: '<p>Build</p>' },
                              qualifications: { text: '<p>English</p>' },
                          },
                      },
                  }),
        );
        vi.stubGlobal('fetch', fetchMock);

        await enrichSmartRecruitersDescriptions(jobs, 'SomeCo');

        const fetched = fetchMock.mock.calls.map((c) => c[0]);
        expect(fetched).toHaveLength(2);
        expect(fetched.some((u) => u.endsWith('/us1'))).toBe(false);
        expect(jobs[0]).toMatchObject({
            descriptionHtml: '<p>Build</p>\n<p>English</p>',
        });
        expect(jobs[1]).not.toHaveProperty('descriptionHtml');
        expect(jobs[2]).toMatchObject({ _gone: true });
    });
});
