import type { AstroCookies } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, createPublicClient } from './supabase';
import type {
  CountryStats,
  CompanyStats,
  GlobalStats,
  CategoryBreakdown,
  Country,
  Category,
  PositionDetail,
} from './types';
import { nameToSlug } from './country-flags';

function client(request?: Request, cookies?: AstroCookies, supabase?: SupabaseClient) {
  if (supabase) return supabase;
  if (request && cookies) return createSupabaseClient(request, cookies);
  return createPublicClient();
}

const VALID_SLUG = /^[a-z0-9-]+$/;

function isValidSlug(slug: string): boolean {
  return VALID_SLUG.test(slug);
}

export async function getCountryStats(request?: Request, cookies?: AstroCookies, supabase?: SupabaseClient): Promise<CountryStats[]> {
  const sb = client(request, cookies, supabase);
  const { data, error } = await sb
    .from('country_stats')
    .select('*')
    .order('last_updated', { ascending: false, nullsFirst: false });

  if (error) { console.error('getCountryStats:', error.message); throw new Error('Failed to load country stats'); }
  return (data ?? []) as CountryStats[];
}

export async function getCompanyCountsByCountry(request?: Request, cookies?: AstroCookies, supabase?: SupabaseClient): Promise<Record<string, number>> {
  const sb = client(request, cookies, supabase);
  const { data, error } = await sb
    .from('companies')
    .select('country_id');

  if (error) { console.error('getCompanyCountsByCountry:', error.message); throw new Error('Failed to load company counts'); }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.country_id] = (counts[row.country_id] || 0) + 1;
  }
  return counts;
}

export async function getGlobalStats(request?: Request, cookies?: AstroCookies, supabase?: SupabaseClient): Promise<GlobalStats> {
  const sb = client(request, cookies, supabase);

  const [
    { count: totalCount, error: posErr },
    { count: englishCount, error: engErr },
    { data: companyCountData, error: compErr },
    { count: countryCount, error: countryErr },
  ] = await Promise.all([
    sb.from('positions').select('*', { count: 'exact', head: true }),
    sb.from('positions').select('*', { count: 'exact', head: true }).eq('requires_native_language', false),
    sb.rpc('count_distinct_companies'),
    sb.from('countries').select('*', { count: 'exact', head: true }),
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

export async function getTopCompanies(request?: Request, cookies?: AstroCookies, limit = 5, supabase?: SupabaseClient): Promise<TopCompany[]> {
  const sb = client(request, cookies, supabase);
  const { data, error } = await sb
    .rpc('top_companies_by_english', { lim: limit });

  if (error) { console.error('getTopCompanies:', error.message); throw new Error('Failed to load top companies'); }

  return ((data ?? []) as TopCompany[]).map((r) => ({
    name: r.name,
    total_positions: Number(r.total_positions),
    english_positions: Number(r.english_positions),
    english_percentage: Number(r.english_percentage),
    country_count: Number(r.country_count),
    primary_country_slug: r.primary_country_slug,
    primary_company_slug: nameToSlug(r.name),
  }));
}

export async function getCountryBySlug(
  request?: Request,
  cookies?: AstroCookies,
  slug?: string,
  supabase?: SupabaseClient,
): Promise<CountryStats | null> {
  if (!slug || !isValidSlug(slug)) return null;

  const sb = client(request, cookies, supabase);
  const { data, error } = await sb
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
  request?: Request,
  cookies?: AstroCookies,
  countryId?: string,
  supabase?: SupabaseClient,
): Promise<CompanyStats[]> {
  if (!countryId) return [];
  const sb = client(request, cookies, supabase);
  const { data, error } = await sb
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
  if (!isValidSlug(companySlug)) return null;

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

export interface GlobalCompanyData {
  name: string;
  is_english_company: boolean;
  career_page_url: string | null;
  total_positions: number;
  english_positions: number;
  updated_at: string;
  entries: {
    company_id: string;
    country_id: string;
    country_name: string;
    country_slug: string;
    country_code: string;
    total_positions: number;
    english_positions: number;
    positions: PositionDetail[];
  }[];
}

export async function getGlobalCompanyBySlug(
  request?: Request,
  cookies?: AstroCookies,
  companySlug?: string,
  supabase?: SupabaseClient,
): Promise<GlobalCompanyData | null> {
  if (!companySlug || !isValidSlug(companySlug)) return null;

  const sb = client(request, cookies, supabase);

  const { data: nameRows, error: nameErr } = await sb
    .from('companies')
    .select('name');
  if (nameErr) { console.error('getGlobalCompanyBySlug names:', nameErr.message); return null; }

  const uniqueNames = [...new Set((nameRows ?? []).map((r: any) => r.name as string))];
  const matchedName = uniqueNames.find((n) => nameToSlug(n) === companySlug);
  if (!matchedName) return null;

  const { data: statsData, error: statsErr } = await sb
    .from('company_stats')
    .select('*')
    .eq('name', matchedName);
  if (statsErr) { console.error('getGlobalCompanyBySlug:', statsErr.message); return null; }

  const matches = (statsData ?? []) as CompanyStats[];
  if (matches.length === 0) return null;

  const countryIds = [...new Set(matches.map((m) => m.country_id))];
  const companyIds = matches.map((m) => m.company_id);

  const [{ data: countryData }, { data: posData }] = await Promise.all([
    sb.from('countries').select('id, name, slug, code').in('id', countryIds),
    sb.from('positions').select(`
      id, company_id, title, url, city, work_model,
      requires_native_language, local_language_advantage,
      category:categories(name)
    `).in('company_id', companyIds),
  ]);

  const countryMap = new Map((countryData ?? []).map((c: any) => [c.id, c]));
  const positionsByCompany = new Map<string, PositionDetail[]>();
  for (const row of posData ?? []) {
    const r = row as any;
    const list = positionsByCompany.get(r.company_id) ?? [];
    list.push({
      id: r.id,
      company_id: r.company_id,
      title: r.title,
      url: r.url ?? null,
      city: r.city ?? null,
      work_model: r.work_model ?? null,
      category_name: r.category?.name ?? 'Other',
      requires_native_language: r.requires_native_language,
      local_language_advantage: r.local_language_advantage ?? false,
    });
    positionsByCompany.set(r.company_id, list);
  }

  const first = matches[0];
  const entries = matches
    .map((m) => {
      const country = countryMap.get(m.country_id);
      return {
        company_id: m.company_id,
        country_id: m.country_id,
        country_name: country?.name ?? '',
        country_slug: country?.slug ?? '',
        country_code: country?.code ?? '',
        total_positions: m.total_positions,
        english_positions: m.english_positions,
        positions: positionsByCompany.get(m.company_id) ?? [],
      };
    })
    .sort((a, b) => b.english_positions - a.english_positions);

  return {
    name: first.name,
    is_english_company: first.is_english_company,
    career_page_url: first.career_page_url,
    total_positions: matches.reduce((s, m) => s + m.total_positions, 0),
    english_positions: matches.reduce((s, m) => s + m.english_positions, 0),
    updated_at: matches.reduce((latest, m) => m.updated_at > latest ? m.updated_at : latest, matches[0].updated_at),
    entries,
  };
}
