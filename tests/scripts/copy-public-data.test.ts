import { describe, expect, test } from 'vitest';
import {
    assertSafeTarget,
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
