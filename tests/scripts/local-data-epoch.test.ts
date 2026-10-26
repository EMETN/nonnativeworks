import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
    bumpLocalDataEpoch,
    readLocalDataEpoch,
} from '../../scripts/local-data-epoch.mjs';

const dirs: string[] = [];

function epochFile() {
    const dir = mkdtempSync(join(tmpdir(), 'epoch-'));
    dirs.push(dir);
    return join(dir, 'nested', 'local-data-epoch');
}

afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

describe('local data epoch', () => {
    test('is undefined before any bump', () => {
        expect(readLocalDataEpoch(epochFile())).toBeUndefined();
    });

    test('replaces the previous epoch on bump', () => {
        const file = epochFile();
        bumpLocalDataEpoch(file);
        writeFileSync(file, 'previous');
        bumpLocalDataEpoch(file);
        expect(readLocalDataEpoch(file)).toMatch(/^\d+$/);
    });
});
