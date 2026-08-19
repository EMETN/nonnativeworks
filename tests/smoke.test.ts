import { test, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from './helpers/server';

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
    server = await startServer();
});

afterAll(async () => {
    await server?.stop();
});

// Static pages get these headers from netlify.toml, verified on the deploy preview instead
// (the local node adapter doesn't read it). On-demand routes get them from middleware.
test.each([
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'strict-origin-when-cross-origin'],
])('an on-demand route sets %s exactly once', async (header, value) => {
    const response = await fetch(`${server.baseUrl}/admin/login`);

    expect(response.headers.get(header)).toBe(value);
});

test('the Sentry tunnel is reachable and is not a 404', async () => {
    const response = await fetch(`${server.baseUrl}/api/sentry-tunnel`, {
        method: 'POST',
        body: '{"dsn":"https://example.invalid/1"}\n',
    });

    expect(response.status).not.toBe(404);
});

test('an unauthenticated admin page redirects to login', async () => {
    const response = await fetch(`${server.baseUrl}/admin/companies`, {
        redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/admin/login');
});

test('an unauthenticated admin API call returns 401', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/companies`);

    expect(response.status).toBe(401);
});

test('an unknown country slug does not return 200', async () => {
    const response = await fetch(`${server.baseUrl}/not-a-real-country`);

    expect(response.status).toBe(404);
});

test('the publish endpoint rejects unauthenticated callers', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/publish`, {
        method: 'POST',
        headers: { Origin: server.baseUrl },
    });

    expect(response.status).toBe(401);
});

test('a wrong scraper secret is rejected like no secret at all', async () => {
    const response = await fetch(`${server.baseUrl}/api/admin/publish`, {
        method: 'POST',
        headers: {
            'X-Scraper-Secret': 'definitely-not-the-secret',
            Origin: server.baseUrl,
        },
    });

    expect(response.status).toBe(401);
});
