import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../../lib/supabase';

/** GET /api/admin/positions?company_id=<uuid>
 *  Returns all positions for a company with their category info.
 */
export const GET: APIRoute = async ({ url }) => {
  const companyId = url.searchParams.get('company_id');
  if (!companyId) {
    return json({ error: 'Missing query param: company_id' }, 400);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('positions')
    .select('id, title, url, requires_native_language, local_language_advantage, required_education, category:categories(id, name, slug)')
    .eq('company_id', companyId)
    .order('title');

  if (error) return json({ error: error.message }, 500);

  return json(data ?? [], 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
