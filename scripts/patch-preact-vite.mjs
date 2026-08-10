/**
 * Postinstall patches for build compatibility.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Patch 1: @preact/preset-vite — guard against undefined `this`
const preactFile = resolve(
    __dirname,
    '../node_modules/@preact/preset-vite/dist/esm/index.mjs',
);
let preactContent = readFileSync(preactFile, 'utf8');
const preactBefore = `"meta" in this && this.meta && typeof this.meta === "object"`;
const preactAfter = `this != null && "meta" in this && this.meta && typeof this.meta === "object"`;

if (preactContent.includes(preactBefore)) {
    writeFileSync(
        preactFile,
        preactContent.replace(preactBefore, preactAfter),
        'utf8',
    );
    console.log('✔ Patched @preact/preset-vite');
} else if (preactContent.includes(preactAfter)) {
    console.log('✔ @preact/preset-vite already patched');
} else {
    console.warn(
        '⚠ Could not find patch target in @preact/preset-vite — manual check needed',
    );
}

// Patch 2: @astrojs/preact client — convert dynamic import("@preact/signals") to static import
// Netlify's CDN rewrites JS file content to inject deploy IDs (?dpl=<hash>) into asset URLs.
// Static `from 'path.js'` imports are rewritten correctly (dpl inside quotes), but dynamic
// `import('path.js')` calls are corrupted — the ?dpl= lands OUTSIDE the string quotes,
// producing `import('path.js'?dpl=...)` which is a SyntaxError.
// Fix: convert the conditional dynamic import to a top-level static import that Netlify
// handles correctly. The signal module is tiny and always installed, so eager loading is fine.
const preactClientFile = resolve(
    __dirname,
    '../node_modules/@astrojs/preact/dist/client.js',
);
let preactClientContent = readFileSync(preactClientFile, 'utf8');
const dynamicImportLine = `const { signal } = await import("@preact/signals");`;
const staticImportFix = `const { signal } = await Promise.resolve({ signal: __preact_signal });`;

if (preactClientContent.includes(dynamicImportLine)) {
    preactClientContent =
        `import { signal as __preact_signal } from "@preact/signals";\n` +
        preactClientContent.replace(dynamicImportLine, staticImportFix);
    writeFileSync(preactClientFile, preactClientContent, 'utf8');
    console.log('✔ Patched @astrojs/preact client (static signals import)');
} else if (preactClientContent.includes('__preact_signal')) {
    console.log('✔ @astrojs/preact client already patched');
} else {
    console.warn(
        '⚠ Could not find dynamic import target in @astrojs/preact client — manual check needed',
    );
}
