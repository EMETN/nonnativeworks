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

        test('top_companies_by_english leaves regions out of country_count', async () => {
            const name = 'Region Count Test Co';
            const { data: land, error: landErr } = await service
                .from('countries')
                .insert({
                    name: 'Region Test Land',
                    code: 'ZY',
                    slug: 'region-test-land',
                    flag_colors: ['#000000'],
                })
                .select('id')
                .single();
            expect(landErr).toBeNull();

            try {
                const [{ data: europe }, { data: category }] =
                    await Promise.all([
                        service
                            .from('countries')
                            .select('id')
                            .eq('code', 'EU')
                            .single(),
                        service
                            .from('categories')
                            .select('id')
                            .limit(1)
                            .single(),
                    ]);

                const { data: companies, error: companyErr } = await service
                    .from('companies')
                    .insert(
                        [land!.id, europe!.id].map((country_id) => ({
                            name,
                            country_id,
                        })),
                    )
                    .select('id');
                expect(companyErr).toBeNull();

                const { error: positionErr } = await service
                    .from('positions')
                    .insert(
                        companies!.map((c) => ({
                            company_id: c.id,
                            category_id: category!.id,
                            title: 'Engineer',
                            requires_native_language: false,
                        })),
                    );
                expect(positionErr).toBeNull();

                const { data, error } = await anon.rpc(
                    'top_companies_by_english',
                    { lim: 0 },
                );
                expect(error).toBeNull();
                const row = data.find((r: { name: string }) => r.name === name);
                expect(row.country_count).toBe(1);
                expect(row.has_region_positions).toBe(true);
                expect(row.primary_country_slug).toBe('region-test-land');
            } finally {
                await service.from('companies').delete().eq('name', name);
                await service.from('countries').delete().eq('id', land!.id);
            }
        });

        test('top_companies_by_english counts a job listed in several countries once', async () => {
            const name = 'Shared Job Test Co';
            const { data: lands, error: landErr } = await service
                .from('countries')
                .insert(
                    ['ZV', 'ZU'].map((code) => ({
                        name: `Shared Test Land ${code}`,
                        code,
                        slug: `shared-test-land-${code.toLowerCase()}`,
                        flag_colors: ['#000000'],
                    })),
                )
                .select('id');
            expect(landErr).toBeNull();

            try {
                const { data: category } = await service
                    .from('categories')
                    .select('id')
                    .limit(1)
                    .single();
                const { data: companies, error: companyErr } = await service
                    .from('companies')
                    .insert(lands!.map((l) => ({ name, country_id: l.id })))
                    .select('id');
                expect(companyErr).toBeNull();

                const { error: positionErr } = await service
                    .from('positions')
                    .insert([
                        ...companies!.map((c) => ({
                            company_id: c.id,
                            category_id: category!.id,
                            title: 'Engineer',
                            url: 'https://jobs.example/shared',
                            requires_native_language: false,
                        })),
                        ...['Analyst', 'Clerk'].map((title) => ({
                            company_id: companies![0].id,
                            category_id: category!.id,
                            title,
                            requires_native_language: title === 'Clerk',
                        })),
                    ]);
                expect(positionErr).toBeNull();

                const { data, error } = await anon.rpc(
                    'top_companies_by_english',
                    { lim: 0 },
                );
                expect(error).toBeNull();
                const row = data.find((r: { name: string }) => r.name === name);
                expect(row.total_positions).toBe(3);
                expect(row.english_positions).toBe(2);
                expect(Number(row.english_percentage)).toBe(67);
                expect(row.country_count).toBe(2);
            } finally {
                await service.from('companies').delete().eq('name', name);
                await service
                    .from('countries')
                    .delete()
                    .in(
                        'id',
                        lands!.map((l) => l.id),
                    );
            }
        });

        test('top_companies_by_english counts only countries and Europe with English-friendly positions', async () => {
            const name = 'English Count Test Co';
            const { data: lands, error: landErr } = await service
                .from('countries')
                .insert(
                    ['ZX', 'ZW'].map((code) => ({
                        name: `English Test Land ${code}`,
                        code,
                        slug: `english-test-land-${code.toLowerCase()}`,
                        flag_colors: ['#000000'],
                    })),
                )
                .select('id');
            expect(landErr).toBeNull();

            try {
                const [{ data: europe }, { data: category }] =
                    await Promise.all([
                        service
                            .from('countries')
                            .select('id')
                            .eq('code', 'EU')
                            .single(),
                        service
                            .from('categories')
                            .select('id')
                            .limit(1)
                            .single(),
                    ]);

                const [english, nativeOnly] = lands!;
                const { data: companies, error: companyErr } = await service
                    .from('companies')
                    .insert(
                        [english.id, nativeOnly.id, europe!.id].map(
                            (country_id) => ({ name, country_id }),
                        ),
                    )
                    .select('id, country_id');
                expect(companyErr).toBeNull();

                const { error: positionErr } = await service
                    .from('positions')
                    .insert(
                        companies!.map((c) => ({
                            company_id: c.id,
                            category_id: category!.id,
                            title: 'Engineer',
                            requires_native_language:
                                c.country_id !== english.id,
                        })),
                    );
                expect(positionErr).toBeNull();

                const { data, error } = await anon.rpc(
                    'top_companies_by_english',
                    { lim: 0 },
                );
                expect(error).toBeNull();
                const row = data.find((r: { name: string }) => r.name === name);
                expect(row.country_count).toBe(1);
                expect(row.has_region_positions).toBe(false);
                expect(row.total_positions).toBe(3);
            } finally {
                await service.from('companies').delete().eq('name', name);
                await service
                    .from('countries')
                    .delete()
                    .in(
                        'id',
                        lands!.map((l) => l.id),
                    );
            }
        });
    },
);
