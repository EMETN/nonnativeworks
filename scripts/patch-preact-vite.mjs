/**
 * Patches @preact/preset-vite to handle `this === undefined` in Vite 6's config hook.
 * See: https://github.com/preactjs/preset-vite/issues
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const file = resolve(__dirname, '../node_modules/@preact/preset-vite/dist/esm/index.mjs');

let content = readFileSync(file, 'utf8');
const before = `"meta" in this && this.meta && typeof this.meta === "object"`;
const after  = `this != null && "meta" in this && this.meta && typeof this.meta === "object"`;

if (content.includes(before)) {
  writeFileSync(file, content.replace(before, after), 'utf8');
  console.log('✔ Patched @preact/preset-vite');
} else if (content.includes(after)) {
  console.log('✔ @preact/preset-vite already patched');
} else {
  console.warn('⚠ Could not find patch target in @preact/preset-vite — manual check needed');
}
