import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';
import { recordChange, changedBy } from '../../../lib/admin-changes';

export const prerender = false;

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async () => {
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
        .from('company_stats')
        .select(
            'company_id, name, country_id, career_page_url, total_positions, updated_at',
        )
        .order('name');

    if (error) {
        console.error('GET /api/admin/companies:', error.message);
        return json({ error: 'Failed to load companies' }, 500);
    }

    // Enrich with country name
    const { data: countries } = await supabase
        .from('countries')
        .select('id, name');

    const countryMap = new Map((countries ?? []).map((c) => [c.id, c.name]));

    const rows = (data ?? []).map((co) => ({
        company_id: co.company_id,
        name: co.name,
        country_id: co.country_id,
        country_name: countryMap.get(co.country_id) ?? '—',
        career_page_url: co.career_page_url ?? null,
        total_positions: co.total_positions,
        updated_at: co.updated_at,
    }));

    return json(rows, 200);
};

export const DELETE: APIRoute = async ({ url, locals, request }) => {
    const supabase = createSupabaseServiceClient();

    // ?name=<company name> — delete all countries for a company in one go
    const name = url.searchParams.get('name');
    if (name) {
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('name', name);

        if (error) {
            console.error(
                'DELETE /api/admin/companies (by name):',
                error.message,
            );
            return json({ error: 'Failed to delete company' }, 500);
        }

        await recordChange(supabase, {
            entity_type: 'company',
            action: 'deleted',
            label: name,
            changed_by: changedBy(locals, request),
        });

        return json({ ok: true }, 200);
    }

    // ?id=<uuid> — delete a single company row (kept for potential future use)
    const id = url.searchParams.get('id');
    if (!id || !UUID_RE.test(id)) {
        return json({ error: 'Provide either ?name= or a valid ?id=' }, 400);
    }

    const { data: existing } = await supabase
        .from('companies')
        .select('name')
        .eq('id', id)
        .maybeSingle();

    const { error } = await supabase.from('companies').delete().eq('id', id);

    if (error) {
        console.error('DELETE /api/admin/companies (by id):', error.message);
        return json({ error: 'Failed to delete company' }, 500);
    }

    await recordChange(supabase, {
        entity_type: 'company',
        action: 'deleted',
        label: existing?.name ?? id,
        changed_by: changedBy(locals, request),
    });

    return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
