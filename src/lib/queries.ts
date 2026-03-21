import type { AstroCookies } from 'astro';
import { createSupabaseClient } from './supabase';
import type {
  CountryStats,
  CompanyStats,
  GlobalStats,
  CategoryBreakdown,
  Country,
  Category,
  PositionDetail,
} from './types';

function client(request: Request, cookies: AstroCookies) {
  return createSupabaseClient(request, cookies);
}

export async function getCountryStats(request: Request, cookies: AstroCookies): Promise<CountryStats[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('country_stats')
    .select('*')
    .order('last_updated', { ascending: false, nullsFirst: false });

  if (error) { console.error('getCountryStats:', error.message); throw new Error('Failed to load country stats'); }
  return (data ?? []) as CountryStats[];
}

export async function getGlobalStats(request: Request, cookies: AstroCookies): Promise<GlobalStats> {
  const supabase = client(request, cookies);

  const { data: positionData, error: posErr } = await supabase
    .from('positions')
    .select('requires_native_language', { count: 'exact' });

  if (posErr) { console.error('getGlobalStats positions:', posErr.message); throw new Error('Failed to load global stats'); }

  const { count: companyCount, error: compErr } = await supabase
    .from('companies')
    .select('*', { count: 'exact', head: true });

  if (compErr) { console.error('getGlobalStats companies:', compErr.message); throw new Error('Failed to load global stats'); }

  const { count: countryCount, error: countryErr } = await supabase
    .from('countries')
    .select('*', { count: 'exact', head: true });

  if (countryErr) { console.error('getGlobalStats countries:', countryErr.message); throw new Error('Failed to load global stats'); }

  const positions = positionData ?? [];
  const total = positions.length;
  const english = positions.filter((p) => !p.requires_native_language).length;

  return {
    total_positions: total,
    english_positions: english,
    english_percentage: total > 0 ? Math.round((english / total) * 1000) / 10 : 0,
    total_countries: countryCount ?? 0,
    total_companies: companyCount ?? 0,
  };
}

export async function getCountryBySlug(
  request: Request,
  cookies: AstroCookies,
  slug: string
): Promise<CountryStats | null> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('country_stats')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) return null;
  return data as CountryStats;
}

export async function getAllCountries(request: Request, cookies: AstroCookies): Promise<Country[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('countries')
    .select('*')
    .order('sort_order');

  if (error) { console.error('getAllCountries:', error.message); throw new Error('Failed to load countries'); }
  return (data ?? []) as Country[];
}

export async function getCompanyStatsByCountry(
  request: Request,
  cookies: AstroCookies,
  countryId: string
): Promise<CompanyStats[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('company_stats')
    .select('*')
    .eq('country_id', countryId)
    .order('name');

  if (error) { console.error('getCompanyStatsByCountry:', error.message); throw new Error('Failed to load company stats'); }
  return (data ?? []) as CompanyStats[];
}

export async function getCategoryBreakdown(
  request: Request,
  cookies: AstroCookies,
  countryId: string
): Promise<CategoryBreakdown[]> {
  const supabase = client(request, cookies);

  const { data, error } = await supabase
    .from('positions')
    .select(`
      requires_native_language,
      category:categories(id, name, slug),
      company:companies!inner(country_id)
    `)
    .eq('company.country_id', countryId);

  if (error) { console.error('getCategoryBreakdown:', error.message); throw new Error('Failed to load category breakdown'); }

  const map = new Map<
    string,
    { id: string; name: string; slug: string; total: number; english: number }
  >();

  for (const row of data ?? []) {
    const cat = (row.category as unknown as { id: string; name: string; slug: string } | null);
    if (!cat || Array.isArray(cat)) continue;
    const entry = map.get(cat.id) ?? { id: cat.id, name: cat.name, slug: cat.slug, total: 0, english: 0 };
    entry.total += 1;
    if (!row.requires_native_language) entry.english += 1;
    map.set(cat.id, entry);
  }

  return Array.from(map.values())
    .map((e) => ({
      category_id: e.id,
      category_name: e.name,
      category_slug: e.slug,
      total_positions: e.total,
      english_positions: e.english,
      english_percentage: e.total > 0 ? Math.round((e.english / e.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.english_positions - a.english_positions);
}

export async function getPositionsByCountry(
  request: Request,
  cookies: AstroCookies,
  countryId: string
): Promise<PositionDetail[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('positions')
    .select(`
      id,
      company_id,
      title,
      url,
      requires_native_language,
      local_language_advantage,
      category:categories(name),
      company:companies!inner(country_id)
    `)
    .eq('company.country_id', countryId);

  if (error) { console.error('getPositionsByCountry:', error.message); throw new Error('Failed to load positions'); }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    url: row.url ?? null,
    category_name: row.category?.name ?? 'Other',
    requires_native_language: row.requires_native_language,
    local_language_advantage: row.local_language_advantage ?? false,
  }));
}

export async function getAllCategories(request: Request, cookies: AstroCookies): Promise<Category[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  if (error) { console.error('getAllCategories:', error.message); throw new Error('Failed to load categories'); }
  return (data ?? []) as Category[];
}
