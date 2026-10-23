import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const EPOCH_FILE = fileURLToPath(
    new URL('../supabase/.temp/local-data-epoch', import.meta.url),
);

// Scripts can't reach the browser, so the dev admin layout hands this to admin-cache.ts.
export function bumpLocalDataEpoch(file = EPOCH_FILE) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, String(Date.now()));
}

export function readLocalDataEpoch(file = EPOCH_FILE) {
    try {
        return readFileSync(file, 'utf8').trim() || undefined;
    } catch {
        return undefined;
    }
}
