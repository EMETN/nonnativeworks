import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET: APIRoute = async () => {
  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from('company_stats')
    .select('company_id, name, country_id, total_positions, updated_at')
    .order('name');

  if (error) {
    console.error('GET /api/admin/companies:', error.message);
    return json({ error: 'Failed to load companies' }, 500);
  }

  // Enrich with country name
  const { data: countries } = await supabase
    .from('countries')
    .select('id, name');

  const countryMap = new Map(
    (countries ?? []).map((c: { id: string; name: string }) => [c.id, c.name])
  );

  const rows = (data ?? []).map((co: {
    company_id: string;
    name: string;
    country_id: string;
    total_positions: number;
    updated_at: string;
  }) => ({
    company_id: co.company_id,
    name: co.name,
    country_name: countryMap.get(co.country_id) ?? '—',
    total_positions: co.total_positions,
    updated_at: co.updated_at,
  }));

  return json(rows, 200);
};

export const DELETE: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  if (!id || !UUID_RE.test(id)) {
    return json({ error: 'Invalid or missing id parameter' }, 400);
  }

  const supabase = createSupabaseServiceClient();

  // Positions cascade-delete via FK, so just delete the company
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('DELETE /api/admin/companies:', error.message);
    return json({ error: 'Failed to delete company' }, 500);
  }

  return json({ ok: true }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
