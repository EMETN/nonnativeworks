import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../../../lib/supabase';

const VALID_CATEGORIES = ['language', 'framework', 'database', 'cloud', 'tool', 'methodology', 'api_style', 'certification', 'platform'] as const;

export const GET: APIRoute = async ({ url }) => {
  const category = url.searchParams.get('category');
  if (category && !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, 400);
  }

  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from('skills')
    .select('id, canonical_name, category, aliases, is_legacy')
    .order('canonical_name');

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    console.error('GET /api/admin/skills:', error.message);
    return json({ error: 'Failed to load skills' }, 500);
  }

  return json(data ?? [], 200);
};

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { canonical_name, category, aliases, is_legacy } = body as Record<string, unknown>;

  if (typeof canonical_name !== 'string' || !canonical_name.trim()) {
    return json({ error: 'canonical_name is required' }, 400);
  }
  if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    return json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, 400);
  }
  if (!Array.isArray(aliases) || !aliases.every((a) => typeof a === 'string')) {
    return json({ error: 'aliases must be an array of strings' }, 400);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('skills')
    .insert({
      canonical_name: canonical_name.trim(),
      category,
      aliases: aliases.map((a: string) => a.trim().toLowerCase()).filter(Boolean),
      is_legacy: is_legacy === true,
    })
    .select('id, canonical_name, category, aliases, is_legacy')
    .single();

  if (error) {
    if (error.code === '23505') {
      return json({ error: `A skill named "${canonical_name.trim()}" already exists` }, 409);
    }
    console.error('POST /api/admin/skills:', error.message);
    return json({ error: 'Failed to create skill' }, 500);
  }

  return json(data, 201);
};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
