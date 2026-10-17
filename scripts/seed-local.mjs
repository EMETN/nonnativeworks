#!/usr/bin/env node
// Creates (or resets) the local admin login. Refuses anything but the local stack.

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { toAppEnv } from './local-supabase-env.mjs';

export function assertLocalUrl(url) {
    if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url ?? '')) {
        throw new Error(`Refusing to seed a non-local database: ${url}`);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const status = JSON.parse(
        execFileSync('supabase', ['status', '--output-format', 'json'], {
            encoding: 'utf8',
        }),
    );
    const env = toAppEnv(status.env);
    assertLocalUrl(env.SUPABASE_URL);

    const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const email = 'admin@local.test';
    const password = randomBytes(12).toString('base64url');
    const attrs = {
        password,
        email_confirm: true,
        app_metadata: { role: 'admin' },
    };

    const { data, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;
    const existing = data.users.find((u) => u.email === email);
    const { error } = existing
        ? await supabase.auth.admin.updateUserById(existing.id, attrs)
        : await supabase.auth.admin.createUser({ email, ...attrs });
    if (error) throw error;

    console.log(`Local admin: ${email} / ${password}`);
}
