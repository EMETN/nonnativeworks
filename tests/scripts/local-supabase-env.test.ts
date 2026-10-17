import { describe, expect, test } from 'vitest';
import { formatEnv, toAppEnv } from '../../scripts/local-supabase-env.mjs';

const legacy = {
    API_URL: 'http://127.0.0.1:54321',
    ANON_KEY: 'anon',
    SERVICE_ROLE_KEY: 'service',
};

describe('toAppEnv', () => {
    test('maps legacy key names', () => {
        expect(toAppEnv(legacy)).toEqual({
            SUPABASE_URL: 'http://127.0.0.1:54321',
            SUPABASE_ANON_KEY: 'anon',
            SUPABASE_SERVICE_ROLE_KEY: 'service',
        });
    });

    test('falls back to publishable and secret keys', () => {
        const env = toAppEnv({
            API_URL: 'http://127.0.0.1:54321',
            PUBLISHABLE_KEY: 'pub',
            SECRET_KEY: 'sec',
        });
        expect(env.SUPABASE_ANON_KEY).toBe('pub');
        expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('sec');
    });

    test('fails clearly when the stack is not running', () => {
        expect(() => toAppEnv(undefined)).toThrow(/pnpm db:start/);
        expect(() => toAppEnv({})).toThrow(/pnpm db:start/);
    });
});

describe('formatEnv', () => {
    test('writes KEY=value lines', () => {
        expect(formatEnv({ A: '1', B: '2' })).toBe('A=1\nB=2\n');
    });
});
