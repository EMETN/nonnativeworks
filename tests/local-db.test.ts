import { beforeAll, describe, expect, test } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CATEGORIES } from '../src/lib/categories';

const url = process.env.SUPABASE_URL ?? '';
const isLocal = /^http:\/\/(127\.0\.0\.1|localhost):/.test(url);

describe.runIf(process.env.SUPABASE_LOCAL === '1' && isLocal)(
    'local database',
    () => {
        // In beforeAll: a skipped suite still runs its body, and createClient throws on an empty URL.
        let anon: SupabaseClient;
        let service: SupabaseClient;

        beforeAll(() => {
            anon = createClient(url, process.env.SUPABASE_ANON_KEY ?? '');
            service = createClient(
                url,
                process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
            );
        });

        test('migrations seed every category in CATEGORIES', async () => {
            const { count, error } = await anon
                .from('categories')
                .select('*', { count: 'exact', head: true });
            expect(error).toBeNull();
            expect(count).toBe(CATEGORIES.length);
        });

        test('public views are readable with the anon key', async () => {
            const { error } = await anon
                .from('country_stats')
                .select('*')
                .limit(1);
            expect(error).toBeNull();
        });

        test('anon cannot write', async () => {
            const { error } = await anon.from('countries').insert({
                name: 'Nowhere',
                code: 'ZZ',
                slug: 'nowhere',
                flag_colors: ['#000000'],
            });
            // 42501: rejected by RLS, not by a constraint.
            expect(error?.code).toBe('42501');
        });

        test('admin-only tables are hidden from anon', async () => {
            const { data } = await anon.from('admin_changes').select('*');
            expect(data ?? []).toHaveLength(0);
        });

        test('the service role can read admin-only tables', async () => {
            const { error } = await service
                .from('admin_changes')
                .select('*')
                .limit(1);
            expect(error).toBeNull();
        });
    },
);
