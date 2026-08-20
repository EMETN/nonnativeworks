import { test, expect, beforeAll } from 'vitest';
import type { AstroCookies } from 'astro';
import { resolveClient } from './queries';
import { createPublicClient } from './supabase';

beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
});

test('resolveClient returns the shared public client when no request is given', () => {
    expect(resolveClient(undefined, undefined)).toBe(createPublicClient());
});

test('resolveClient returns a request-scoped client when both are given', () => {
    const request = new Request('https://example.com', {
        headers: { Cookie: 'sb-token=abc' },
    });
    const cookies = {
        set() {},
        get() {},
        has: () => false,
    } as unknown as AstroCookies;

    const scoped = resolveClient(request, cookies);

    expect(scoped).not.toBe(createPublicClient());
});

test('resolveClient falls back to the public client if only one is given', () => {
    const request = new Request('https://example.com');

    expect(resolveClient(request, undefined)).toBe(createPublicClient());
});
