import { test, expect, vi, beforeEach } from 'vitest';
import type { APIContext } from 'astro';

const getUser = vi.fn();

vi.mock('./lib/supabase', () => ({
    createSupabaseClient: () => ({ auth: { getUser } }),
}));

const { onRequest } = await import('./middleware');

beforeEach(() => {
    getUser.mockReset();
});

function signedInAs(user: object | null) {
    getUser.mockResolvedValue({ data: { user } });
}

async function run(pathname: string) {
    const url = new URL(pathname, 'https://example.test');
    const locals: Record<string, unknown> = {};
    const next = vi.fn(async () => new Response('ok'));
    const context = {
        url,
        request: new Request(url),
        cookies: {},
        locals,
        redirect: (to: string) =>
            new Response(null, { status: 302, headers: { Location: to } }),
    } as unknown as APIContext;

    const response = (await onRequest(context, next)) as Response;
    return { response, next, locals };
}

test('an admin API route returns 401 when nobody is signed in', async () => {
    signedInAs(null);

    const { response, next } = await run('/api/admin/companies');

    expect(response.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
});

test('an admin API route returns 403 for a signed-in user without the admin role', async () => {
    signedInAs({ id: 'u1', app_metadata: {} });

    const { response, next } = await run('/api/admin/companies');

    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
});

test('an admin page returns 403 for a signed-in user without the admin role', async () => {
    signedInAs({ id: 'u1', app_metadata: {} });

    const { response, next } = await run('/admin/companies');

    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
});

test('a role in user_metadata does not grant admin access', async () => {
    signedInAs({
        id: 'u1',
        app_metadata: {},
        user_metadata: { role: 'admin' },
    });

    const { response, next } = await run('/api/admin/companies');

    expect(response.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
});

test('a public page is cacheable in production', async () => {
    vi.stubEnv('DEV', false);

    const { response } = await run('/companies/alpha');

    expect(response.headers.get('Cache-Control')).toContain('max-age=60');
    vi.unstubAllEnvs();
});

test('a public page is not cached by the browser on the dev server', async () => {
    vi.stubEnv('DEV', true);

    const { response } = await run('/companies/alpha');

    expect(response.headers.get('Cache-Control')).toBeNull();
    vi.unstubAllEnvs();
});

test('a user with the admin role in app_metadata reaches the route', async () => {
    const admin = { id: 'u1', app_metadata: { role: 'admin' } };
    signedInAs(admin);

    const { response, next, locals } = await run('/admin/companies');

    expect(response.status).toBe(200);
    expect(next).toHaveBeenCalledOnce();
    expect(locals.user).toBe(admin);
});
