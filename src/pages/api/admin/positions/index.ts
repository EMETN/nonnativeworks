import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../../lib/supabase';

const ENRICHED_SELECT =
  'id, title, url, requires_native_language, local_language_advantage, required_education, category:categories(id, name, slug), company:companies(name, country:countries(name))';

/** GET /api/admin/positions
 *  - `?company_id=<uuid>` → positions for that one company (lean shape).
 *  - `?country_id=<uuid>` → positions for every company in that country (enriched).
 *  - no param            → positions across all companies (enriched).
 *  Enriched rows carry company name + country and are sorted by company then title.
 */
export const GET: APIRoute = async ({ url }) => {
  const companyId = url.searchParams.get('company_id');
  const countryId = url.searchParams.get('country_id');
  const supabase = createSupabaseServiceClient();

  if (companyId) {
    const { data, error } = await supabase
      .from('positions')
      .select('id, title, url, requires_native_language, local_language_advantage, required_education, category:categories(id, name, slug)')
      .eq('company_id', companyId)
      .order('title');

    if (error) return json({ error: error.message }, 500);

    return json(data ?? [], 200);
  }

  let query = supabase.from('positions').select(ENRICHED_SELECT);

  if (countryId) {
    // Scope to companies in this country.
    const { data: cos, error: coErr } = await supabase
      .from('companies')
      .select('id')
      .eq('country_id', countryId);

    if (coErr) return json({ error: coErr.message }, 500);

    const ids = (cos ?? []).map((c: { id: string }) => c.id);
    if (ids.length === 0) return json([], 200);

    query = query.in('company_id', ids);
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const rows = (data ?? []).map((p: Record<string, any>) => ({
    ...p,
    company: p.company
      ? { name: p.company.name, country_name: p.company.country?.name ?? '—' }
      : null,
  }));

  rows.sort((a, b) => {
    const byCompany = (a.company?.name ?? '').localeCompare(b.company?.name ?? '');
    return byCompany !== 0 ? byCompany : (a.title ?? '').localeCompare(b.title ?? '');
  });

  return json(rows, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
