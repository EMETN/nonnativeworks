import { test, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CLIENT_DIR = 'dist/client';

function htmlFiles(dir: string, prefix = ''): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory())
            return htmlFiles(path, `${prefix}${entry}/`);
        return entry.endsWith('.html') ? [`${prefix}${entry}`] : [];
    });
}

let pages: string[];

beforeAll(() => {
    pages = htmlFiles(CLIENT_DIR);
});

test('the hub pages are emitted as flat files, not directories', () => {
    expect(pages).toContain('index.html');
    expect(pages).toContain('countries.html');
    expect(pages).toContain('companies.html');
});

test('no page is emitted as a trailing-slash directory index', () => {
    const nested = pages.filter((p) => p.endsWith('/index.html'));

    expect(nested).toEqual([]);
});

test('the build emits a substantial number of pages', () => {
    expect(pages.length).toBeGreaterThan(50);
});

test('canonical URLs are absolute and point at production', () => {
    const html = readFileSync(join(CLIENT_DIR, 'countries.html'), 'utf8');

    expect(html).toContain(
        '<link rel="canonical" href="https://nonnativeworks.com/countries">',
    );
});

test('no built page leaks a localhost URL', () => {
    const offenders = pages.filter((page) =>
        readFileSync(join(CLIENT_DIR, page), 'utf8').includes('localhost'),
    );

    expect(offenders).toEqual([]);
});

test('every API route is emitted as a server function, not prerendered', () => {
    const serverEntry = readFileSync('dist/server/entry.mjs', 'utf8');

    for (const route of [
        '/api/sentry-tunnel',
        '/api/admin/upload',
        '/api/auth/signin',
    ]) {
        expect(serverEntry).toContain(route);
    }
});
