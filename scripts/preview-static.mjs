#!/usr/bin/env node
// Serves dist/client with Netlify-style clean URLs (/belgium -> belgium.html),
// which @astrojs/node's own preview mishandles locally. Static pages only —
// use `pnpm preview` for /admin and /api.
// Usage: node scripts/preview-static.mjs   (PORT env, default 4321)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';

const ROOT = resolve('dist/client');
const HOST = '127.0.0.1'; // bind IPv4 so browsers resolving localhost -> 127.0.0.1 connect
const PORT = Number(process.env.PORT ?? 4321);

if (!existsSync(ROOT)) {
    console.error(`No build found at ${ROOT}. Run \`pnpm build:local\` first.`);
    process.exit(1);
}

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
};

/** Returns the path if it exists and is a regular file, else null. */
async function tryFile(path) {
    try {
        if ((await stat(path)).isFile()) return path;
    } catch {
        // not found — fall through
    }
    return null;
}

/**
 * Resolves a request pathname to a file on disk, mimicking Netlify's pretty-URL
 * behaviour for a `build.format: 'file'` output:
 *   /             -> index.html
 *   /belgium      -> belgium.html   (preferred over belgium/index.html)
 *   /belgium/abb  -> belgium/abb.html
 *   /_astro/x.css -> _astro/x.css   (has an extension: served as-is)
 */
async function resolvePath(pathname) {
    const rel = normalize(decodeURIComponent(pathname))
        .replace(/^(\.\.[/\\])+/, '') // strip leading ../ segments
        .replace(/^\/+/, '')
        .replace(/\/+$/, ''); // drop leading + trailing slashes

    if (rel === '') return tryFile(join(ROOT, 'index.html'));

    const base = join(ROOT, rel);
    if (base !== ROOT && !base.startsWith(ROOT + '/')) return null; // escaped root

    // A path with a file extension is an asset — serve it directly.
    if (extname(rel)) return tryFile(base);

    // Extensionless route: prefer <path>.html, then <path>/index.html.
    return (
        (await tryFile(`${base}.html`)) ??
        (await tryFile(join(base, 'index.html')))
    );
}

const server = createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0].split('#')[0];
    const file = await resolvePath(pathname);

    if (file) {
        const type = TYPES[extname(file)] ?? 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(req.method === 'HEAD' ? undefined : await readFile(file));
        return;
    }

    const notFound = await tryFile(join(ROOT, '404.html'));
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
        req.method === 'HEAD'
            ? undefined
            : notFound
              ? await readFile(notFound)
              : 'Not found',
    );
});

server.listen(PORT, HOST, () => {
    console.log(
        `Static preview (Netlify-style clean URLs) on http://${HOST}:${PORT}`,
    );
});
