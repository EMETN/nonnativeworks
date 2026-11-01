import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('fetchGreenhouseJobs', () => {
    afterEach(() => vi.unstubAllGlobals());

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
