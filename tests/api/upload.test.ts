import { test, expect, vi, beforeEach } from 'vitest';
import type { APIContext } from 'astro';

const COUNTRIES = ['finland', 'sweden', 'norway', 'denmark', 'germany'];
const LATENCY_MS = 20;
const CAREER_URL = 'https://careers.abb/global/en/search-results';

let inFlight = 0;
let maxInFlight = 0;
let queries: { table: string; ops: string[] }[] = [];
let storedPositions: Record<string, unknown>[] | null = null;

beforeEach(() => {
    inFlight = 0;
    maxInFlight = 0;
    queries = [];
    storedPositions = null;
});

function query(table: string) {
    const ops: string[] = [];
    queries.push({ table, ops });
    const chain: Record<string, unknown> = new Proxy(
        {},
        {
            get(_, prop) {
                if (prop === 'then') {
                    return (resolve: (v: unknown) => void) => {
                        inFlight++;
                        maxInFlight = Math.max(maxInFlight, inFlight);
                        setTimeout(() => {
                            inFlight--;
                            resolve({ data: respond(table, ops), error: null });
                        }, LATENCY_MS);
                    };
                }
                return (..._args: unknown[]) => {
                    ops.push(String(prop));
                    return chain;
                };
            },
        },
    );
    return chain;
}

function respond(table: string, ops: string[]) {
    if (table === 'countries') {
        return COUNTRIES.map((slug, i) => ({
            id: `country-${slug}`,
            slug,
            sort_order: i,
        }));
    }
    if (table === 'categories') return [{ id: 'cat-other', slug: 'other' }];
    if (table === 'skills') return [];
    if (table === 'companies' && ops.includes('upsert')) return { id: 'co-1' };
    if (table === 'companies' && storedPositions) {
        return {
            id: 'co-1',
            career_page_url: CAREER_URL,
            is_english_company: false,
        };
    }
    if (table === 'positions' && ops.includes('select')) return storedPositions;
    return null;
}

vi.mock('../../src/lib/supabase', () => ({
    createSupabaseServiceClient: () => ({ from: query }),
}));

const { POST } = await import('../../src/pages/api/admin/upload');

const position = (slug: string) => ({
    title: 'Engineer',
    url: `https://careers.abb/${slug}/1`,
    requires_native_language: false,
    category: 'other',
});

async function upload(countries: string[]) {
    const payload = countries.map((slug) => ({
        company_name: 'ABB',
        country: slug,
        country_name: slug,
        country_code: slug.slice(0, 2),
        career_page_url: CAREER_URL,
        positions: [position(slug)],
    }));
    const request = new Request('https://example.test/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
    const res = await POST({ request, locals: {} } as unknown as APIContext);
    return { res, body: await res.json() };
}

const writes = (table: string) =>
    queries.filter(
        (q) =>
            q.table === table &&
            (q.ops.includes('delete') || q.ops.includes('insert')),
    );

test('uploads a multi-country company with countries in parallel', async () => {
    const { res, body } = await upload(COUNTRIES);

    expect(res.status).toBe(200);
    expect(body.results.map((r: { country: string }) => r.country)).toEqual(
        COUNTRIES,
    );
    expect(maxInFlight).toBeGreaterThan(1);
});

test('leaves positions untouched when a re-scrape is identical', async () => {
    storedPositions = [
        {
            title: 'Engineer',
            url: 'https://careers.abb/finland/1',
            city: null,
            work_model: null,
            category_id: 'cat-other',
            requires_native_language: false,
            local_language_advantage: false,
            required_languages: [],
            preferred_languages: [],
            skills: [],
            required_education: null,
        },
    ];

    const { res, body } = await upload(['finland']);

    expect(res.status).toBe(200);
    expect(body.results[0]).toMatchObject({ positions: 1, unchanged: true });
    expect(writes('positions')).toHaveLength(0);
    expect(writes('admin_changes')).toHaveLength(0);
    expect(
        queries.some(
            (q) => q.table === 'companies' && q.ops.includes('upsert'),
        ),
    ).toBe(true);
});

test('replaces positions when a re-scrape differs', async () => {
    storedPositions = [];

    const { body } = await upload(['finland']);

    expect(body.results[0].unchanged).toBeUndefined();
    expect(writes('positions').map((q) => q.ops[0])).toEqual([
        'delete',
        'insert',
    ]);
    expect(writes('admin_changes')).toHaveLength(1);
});
