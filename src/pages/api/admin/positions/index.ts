import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../../lib/supabase';

/** GET /api/admin/positions?company_id=<uuid>
 *  Returns positions with their category info. With `company_id`, scoped to that
 *  company. Without it, returns positions across all companies, each enriched with
 *  its company name + country and sorted by company then title.
 */
export const GET: APIRoute = async ({ url }) => {
  const companyId = url.searchParams.get('company_id');
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

  // All companies: include company + country so each row is identifiable.
  const { data, error } = await supabase
    .from('positions')
    .select('id, title, url, requires_native_language, local_language_advantage, required_education, category:categories(id, name, slug), company:companies(name, country:countries(name))');

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
