// Runs `ruff format` on the given files for the pre-commit hook.
//
// Git GUIs (GitHub Desktop) spawn hooks with a minimal PATH that misses the
// devcontainer venv, so a bare `ruff` fails with ENOENT and takes the other
// lint-staged tasks down with it. Probe the known venvs first, and skip rather
// than fail when ruff isn't installed at all — CI runs `ruff format --check`.

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const candidates = [
    '/opt/scraper-venv/bin/ruff',
    join(process.cwd(), 'scraper', '.venv', 'bin', 'ruff'),
    join(process.cwd(), '.venv', 'bin', 'ruff'),
];

const files = process.argv.slice(2);
if (files.length === 0) process.exit(0);

const onPath = spawnSync('ruff', ['--version'], { stdio: 'ignore' });
const ruff = onPath.status === 0 ? 'ruff' : candidates.find(existsSync);

if (!ruff) {
    console.log('ruff not found — skipping format (CI will check)');
    process.exit(0);
}

const result = spawnSync(ruff, ['format', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
