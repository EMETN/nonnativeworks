import { test, expect, vi } from 'vitest';
import type { APIContext } from 'astro';

const COUNTRIES = ['finland', 'sweden', 'norway', 'denmark', 'germany'];
const LATENCY_MS = 20;

let inFlight = 0;
let maxInFlight = 0;

function query(table: string) {
    const ops: string[] = [];
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
    return null;
}

vi.mock('../../../lib/supabase', () => ({
    createSupabaseServiceClient: () => ({ from: query }),
}));

const { POST } = await import('./upload');

test('uploads a multi-country company with countries in parallel', async () => {
    const payload = COUNTRIES.map((slug) => ({
        company_name: 'ABB',
        country: slug,
        country_name: slug,
        country_code: slug.slice(0, 2),
        career_page_url: 'https://careers.abb/global/en/search-results',
        positions: [
            {
                title: 'Engineer',
                url: `https://careers.abb/${slug}/1`,
                requires_native_language: false,
                category: 'other',
            },
        ],
    }));
    const request = new Request('https://example.test/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const res = await POST({ request, locals: {} } as unknown as APIContext);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.map((r: { country: string }) => r.country)).toEqual(
        COUNTRIES,
    );
    expect(maxInFlight).toBeGreaterThan(1);
});
