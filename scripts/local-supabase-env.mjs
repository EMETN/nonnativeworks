#!/usr/bin/env node
// Writes the local stack's URL and keys to .env.supabase. --doppler also writes them
// to dev_personal, since Doppler values override env files.

import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readStatus } from './local-supabase-stack.mjs';

export function toAppEnv(statusEnv) {
    const url = statusEnv?.API_URL;
    const anon = statusEnv?.ANON_KEY ?? statusEnv?.PUBLISHABLE_KEY;
    const service = statusEnv?.SERVICE_ROLE_KEY ?? statusEnv?.SECRET_KEY;
    if (!url || !anon || !service) {
        throw new Error(
            'No local Supabase credentials found. Start the stack with `pnpm db:start`.',
        );
    }
    return {
        SUPABASE_URL: url,
        SUPABASE_ANON_KEY: anon,
        SUPABASE_SERVICE_ROLE_KEY: service,
    };
}

export function formatEnv(env) {
    return Object.entries(env)
        .map(([key, value]) => `${key}=${value}\n`)
        .join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const env = toAppEnv(readStatus().env);
    writeFileSync('.env.supabase', formatEnv(env));
    console.log(`Wrote .env.supabase (${env.SUPABASE_URL})`);

    if (process.argv.includes('--doppler')) {
        console.log(
            'Overwriting SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in dev_personal. Note your current values first if they point at your own project.',
        );
        execFileSync(
            'doppler',
            [
                'secrets',
                'set',
                '--config',
                'dev_personal',
                ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
            ],
            { stdio: 'inherit' },
        );
    }
}
