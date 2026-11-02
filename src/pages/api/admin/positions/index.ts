import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../../lib/supabase';

export const prerender = false;

const PAGE_SIZE = 1000;

const ENRICHED_SELECT =
    'id, title, url, requires_native_language, local_language_advantage, required_education, category:categories(id, name, slug), company:companies(name, country:countries(name))';

export const GET: APIRoute = async ({ url }) => {
    const companyIds = url.searchParams.getAll('company_id');
    const countryId = url.searchParams.get('country_id');
    const supabase = createSupabaseServiceClient();

    let scopedIds = companyIds.length > 0 ? companyIds : null;

    if (!scopedIds && countryId) {
        const { data: cos, error: coErr } = await supabase
            .from('companies')
            .select('id')
            .eq('country_id', countryId);

        if (coErr) return json({ error: coErr.message }, 500);

        scopedIds = (cos ?? []).map((c: { id: string }) => c.id);
        if (scopedIds.length === 0) return json([], 200);
    }

    const select = () => {
        const query = supabase.from('positions').select(ENRICHED_SELECT);
        return scopedIds ? query.in('company_id', scopedIds) : query;
    };

    const positions = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await select()
            .order('id')
            .range(from, from + PAGE_SIZE - 1);
        if (error) return json({ error: error.message }, 500);

        positions.push(...(data ?? []));
        if ((data ?? []).length < PAGE_SIZE) break;
    }

    const rows = positions.map((p) => {
        const company = Array.isArray(p.company) ? p.company[0] : p.company;
        const country = company
            ? Array.isArray(company.country)
                ? company.country[0]
                : company.country
            : null;
        return {
            ...p,
            company: company
                ? {
                      name: company.name,
                      country_name: country?.name ?? '—',
                  }
                : null,
        };
    });

    rows.sort((a, b) => {
        const byCompany = (a.company?.name ?? '').localeCompare(
            b.company?.name ?? '',
        );
        return byCompany !== 0
            ? byCompany
            : (a.title ?? '').localeCompare(b.title ?? '');
    });

    return json(rows, 200);
};

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
