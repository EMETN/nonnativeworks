import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseServiceClient } from '../../../lib/supabase';
import { UploadSchema, normaliseUpload } from '../../../lib/validation';
import type { CompanyEntry } from '../../../lib/validation';
import { getFlagColors, nameToSlug } from '../../../lib/country-flags';

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

export const POST: APIRoute = async ({ request }) => {
    // Check content length before parsing
    const contentLength = parseInt(
        request.headers.get('content-length') ?? '0',
        10,
    );
    if (contentLength > MAX_BODY_SIZE) {
        return json({ error: 'Request body too large' }, 413);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = UploadSchema.safeParse(body);
    if (!parsed.success) {
        console.error(
            'Upload validation failed:',
            JSON.stringify(parsed.error.issues, null, 2),
        );
        return json(
            { error: 'Validation failed', issues: parsed.error.issues },
            422,
        );
    }

    const entries = normaliseUpload(parsed.data);
    const supabase = createSupabaseServiceClient();

    // Pre-load lookup tables
    const { data: countryRows } = await supabase
        .from('countries')
        .select('id, slug, sort_order');
    const { data: categoryRows } = await supabase
        .from('categories')
        .select('id, slug');
    const { data: skillRows } = await supabase
        .from('skills')
        .select('id, canonical_name');

    if (!countryRows || !categoryRows) {
        return json({ error: 'Could not load reference data' }, 500);
    }

    const countryMap = new Map(
        countryRows.map((c: { slug: string; id: string }) => [c.slug, c.id]),
    );
    const categoryMap = new Map(
        categoryRows.map((c: { slug: string; id: string }) => [c.slug, c.id]),
    );
    const skillIdMap = new Map(
        (skillRows ?? []).map((s: { canonical_name: string; id: string }) => [
            s.canonical_name,
            s.id,
        ]),
    );
    const maxSortOrder = Math.max(
        0,
        ...countryRows.map((c: { sort_order: number }) => c.sort_order),
    );

    const results: {
        company: string;
        country: string;
        positions: number;
        countryCreated?: boolean;
    }[] = [];
    const errors: { company: string; country: string; error: string }[] = [];

    // Track newly created countries within this request to avoid duplicate inserts
    let nextSortOrder = maxSortOrder + 1;

    for (const entry of entries) {
        try {
            // Auto-create country if unknown
            if (!countryMap.has(entry.country)) {
                const newCountryId = await ensureCountry(
                    supabase,
                    entry,
                    nextSortOrder,
                );
                countryMap.set(entry.country, newCountryId);
                nextSortOrder++;
            }

            const result = await upsertEntry(
                supabase,
                entry,
                countryMap,
                categoryMap,
                skillIdMap,
            );
            results.push(result);
        } catch (err) {
            console.error(`Upload error for ${entry.company_name}:`, err);
            errors.push({
                company: entry.company_name,
                country: entry.country,
                error: 'Failed to process entry',
            });
        }
    }

    if (errors.length > 0 && results.length === 0) {
        return json({ error: 'All entries failed', errors }, 500);
    }

    return json({ ok: true, results, errors }, errors.length > 0 ? 207 : 200);
};

async function ensureCountry(
    supabase: SupabaseClient,
    entry: CompanyEntry,
    sortOrder: number,
): Promise<string> {
    const slug = nameToSlug(entry.country_name);
    const { data, error } = await supabase
        .from('countries')
        .insert({
            name: entry.country_name,
            slug,
            code: entry.country_code,
            flag_colors: getFlagColors(entry.country_code),
            sort_order: sortOrder,
        })
        .select('id')
        .single();

    if (error || !data) {
        throw new Error(
            `Could not create country "${entry.country_name}": ${error?.message}`,
        );
    }

    return data.id;
}

async function upsertEntry(
    supabase: SupabaseClient,
    entry: CompanyEntry,
    countryMap: Map<string, string>,
    categoryMap: Map<string, string>,
    skillIdMap: Map<string, string>,
) {
    const {
        company_name,
        country,
        career_page_url,
        is_english_company,
        positions,
    } = entry;

    const countryId = countryMap.get(country)!;

    const { data: companyRow, error: companyErr } = await supabase
        .from('companies')
        .upsert(
            {
                name: company_name,
                country_id: countryId,
                career_page_url: career_page_url || null,
                is_english_company,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'name,country_id', ignoreDuplicates: false },
        )
        .select('id')
        .single();

    if (companyErr || !companyRow) {
        throw new Error(`Could not upsert company: ${companyErr?.message}`);
    }

    await supabase.from('positions').delete().eq('company_id', companyRow.id);

    const positionRows = positions.map((p) => ({
        company_id: companyRow.id,
        title: p.title,
        url: p.url || null,
        city: p.city ?? null,
        work_model: p.work_model ?? null,
        category_id: categoryMap.get(p.category) ?? categoryMap.get('other'),
        requires_native_language: p.requires_native_language,
        local_language_advantage: p.local_language_advantage ?? false,
        required_languages: p.required_languages ?? [],
        preferred_languages: p.preferred_languages ?? [],
        skills: p.skills ?? [],
        required_education: p.required_education ?? null,
        extracted_at: new Date().toISOString(),
    }));

    const { error: insertErr } = await supabase
        .from('positions')
        .insert(positionRows);
    if (insertErr)
        throw new Error(`Could not insert positions: ${insertErr.message}`);

    // Daily snapshots — one record per (company, country) per calendar day
    await takeSnapshotIfNeeded(supabase, company_name, countryId, positions);
    await takeSkillSnapshotIfNeeded(
        supabase,
        companyRow.id,
        countryId,
        positions,
        categoryMap,
        skillIdMap,
    );

    return { company: company_name, country, positions: positions.length };
}

async function takeSnapshotIfNeeded(
    supabase: SupabaseClient,
    companyName: string,
    countryId: string,
    positions: CompanyEntry['positions'],
) {
    try {
        const today = new Date().toISOString().slice(0, 10); // "2026-03-23"
        const { data: existing } = await supabase
            .from('company_snapshots')
            .select('id')
            .eq('company_name', companyName)
            .eq('country_id', countryId)
            .gte('snapshotted_at', `${today}T00:00:00Z`)
            .maybeSingle();

        if (!existing) {
            const englishCount = positions.filter(
                (p) => !p.requires_native_language,
            ).length;
            await supabase.from('company_snapshots').insert({
                company_name: companyName,
                country_id: countryId,
                total_positions: positions.length,
                english_positions: englishCount,
            });
        }
    } catch (err) {
        // Snapshot failure must not fail the upload
        console.error('Snapshot insert failed (non-fatal):', err);
    }
}

async function takeSkillSnapshotIfNeeded(
    supabase: SupabaseClient,
    companyId: string,
    countryId: string,
    positions: CompanyEntry['positions'],
    categoryMap: Map<string, string>,
    skillIdMap: Map<string, string>,
) {
    try {
        const today = new Date().toISOString().slice(0, 10);

        // Aggregate: count (category_id, skill_id) pairs across positions
        const counts = new Map<string, number>();
        const meta = new Map<
            string,
            { category_id: string; skill_id: string }
        >();

        for (const pos of positions) {
            if (!pos.skills?.length) continue;
            const categoryId =
                categoryMap.get(pos.category) ?? categoryMap.get('other');
            if (!categoryId) continue;

            for (const skill of pos.skills) {
                const skillId = skillIdMap.get(skill);
                if (!skillId) continue;
                const key = `${categoryId}:${skillId}`;
                counts.set(key, (counts.get(key) ?? 0) + 1);
                meta.set(key, { category_id: categoryId, skill_id: skillId });
            }
        }

        if (counts.size === 0) return;

        const rows = Array.from(counts.entries()).map(([key, count]) => ({
            captured_at: today,
            company_id: companyId,
            country_id: countryId,
            category_id: meta.get(key)!.category_id,
            skill_id: meta.get(key)!.skill_id,
            position_count: count,
        }));

        await supabase.from('skill_snapshots').upsert(rows, {
            onConflict:
                'captured_at,company_id,country_id,category_id,skill_id',
            ignoreDuplicates: true,
        });
    } catch (err) {
        // Snapshot failure must not fail the upload
        console.error('Skill snapshot insert failed (non-fatal):', err);
    }
}

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
