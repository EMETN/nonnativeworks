/**
 * Postinstall patches for build compatibility.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const require = createRequire(import.meta.url);

// Patch 1: @preact/preset-vite — guard against undefined `this`
const preactFile = resolve(__dirname, '../node_modules/@preact/preset-vite/dist/esm/index.mjs');
let preactContent = readFileSync(preactFile, 'utf8');
const preactBefore = `"meta" in this && this.meta && typeof this.meta === "object"`;
const preactAfter  = `this != null && "meta" in this && this.meta && typeof this.meta === "object"`;

if (preactContent.includes(preactBefore)) {
  writeFileSync(preactFile, preactContent.replace(preactBefore, preactAfter), 'utf8');
  console.log('✔ Patched @preact/preset-vite');
} else if (preactContent.includes(preactAfter)) {
  console.log('✔ @preact/preset-vite already patched');
} else {
  console.warn('⚠ Could not find patch target in @preact/preset-vite — manual check needed');
}

// Patch 2: Astro client build — disable esbuild minify to prevent hash-placeholder crash
// Astro hardcodes `minify: true` for the client environment build, but esbuild chokes on
// Rollup's internal hash placeholders (`!~{NNN}~`) in chunk filenames during minification.
// Netlify's CDN gzips assets anyway, so skipping minify has negligible impact.
const astroEntry = require.resolve('astro');
const astroDir = dirname(dirname(astroEntry)); // go up from dist/something to package root
const astroBuildFile = resolve(astroDir, 'dist/core/build/static-build.js');
let astroContent = readFileSync(astroBuildFile, 'utf8');

const astroTarget = /(\[ASTRO_VITE_ENVIRONMENT_NAMES\.client\]:\s*\{[\s\S]*?)minify:\s*true/;
if (astroTarget.test(astroContent)) {
  astroContent = astroContent.replace(astroTarget, '$1minify: false');
  writeFileSync(astroBuildFile, astroContent, 'utf8');
  console.log('✔ Patched Astro client build (disabled esbuild minify)');
} else if (/\[ASTRO_VITE_ENVIRONMENT_NAMES\.client\][\s\S]*?minify:\s*false/.test(astroContent)) {
  console.log('✔ Astro client build already patched');
} else {
  console.warn('⚠ Could not find patch target in Astro static-build.js — manual check needed');
}
