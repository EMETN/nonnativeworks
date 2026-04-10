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

// Patch 2: @astrojs/preact client — convert dynamic import("@preact/signals") to static import
// Netlify's CDN rewrites JS file content to inject deploy IDs (?dpl=<hash>) into asset URLs.
// Static `from 'path.js'` imports are rewritten correctly (dpl inside quotes), but dynamic
// `import('path.js')` calls are corrupted — the ?dpl= lands OUTSIDE the string quotes,
// producing `import('path.js'?dpl=...)` which is a SyntaxError.
// Fix: convert the conditional dynamic import to a top-level static import that Netlify
// handles correctly. The signal module is tiny and always installed, so eager loading is fine.
const preactClientFile = resolve(__dirname, '../node_modules/@astrojs/preact/dist/client.js');
let preactClientContent = readFileSync(preactClientFile, 'utf8');
const dynamicImportLine = `const { signal } = await import("@preact/signals");`;
const staticImportFix = `const { signal } = await Promise.resolve({ signal: __preact_signal });`;

if (preactClientContent.includes(dynamicImportLine)) {
  preactClientContent = `import { signal as __preact_signal } from "@preact/signals";\n` +
    preactClientContent.replace(dynamicImportLine, staticImportFix);
  writeFileSync(preactClientFile, preactClientContent, 'utf8');
  console.log('✔ Patched @astrojs/preact client (static signals import)');
} else if (preactClientContent.includes('__preact_signal')) {
  console.log('✔ @astrojs/preact client already patched');
} else {
  console.warn('⚠ Could not find dynamic import target in @astrojs/preact client — manual check needed');
}

// Patch 3: Astro client build — disable esbuild minify to prevent hash-placeholder crash
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
