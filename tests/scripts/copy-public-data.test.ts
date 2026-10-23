import { describe, expect, test } from 'vitest';
import {
    assertSafeTarget,
    clearOrder,
    clearTables,
    fetchAll,
    parseSource,
} from '../../scripts/copy-public-data.mjs';

function fakeClient(rows: object[], maxRows: number) {
    return {
        from: () => ({
            select: (_: string, opts?: { count?: string }) => ({
                order: () => ({
                    range: async (from: number, to: number) => ({
                        data: rows.slice(
                            from,
                            Math.min(to + 1, from + maxRows),
                        ),
                        count: opts?.count ? rows.length : null,
                        error: null,
                    }),
                }),
            }),
        }),
    };
}

const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i) }));

describe('fetchAll', () => {
    test('pages through every row', async () => {
        expect(
            await fetchAll(fakeClient(rows, 1000), 'positions'),
        ).toHaveLength(2500);
    });

    test('does not stop early when the server caps rows below the page size', async () => {
        expect(await fetchAll(fakeClient(rows, 500), 'positions')).toHaveLength(
            2500,
        );
    });
});

describe('assertSafeTarget', () => {
    test('refuses to write to the source project', () => {
        expect(() =>
            assertSafeTarget(
                'http://127.0.0.1:54321',
                'http://127.0.0.1:54321/',
            ),
        ).toThrow(/source/);
    });

    test('refuses a non-local target', () => {
        expect(() =>
            assertSafeTarget(
                'https://abc.supabase.co',
                'https://def.supabase.co',
            ),
        ).toThrow(/non-local/);
    });

    test('allows the local stack', () => {
        expect(() =>
            assertSafeTarget(
                'https://abc.supabase.co',
                'http://127.0.0.1:54321',
            ),
        ).not.toThrow();
    });
});

describe('parseSource', () => {
    test('reads the two public values', () => {
        expect(
            parseSource({
                SUPABASE_URL: { computed: 'https://abc.supabase.co' },
                SUPABASE_ANON_KEY: { computed: 'anon' },
            }),
        ).toEqual({ url: 'https://abc.supabase.co', anonKey: 'anon' });
    });

    test('fails clearly when a value is missing', () => {
        expect(() =>
            parseSource({
                SUPABASE_URL: { computed: 'https://abc.supabase.co' },
            }),
        ).toThrow(/SUPABASE_ANON_KEY/);
    });
});

describe('clearOrder', () => {
    test('clears children before the tables they reference', () => {
        const order = clearOrder({ keepCategories: false });
        const before = (a: string, b: string) =>
            expect(order.indexOf(a)).toBeLessThan(order.indexOf(b));
        before('skill_snapshots', 'skills');
        before('skill_snapshots', 'categories');
        before('positions', 'companies');
        before('positions', 'categories');
        before('companies', 'countries');
        before('company_snapshots', 'countries');
    });

    test('includes the local admin logs', () => {
        expect(clearOrder({ keepCategories: false })).toEqual(
            expect.arrayContaining([
                'admin_changes',
                'site_publishes',
                'site_builds',
            ]),
        );
    });

    test('can keep the categories the migrations seed', () => {
        expect(clearOrder({ keepCategories: true })).not.toContain(
            'categories',
        );
    });
});

describe('clearTables', () => {
    test('deletes every row of each table by its key column', async () => {
        const calls: string[] = [];
        const client = {
            from: (table: string) => ({
                delete: () => ({
                    not: async (column: string, op: string, value: null) => {
                        calls.push(`${table}.${column} ${op} ${value}`);
                        return { error: null };
                    },
                }),
            }),
        };
        await clearTables(client, ['site_builds', 'positions']);
        expect(calls).toEqual([
            'site_builds.deploy_id is null',
            'positions.id is null',
        ]);
    });
});
