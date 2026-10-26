#!/usr/bin/env node
// The CLI keys each stack on the git branch, so reuse this project's one stack by id:
// otherwise a checkout hides it and `start` creates a second database.

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function stackIdArgs(stacks, projectRoot) {
    const own = stacks.filter((s) => s.project_root === projectRoot);
    if (own.length > 1) {
        const list = own.map((s) => `${s.id} (${s.branch_context})`).join(', ');
        throw new Error(
            `Several local stacks for this project: ${list}. Keep one and remove the rest with \`supabase stack destroy --stack-id <id>\`.`,
        );
    }
    return own.length ? ['--stack-id', own[0].id] : [];
}

export function currentStackIdArgs() {
    const { stacks } = JSON.parse(
        execFileSync('supabase', ['stack', 'list', '--output-format', 'json'], {
            encoding: 'utf8',
        }),
    );
    return stackIdArgs(stacks ?? [], realpathSync(process.cwd()));
}

export function readStatus() {
    let output;
    try {
        output = execFileSync(
            'supabase',
            ['status', '--output-format', 'json', ...currentStackIdArgs()],
            { encoding: 'utf8' },
        );
    } catch {
        throw new Error(
            'No running local Supabase. Start it with `pnpm db:start`.',
        );
    }
    return JSON.parse(output);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const command = process.argv[2];
    if (command !== 'start' && command !== 'stop') {
        console.error('Usage: local-supabase-stack.mjs start|stop');
        process.exit(1);
    }
    const args =
        command === 'start' ? ['start', '--runtime', 'native'] : ['stop'];
    execFileSync('supabase', [...args, ...currentStackIdArgs()], {
        stdio: 'inherit',
    });
}
