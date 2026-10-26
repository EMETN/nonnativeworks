#!/usr/bin/env node
// Empties the local stack back to a freshly migrated state, keeping the admin login.

import { createClient } from '@supabase/supabase-js';
import { clearOrder, clearTables } from './copy-public-data.mjs';
import { bumpLocalDataEpoch } from './local-data-epoch.mjs';
import { toAppEnv } from './local-supabase-env.mjs';
import { readStatus } from './local-supabase-stack.mjs';
import { assertLocalUrl } from './seed-local.mjs';

const env = toAppEnv(readStatus().env);
assertLocalUrl(env.SUPABASE_URL);

const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
await clearTables(client, clearOrder({ keepCategories: true }));
bumpLocalDataEpoch();
console.log(`Cleared the local database (${env.SUPABASE_URL}).`);
