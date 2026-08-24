#!/usr/bin/env node
// Snapshots every public route's HTML so SSR output can be diffed against static
// output after the rendering flip. .html-baseline/ is gitignored; regenerate on demand.
//
// Usage: node scripts/capture-html-baseline.mjs <label> [baseUrl]
//   node scripts/capture-html-baseline.mjs before
//   node scripts/capture-html-baseline.mjs after
//   diff -ru .html-baseline/before .html-baseline/after

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const label = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:4399';

if (!label) {
    console.error('Usage: capture-html-baseline.mjs <label> [baseUrl]');
    process.exit(2);
}

const outDir = join('.html-baseline', label);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

/** Strips content that legitimately differs between builds, so the diff shows
 *  only meaningful changes rather than every asset hash. */
function normalise(html) {
    return html
        .replace(/\/_astro\/[^"']+/g, '/_astro/HASH')
        .replace(/\bdata-astro-cid-[\w-]+/g, 'data-astro-cid-X')
        .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, 'TIMESTAMP')
        .replace(/<!--.*?-->/gs, '')
        .trim();
}

function fileNameFor(route) {
    const slug =
        route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '__');
    return `${slug}.html`;
}

const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
if (!sitemapResponse.ok) {
    console.error(
        `Could not read ${baseUrl}/sitemap.xml (${sitemapResponse.status})`,
    );
    process.exit(1);
}
const sitemap = await sitemapResponse.text();

const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => new URL(match[1]).pathname)
    .filter((route, index, all) => all.indexOf(route) === index)
    .sort();

console.log(`Capturing ${routes.length} routes into ${outDir}`);

let failures = 0;
for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`);
    if (!response.ok) {
        console.error(`  ${response.status} ${route}`);
        failures += 1;
        continue;
    }
    writeFileSync(
        join(outDir, fileNameFor(route)),
        normalise(await response.text()),
    );
}

console.log(`Captured ${routes.length - failures} routes, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
