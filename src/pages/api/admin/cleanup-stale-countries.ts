import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { company_name, keep_countries } = (body ?? {}) as Record<string, unknown>;

  if (typeof company_name !== 'string' || !company_name.trim()) {
    return json({ error: 'Missing or invalid company_name' }, 400);
  }
  if (!Array.isArray(keep_countries) || keep_countries.length === 0) {
    return json({ error: 'keep_countries must be a non-empty array of country slugs' }, 400);
  }

  const supabase = createSupabaseServiceClient();

  // Resolve slugs → IDs for the countries we want to keep
  const { data: keepRows, error: lookupErr } = await supabase
    .from('countries')
    .select('id')
    .in('slug', keep_countries);

  if (lookupErr) {
    console.error('cleanup-stale-countries lookup error:', lookupErr.message);
    return json({ error: lookupErr.message }, 500);
  }

  const keepIdSet = new Set((keepRows ?? []).map((r: { id: string }) => r.id));
  if (keepIdSet.size === 0) {
    console.error('cleanup-stale-countries: no countries matched slugs', keep_countries);
    return json({ error: 'No matching countries found for keep_countries' }, 400);
  }

  // Find all company rows for this name, then delete the ones not in keepIdSet.
  // Using a two-step approach (fetch then delete by id) instead of .not('country_id','in',...)
  // because the PostgREST NOT IN filter is unreliable with UUID arrays.
  const { data: existingRows, error: fetchErr } = await supabase
    .from('companies')
    .select('id, country_id')
    .eq('name', company_name);

  if (fetchErr) {
    console.error('cleanup-stale-countries fetch error:', fetchErr.message);
    return json({ error: fetchErr.message }, 500);
  }

  const staleIds = (existingRows ?? [])
    .filter((r: { country_id: string }) => !keepIdSet.has(r.country_id))
    .map((r: { id: string }) => r.id);

  if (staleIds.length === 0) {
    return json({ ok: true, deleted: 0 }, 200);
  }

  // Positions cascade-delete automatically via ON DELETE CASCADE.
  const { error: deleteErr } = await supabase
    .from('companies')
    .delete()
    .in('id', staleIds);

  if (deleteErr) {
    console.error('cleanup-stale-countries delete error:', deleteErr.message);
    return json({ error: deleteErr.message }, 500);
  }

  console.log(`cleanup-stale-countries: deleted ${staleIds.length} stale rows for "${company_name}"`);
  return json({ ok: true, deleted: staleIds.length }, 200);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
