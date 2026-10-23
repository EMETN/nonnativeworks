#!/usr/bin/env node
// Reads prod with the anon key only, so RLS limits the copy to public rows.

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toAppEnv } from './local-supabase-env.mjs';
import { readStatus } from './local-supabase-stack.mjs';
import { assertLocalUrl } from './seed-local.mjs';

// Parents first: inserts run in this order, clearing in reverse.
export const TABLES = [
    'countries',
    'categories',
    'companies',
    'positions',
    'company_snapshots',
    'skills',
];
// Not public, so never copied, but cleared: stale logs would show as unpublished
// changes, and skill_snapshots would block deleting skills and categories.
const LOCAL_ONLY = [
    'admin_changes',
    'site_publishes',
    'site_builds',
    'skill_snapshots',
];
const KEY_COLUMN = { site_builds: 'deploy_id' };
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 500;

// Loops on the exact count: PostgREST's max_rows can return short pages mid-table.
export async function fetchAll(client, table, pageSize = PAGE_SIZE) {
    const rows = [];
    let total = Infinity;
    while (rows.length < total) {
        const { data, count, error } = await client
            .from(table)
            .select('*', { count: 'exact' })
            .order('id')
            .range(rows.length, rows.length + pageSize - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        if (count !== null) total = count;
        if (data.length === 0) break;
        rows.push(...data);
    }
    return rows;
}

export function assertSafeTarget(sourceUrl, targetUrl) {
    if (new URL(sourceUrl).origin === new URL(targetUrl).origin) {
        throw new Error(
            'Target is the source project; refusing to overwrite it.',
        );
    }
    assertLocalUrl(targetUrl);
}

export function parseSource(secrets) {
    const url = secrets.SUPABASE_URL?.computed;
    const anonKey = secrets.SUPABASE_ANON_KEY?.computed;
    if (!url) throw new Error('Source is missing SUPABASE_URL.');
    if (!anonKey) throw new Error('Source is missing SUPABASE_ANON_KEY.');
    return { url, anonKey };
}

export function clearOrder({ keepCategories }) {
    return [...LOCAL_ONLY, ...[...TABLES].reverse()].filter(
        (table) => !(keepCategories && table === 'categories'),
    );
}

export async function clearTables(client, tables) {
    for (const table of tables) {
        const { error } = await client
            .from(table)
            .delete()
            .not(KEY_COLUMN[table] ?? 'id', 'is', null);
        if (error) throw new Error(`clear ${table}: ${error.message}`);
    }
}

export async function copyPublicData({ source, target, log = console.log }) {
    const data = {};
    for (const table of TABLES) data[table] = await fetchAll(source, table);

    await clearTables(target, clearOrder({ keepCategories: false }));

    const copied = {};
    for (const table of TABLES) {
        for (let i = 0; i < data[table].length; i += INSERT_CHUNK) {
            const { error } = await target
                .from(table)
                .insert(data[table].slice(i, i + INSERT_CHUNK));
            if (error) throw new Error(`insert ${table}: ${error.message}`);
        }
        copied[table] = data[table].length;
        log(`${table}: ${copied[table]}`);
    }
    return copied;
}

// Fetches only the URL and anon key, so prod's service key never enters this process.
function readSource() {
    let json;
    try {
        json = execFileSync(
            'doppler',
            [
                'secrets',
                'get',
                'SUPABASE_URL',
                'SUPABASE_ANON_KEY',
                '--config',
                'prd',
                '--json',
            ],
            { encoding: 'utf8' },
        );
    } catch {
        throw new Error(
            "Copying prod needs read access to Doppler's prd config (maintainers only).",
        );
    }
    return parseSource(JSON.parse(json));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const source = readSource();
    const target = toAppEnv(readStatus().env);
    assertSafeTarget(source.url, target.SUPABASE_URL);

    const opts = { auth: { persistSession: false, autoRefreshToken: false } };
    await copyPublicData({
        source: createClient(source.url, source.anonKey, opts),
        target: createClient(
            target.SUPABASE_URL,
            target.SUPABASE_SERVICE_ROLE_KEY,
            opts,
        ),
    });
}
