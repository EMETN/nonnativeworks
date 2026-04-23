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
  Company,
} from './types';
import { nameToSlug } from './country-flags';

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

export async function getCompanyCountsByCountry(request: Request, cookies: AstroCookies): Promise<Record<string, number>> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('companies')
    .select('country_id');

  if (error) { console.error('getCompanyCountsByCountry:', error.message); throw new Error('Failed to load company counts'); }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.country_id] = (counts[row.country_id] || 0) + 1;
  }
  return counts;
}

export async function getGlobalStats(request: Request, cookies: AstroCookies): Promise<GlobalStats> {
  const supabase = client(request, cookies);

  const [
    { count: totalCount, error: posErr },
    { count: englishCount, error: engErr },
    { data: companyCountData, error: compErr },
    { count: countryCount, error: countryErr },
  ] = await Promise.all([
    supabase.from('positions').select('*', { count: 'exact', head: true }),
    supabase.from('positions').select('*', { count: 'exact', head: true }).eq('requires_native_language', false),
    supabase.rpc('count_distinct_companies'),
    supabase.from('countries').select('*', { count: 'exact', head: true }),
  ]);

  if (posErr) { console.error('getGlobalStats positions:', posErr.message); throw new Error('Failed to load global stats'); }
  if (engErr) { console.error('getGlobalStats english positions:', engErr.message); throw new Error('Failed to load global stats'); }
  if (compErr) { console.error('getGlobalStats companies:', compErr.message); throw new Error('Failed to load global stats'); }
  if (countryErr) { console.error('getGlobalStats countries:', countryErr.message); throw new Error('Failed to load global stats'); }

  const total = totalCount ?? 0;
  const english = englishCount ?? 0;

  return {
    total_positions: total,
    english_positions: english,
    english_percentage: total > 0 ? Math.round((english / total) * 1000) / 10 : 0,
    total_countries: countryCount ?? 0,
    total_companies: (companyCountData as number | null) ?? 0,
  };
}

export interface TopCompany {
  name: string;
  total_positions: number;
  english_positions: number;
  english_percentage: number;
  country_count: number;
  primary_country_slug: string;
  primary_company_slug: string;
}

export async function getTopCompanies(request: Request, cookies: AstroCookies, limit = 5): Promise<TopCompany[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('company_stats')
    .select('*');

  if (error) { console.error('getTopCompanies:', error.message); throw new Error('Failed to load top companies'); }

  const rows = (data ?? []) as CompanyStats[];
  const grouped = new Map<string, { total: number; english: number; entries: { country_id: string; english: number; name: string }[] }>();
  for (const row of rows) {
    const key = row.name;
    const entry = grouped.get(key) ?? { total: 0, english: 0, entries: [] };
    entry.total += row.total_positions;
    entry.english += row.english_positions;
    entry.entries.push({ country_id: row.country_id, english: row.english_positions, name: row.name });
    grouped.set(key, entry);
  }

  const sorted = [...grouped.entries()]
    .map(([name, g]) => ({ name, ...g }))
    .sort((a, b) => b.english - a.english)
    .slice(0, limit);

  const countryIds = [...new Set(sorted.flatMap((s) => s.entries.map((e) => e.country_id)))];
  const { data: countryData } = await supabase
    .from('countries')
    .select('id, name, slug')
    .in('id', countryIds);

  const countryMap = new Map((countryData ?? []).map((c: any) => [c.id, { name: c.name, slug: c.slug }]));

  return sorted.map((s) => {
    const best = s.entries.sort((a, b) => b.english - a.english)[0];
    const country = countryMap.get(best.country_id);
    return {
      name: s.name,
      total_positions: s.total,
      english_positions: s.english,
      english_percentage: s.total > 0 ? Math.round((s.english / s.total) * 100) : 0,
      country_count: s.entries.length,
      primary_country_slug: country?.slug ?? '',
      primary_company_slug: nameToSlug(best.name),
    };
  });
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
      city,
      work_model,
      requires_native_language,
      local_language_advantage,
      category:categories(name),
      company:companies!inner(country_id)
    `)
    .eq('company.country_id', countryId)
    .eq('requires_native_language', false);

  if (error) { console.error('getPositionsByCountry:', error.message); throw new Error('Failed to load positions'); }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    url: row.url ?? null,
    city: row.city ?? null,
    work_model: row.work_model ?? null,
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

export async function getCompanyBySlugInCountry(
  request: Request,
  cookies: AstroCookies,
  countryId: string,
  companySlug: string
): Promise<CompanyStats | null> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('company_stats')
    .select('*')
    .eq('country_id', countryId);

  if (error) { console.error('getCompanyBySlugInCountry:', error.message); return null; }
  const match = (data ?? []).find((c: any) => nameToSlug(c.name) === companySlug);
  return (match as CompanyStats) ?? null;
}

export async function getPositionsByCompany(
  request: Request,
  cookies: AstroCookies,
  companyId: string
): Promise<PositionDetail[]> {
  const supabase = client(request, cookies);
  const { data, error } = await supabase
    .from('positions')
    .select(`
      id,
      company_id,
      title,
      url,
      city,
      work_model,
      requires_native_language,
      local_language_advantage,
      category:categories(name)
    `)
    .eq('company_id', companyId);

  if (error) { console.error('getPositionsByCompany:', error.message); throw new Error('Failed to load positions'); }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    company_id: row.company_id,
    title: row.title,
    url: row.url ?? null,
    city: row.city ?? null,
    work_model: row.work_model ?? null,
    category_name: row.category?.name ?? 'Other',
    requires_native_language: row.requires_native_language,
    local_language_advantage: row.local_language_advantage ?? false,
  }));
}

export async function getCategoryBreakdownByCompany(
  request: Request,
  cookies: AstroCookies,
  companyId: string
): Promise<CategoryBreakdown[]> {
  const supabase = client(request, cookies);

  const { data, error } = await supabase
    .from('positions')
    .select(`
      requires_native_language,
      category:categories(id, name, slug)
    `)
    .eq('company_id', companyId);

  if (error) { console.error('getCategoryBreakdownByCompany:', error.message); throw new Error('Failed to load category breakdown'); }

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
