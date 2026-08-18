import { test, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL = { ...process.env };

beforeEach(() => {
    vi.resetModules();
});

afterEach(() => {
    process.env = { ...ORIGINAL };
});

test('importing the module does not throw when env vars are missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    await expect(import('./supabase')).resolves.toBeDefined();
});

test('createPublicClient names the missing variable', async () => {
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const mod = await import('./supabase');

    expect(() => mod.createPublicClient()).toThrow(/SUPABASE_URL/);
});

test('createPublicClient returns the same instance on repeat calls', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';

    const mod = await import('./supabase');

    expect(mod.createPublicClient()).toBe(mod.createPublicClient());
});
