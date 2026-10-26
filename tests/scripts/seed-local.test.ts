import { describe, expect, test } from 'vitest';
import { assertLocalUrl } from '../../scripts/seed-local.mjs';

describe('assertLocalUrl', () => {
    test('accepts the local stack', () => {
        expect(() => assertLocalUrl('http://127.0.0.1:54321')).not.toThrow();
        expect(() => assertLocalUrl('http://localhost:54321')).not.toThrow();
    });

    test('refuses a hosted project', () => {
        expect(() => assertLocalUrl('https://abc.supabase.co')).toThrow(
            /non-local/,
        );
    });

    test('refuses a missing URL', () => {
        expect(() => assertLocalUrl(undefined)).toThrow(/non-local/);
    });
});
