import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { curlFetch, parseCurlOutput } from './curl-fetch';

describe('parseCurlOutput', () => {
    test('keeps only the final hop of a redirect chain', async () => {
        const raw = Buffer.from(
            'HTTP/1.1 301 Moved Permanently\r\nLocation: /b\r\nX-Hop: 1\r\n\r\n' +
                'HTTP/2 200\r\ncontent-type: application/json\r\nretry-after: 5\r\n\r\n' +
                '{"ok":true}',
        );
        const res = parseCurlOutput(raw);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-hop')).toBeNull();
        expect(res.headers.get('retry-after')).toBe('5');
        expect(await res.json()).toEqual({ ok: true });
    });

    test('skips an interim 100 Continue block', async () => {
        const raw = Buffer.from(
            'HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 429 Too Many Requests\r\ncf-mitigated: challenge\r\n\r\n<html>',
        );
        const res = parseCurlOutput(raw);
        expect(res.status).toBe(429);
        expect(res.ok).toBe(false);
        expect(res.headers.get('cf-mitigated')).toBe('challenge');
        expect(await res.text()).toBe('<html>');
    });

    test('rejects output with no status line', () => {
        expect(() => parseCurlOutput(Buffer.from('garbage'))).toThrow(
            /no HTTP status line/,
        );
    });
});

describe('curlFetch against a local server', () => {
    let server: Server;
    let base: string;
    const seen: { method?: string; headers: object; body: string }[] = [];

    beforeAll(async () => {
        server = createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                seen.push({ method: req.method, headers: req.headers, body });
                if (req.url === '/redirect') {
                    res.writeHead(302, { location: '/final' }).end();
                    return;
                }
                res.writeHead(req.url === '/final' ? 200 : 201, {
                    'content-type': 'application/json',
                });
                res.end(JSON.stringify({ path: req.url }));
            });
        });
        await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    test('sends method, headers and body', async () => {
        const res = await curlFetch(`${base}/jobs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-test': 'yes' },
            body: '{"limit":20}',
        });
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({ path: '/jobs' });
        const req = seen.at(-1)!;
        expect(req.method).toBe('POST');
        expect(req.headers).toMatchObject({ 'x-test': 'yes' });
        expect(req.body).toBe('{"limit":20}');
    });

    test('follows redirects', async () => {
        const res = await curlFetch(`${base}/redirect`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ path: '/final' });
    });

    test('rejects when the host is unreachable', async () => {
        await expect(curlFetch('http://127.0.0.1:1/')).rejects.toThrow(
            /curl failed/,
        );
    });
});
