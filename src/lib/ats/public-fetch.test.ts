import { test, expect, vi, afterEach } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ lookup }));

const { fetchPublic } = await import('./public-fetch');

afterEach(() => {
    vi.unstubAllGlobals();
    lookup.mockReset();
});

const ok = () => new Response('<html></html>', { status: 200 });

test.each([
    'http://127.0.0.1/',
    'http://10.0.0.5/admin',
    'http://172.16.0.1/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fd00::1]/',
    'http://[fe80::1]/',
    'http://[::ffff:127.0.0.1]/',
    'file:///etc/passwd',
])('refuses %s without fetching', async (url) => {
    const fetchMock = vi.fn(ok);
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPublic(url)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
});

test('refuses a hostname that resolves to a private address', async () => {
    lookup.mockResolvedValue([
        { address: '93.184.215.14', family: 4 },
        { address: '10.1.2.3', family: 4 },
    ]);
    const fetchMock = vi.fn(ok);
    vi.stubGlobal('fetch', fetchMock);
    await expect(
        fetchPublic('https://internal.example.com/'),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
});

test('fetches a public host', async () => {
    lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    const fetchMock = vi.fn(ok);
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchPublic('https://jobs.example.com/1');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
});

test('re-checks every redirect hop', async () => {
    lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    const fetchMock = vi.fn(
        async () =>
            new Response(null, {
                status: 302,
                headers: { location: 'http://169.254.169.254/' },
            }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPublic('https://jobs.example.com/1')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledOnce();
});

test('follows a redirect to another public host', async () => {
    lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
            new Response(null, {
                status: 301,
                headers: { location: '/jobs/1' },
            }),
        )
        .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchPublic('https://jobs.example.com/old/1');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith(
        'https://jobs.example.com/jobs/1',
        expect.objectContaining({ redirect: 'manual' }),
    );
});
