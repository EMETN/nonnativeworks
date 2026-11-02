import { beforeEach, expect, test, vi } from 'vitest';
import type { APIContext } from 'astro';

const POSITION = {
    id: 'p1',
    title: 'Engineer',
    company: { name: 'Spotify', country: { name: 'Sweden' } },
};

let calls: { table: string; method: string; args: unknown[] }[] = [];
let storedPositions: (typeof POSITION)[] = [POSITION];

function from(table: string) {
    let page = storedPositions.slice(0, 1000);
    const chain: Record<string, unknown> = new Proxy(
        {},
        {
            get(_, prop) {
                if (prop === 'then') {
                    const data =
                        table === 'companies' ? [{ id: 'co-1' }] : page;
                    return (resolve: (v: unknown) => void) =>
                        resolve({ data, error: null });
                }
                return (...args: unknown[]) => {
                    calls.push({ table, method: String(prop), args });
                    if (prop === 'range') {
                        const [start, end] = args as [number, number];
                        page = storedPositions.slice(start, end + 1);
                    }
                    return chain;
                };
            },
        },
    );
    return chain;
}

vi.mock('../../src/lib/supabase', () => ({
    createSupabaseServiceClient: () => ({ from }),
}));

const { GET } = await import('../../src/pages/api/admin/positions/index');

async function get(search: string) {
    const url = new URL(`http://localhost/api/admin/positions${search}`);
    const res = await GET({ url } as unknown as APIContext);
    return (await res.json()) as (typeof POSITION)[];
}

const positionFilters = () => {
    const filters = calls.filter(
        (c) => c.table === 'positions' && c.method === 'in',
    );
    return filters.slice(0, 1);
};

beforeEach(() => {
    calls = [];
    storedPositions = [POSITION];
});

test('reads past the 1000-row cap of a single response', async () => {
    storedPositions = Array.from({ length: 2500 }, (_, i) => ({
        ...POSITION,
        id: `p${i}`,
    }));

    const rows = await get('?country_id=c');

    expect(rows).toHaveLength(2500);
});

test('repeated company_id params filter positions to all those companies', async () => {
    await get('?company_id=a&company_id=b');

    expect(positionFilters()).toEqual([
        { table: 'positions', method: 'in', args: ['company_id', ['a', 'b']] },
    ]);
});

test('a single company_id still returns the company and country', async () => {
    const rows = await get('?company_id=a');

    expect(rows[0]?.company).toEqual({
        name: 'Spotify',
        country_name: 'Sweden',
    });
});

test('country_id still filters to the companies in that country', async () => {
    await get('?country_id=c');

    expect(positionFilters()).toEqual([
        { table: 'positions', method: 'in', args: ['company_id', ['co-1']] },
    ]);
});
