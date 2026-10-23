import { test, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4398;
const BASE = `http://127.0.0.1:${PORT}`;
const FIXTURE = 'tests/fixtures/live-static-paths';

let dir: string;
let child: ChildProcess;

const writeSlugs = (slugs: string[]) =>
    writeFileSync(join(dir, 'slugs.json'), JSON.stringify(slugs));
const envWithoutVitest = () =>
    Object.fromEntries(
        Object.entries(process.env).filter(
            ([key]) => !key.startsWith('VITEST') && key !== 'NODE_ENV',
        ),
    );
const status = async (path: string) => (await fetch(`${BASE}${path}`)).status;

beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'live-static-paths-'));
    writeSlugs(['alpha']);

    child = spawn(
        'node',
        [
            'node_modules/astro/bin/astro.mjs',
            'dev',
            '--root',
            FIXTURE,
            '--port',
            String(PORT),
            '--host',
            '127.0.0.1',
            '--ignore-lock',
        ],
        {
            env: { ...envWithoutVitest(), SLUGS_FILE: join(dir, 'slugs.json') },
            stdio: 'ignore',
        },
    );

    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            await fetch(BASE, { signal: AbortSignal.timeout(1000) });
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
    throw new Error(`astro dev did not become ready on ${BASE}`);
});

afterAll(async () => {
    if (child?.exitCode === null) {
        await new Promise<void>((resolve) => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
        });
    }
    rmSync(dir, { recursive: true, force: true });
});

test('a path added after the first request renders without a restart', async () => {
    expect(await status('/alpha')).toBe(200);
    expect(await status('/beta')).toBe(404);

    writeSlugs(['alpha', 'beta']);

    expect(await status('/beta')).toBe(200);
});

test('a removed path stops rendering without a restart', async () => {
    writeSlugs(['beta']);

    expect(await status('/alpha')).toBe(404);
});
