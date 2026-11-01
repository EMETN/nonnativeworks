#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { toAppEnv } from './local-supabase-env.mjs';
import { currentStackIdArgs, readStatus } from './local-supabase-stack.mjs';

function run(command, args) {
    execFileSync(command, args, { stdio: 'inherit' });
}

process.env.PATH = `${resolve('node_modules/.bin')}:${process.env.PATH}`;

const [, stackId] = currentStackIdArgs();

// Lockfile only, so the stack can stop before the install replaces the binary under it.
run('pnpm', ['update', '--latest', '!@types/node', '--lockfile-only']);
run('pnpm', ['update', '@types/node', '--lockfile-only']);

const { devDependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
const installedCli = execFileSync('supabase', ['--version'], {
    encoding: 'utf8',
}).trim();
if (stackId && installedCli !== devDependencies.supabase) {
    run('node', ['scripts/local-supabase-stack.mjs', 'stop']);
}

run('pnpm', ['install']);

// The new CLI can't clean up a stack it can't read.
if (stackId && !currentStackIdArgs().includes(stackId)) {
    rmSync(join(homedir(), '.supabase', 'stacks', stackId), {
        recursive: true,
        force: true,
    });
}

run('pnpm', ['db:start']);

const env = toAppEnv(readStatus().env);
const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/companies?select=id&limit=1`,
    { headers: { apikey: env.SUPABASE_ANON_KEY } },
);
if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
if ((await response.json()).length === 0) {
    run('pnpm', ['db:env']);
    run('pnpm', ['db:seed']);
    run('pnpm', ['db:copy-prod']);
}

const ruff = await fetch('https://pypi.org/pypi/ruff/json');
if (!ruff.ok) throw new Error(`PyPI returned ${ruff.status}`);
const { info } = await ruff.json();
const pyproject = 'scraper/pyproject.toml';
writeFileSync(
    pyproject,
    readFileSync(pyproject, 'utf8').replace(
        /"ruff==[^"]+"/,
        `"ruff==${info.version}"`,
    ),
);
run('pip', ['install', '--quiet', '--group', `${pyproject}:dev`]);

run('pnpm', ['format']);
run('pnpm', ['format:py']);
