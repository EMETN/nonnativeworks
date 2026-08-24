import type { AstroCookies } from 'astro';
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
import { fetchAllCompanies } from './build-queries';

/**
 * Selects the Supabase client for a query (exported for tests). Dual-mode so a route
 * can switch between prerendered and on-demand without a data-layer rewrite.
 */
export function resolveClient(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
) {
    if (request && cookies) {
        return createSupabaseClient(request, cookies);
    }
    return createPublicClient();
}

const VALID_SLUG = /^[a-z0-9-]+$/;

function isValidSlug(slug: string): boolean {
    return VALID_SLUG.test(slug);
}

export async function getCountryStats(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
): Promise<CountryStats[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('country_stats')
        .select('*')
        .order('last_updated', { ascending: false, nullsFirst: false });

    if (error) {
        console.error('getCountryStats:', error.message);
        throw new Error('Failed to load country stats');
    }
    return data ?? [];
}

export async function getCompanyCountsByCountry(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
): Promise<Record<string, number>> {
    const supabase = resolveClient(request, cookies);
    const rows = await fetchAllCompanies<{ country_id: string }>(
        'country_id',
        supabase,
    );
    const counts: Record<string, number> = {};
    for (const row of rows) {
        counts[row.country_id] = (counts[row.country_id] || 0) + 1;
    }
    return counts;
}

export async function getGlobalStats(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
): Promise<GlobalStats> {
    const supabase = resolveClient(request, cookies);

    const [
        { count: totalCount, error: posErr },
        { count: englishCount, error: engErr },
        { data: companyCountData, error: compErr },
        { count: countryCount, error: countryErr },
    ] = await Promise.all([
        supabase.from('positions').select('*', { count: 'exact', head: true }),
        supabase
            .from('positions')
            .select('*', { count: 'exact', head: true })
            .eq('requires_native_language', false),
        supabase.rpc('count_distinct_companies'),
        supabase.from('countries').select('*', { count: 'exact', head: true }),
    ]);

    if (posErr) {
        console.error('getGlobalStats positions:', posErr.message);
        throw new Error('Failed to load global stats');
    }
    if (engErr) {
        console.error('getGlobalStats english positions:', engErr.message);
        throw new Error('Failed to load global stats');
    }
    if (compErr) {
        console.error('getGlobalStats companies:', compErr.message);
        throw new Error('Failed to load global stats');
    }
    if (countryErr) {
        console.error('getGlobalStats countries:', countryErr.message);
        throw new Error('Failed to load global stats');
    }

    const total = totalCount ?? 0;
    const english = englishCount ?? 0;

    return {
        total_positions: total,
        english_positions: english,
        english_percentage:
            total > 0 ? Math.round((english / total) * 1000) / 10 : 0,
        total_countries: countryCount ?? 0,
        total_companies: companyCountData ?? 0,
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
    career_page_url: string | null;
}

export async function getTopCompanies(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    limit = 5,
): Promise<TopCompany[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase.rpc('top_companies_by_english', {
        lim: limit,
    });

    if (error) {
        console.error('getTopCompanies:', error.message);
        throw new Error('Failed to load top companies');
    }

    return (data ?? []).map((r) => ({
        name: r.name,
        total_positions: Number(r.total_positions),
        english_positions: Number(r.english_positions),
        english_percentage: Number(r.english_percentage),
        country_count: Number(r.country_count),
        primary_country_slug: r.primary_country_slug,
        primary_company_slug: nameToSlug(r.name),
        career_page_url: r.career_page_url ?? null,
    }));
}

export async function getCountryBySlug(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    slug: string,
): Promise<CountryStats | null> {
    if (!isValidSlug(slug)) return null;

    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('country_stats')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error) return null;
    return data;
}

export async function getAllCountries(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
): Promise<Country[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('countries')
        .select('*')
        .order('sort_order');

    if (error) {
        console.error('getAllCountries:', error.message);
        throw new Error('Failed to load countries');
    }
    return data ?? [];
}

export async function getCompanyStatsByCountry(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    countryId: string,
): Promise<CompanyStats[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('company_stats')
        .select('*')
        .eq('country_id', countryId)
        .order('name');

    if (error) {
        console.error('getCompanyStatsByCountry:', error.message);
        throw new Error('Failed to load company stats');
    }
    return data ?? [];
}

export async function getCategoryBreakdown(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    countryId: string,
): Promise<CategoryBreakdown[]> {
    const supabase = resolveClient(request, cookies);

    const { data, error } = await supabase
        .from('positions')
        .select(
            `
      requires_native_language,
      category:categories(id, name, slug),
      company:companies!inner(country_id)
    `,
        )
        .eq('company.country_id', countryId);

    if (error) {
        console.error('getCategoryBreakdown:', error.message);
        throw new Error('Failed to load category breakdown');
    }

    const map = new Map<
        string,
        {
            id: string;
            name: string;
            slug: string;
            total: number;
            english: number;
        }
    >();

    for (const row of data ?? []) {
        const cat = row.category;
        if (!cat) continue;
        const entry = map.get(cat.id) ?? {
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            total: 0,
            english: 0,
        };
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
            english_percentage:
                e.total > 0 ? Math.round((e.english / e.total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.english_positions - a.english_positions);
}

export async function getPositionsByCountry(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    countryId: string,
): Promise<PositionDetail[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('positions')
        .select(
            `
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
    `,
        )
        .eq('company.country_id', countryId)
        .eq('requires_native_language', false);

    if (error) {
        console.error('getPositionsByCountry:', error.message);
        throw new Error('Failed to load positions');
    }

    return (data ?? []).map((row) => ({
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

export async function getAllCategories(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
): Promise<Category[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');

    if (error) {
        console.error('getAllCategories:', error.message);
        throw new Error('Failed to load categories');
    }
    return data ?? [];
}

export async function getCompanyBySlugInCountry(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    countryId: string,
    companySlug: string,
): Promise<CompanyStats | null> {
    if (!isValidSlug(companySlug)) return null;

    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('company_stats')
        .select('*')
        .eq('country_id', countryId);

    if (error) {
        console.error('getCompanyBySlugInCountry:', error.message);
        return null;
    }
    const match = (data ?? []).find((c) => nameToSlug(c.name) === companySlug);
    return match ?? null;
}

export async function getPositionsByCompany(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    companyId: string,
): Promise<PositionDetail[]> {
    const supabase = resolveClient(request, cookies);
    const { data, error } = await supabase
        .from('positions')
        .select(
            `
      id,
      company_id,
      title,
      url,
      city,
      work_model,
      requires_native_language,
      local_language_advantage,
      category:categories(name)
    `,
        )
        .eq('company_id', companyId);

    if (error) {
        console.error('getPositionsByCompany:', error.message);
        throw new Error('Failed to load positions');
    }

    return (data ?? []).map((row) => ({
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
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    companyId: string,
): Promise<CategoryBreakdown[]> {
    const supabase = resolveClient(request, cookies);

    const { data, error } = await supabase
        .from('positions')
        .select(
            `
      requires_native_language,
      category:categories(id, name, slug)
    `,
        )
        .eq('company_id', companyId);

    if (error) {
        console.error('getCategoryBreakdownByCompany:', error.message);
        throw new Error('Failed to load category breakdown');
    }

    const map = new Map<
        string,
        {
            id: string;
            name: string;
            slug: string;
            total: number;
            english: number;
        }
    >();

    for (const row of data ?? []) {
        const cat = row.category;
        if (!cat) continue;
        const entry = map.get(cat.id) ?? {
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            total: 0,
            english: 0,
        };
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
            english_percentage:
                e.total > 0 ? Math.round((e.english / e.total) * 1000) / 10 : 0,
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
        career_page_url: string | null;
        total_positions: number;
        english_positions: number;
        positions: PositionDetail[];
    }[];
}

export async function getGlobalCompanyBySlug(
    request: Request | undefined,
    cookies: AstroCookies | undefined,
    companySlug: string,
): Promise<GlobalCompanyData | null> {
    if (!isValidSlug(companySlug)) return null;

    const supabase = resolveClient(request, cookies);

    let nameRows: { name: string }[];
    try {
        nameRows = await fetchAllCompanies<{ name: string }>('name', supabase);
    } catch (err) {
        console.error('getGlobalCompanyBySlug names:', err);
        return null;
    }

    const uniqueNames = [...new Set(nameRows.map((r) => r.name))];
    const matchedName = uniqueNames.find((n) => nameToSlug(n) === companySlug);
    if (!matchedName) return null;

    const { data: statsData, error: statsErr } = await supabase
        .from('company_stats')
        .select('*')
        .eq('name', matchedName);
    if (statsErr) {
        console.error('getGlobalCompanyBySlug:', statsErr.message);
        return null;
    }

    const matches = statsData ?? [];
    if (matches.length === 0) return null;

    const countryIds = [...new Set(matches.map((m) => m.country_id))];
    const companyIds = matches.map((m) => m.company_id);

    const [{ data: countryData }, { data: posData }] = await Promise.all([
        supabase
            .from('countries')
            .select('id, name, slug, code')
            .in('id', countryIds),
        supabase
            .from('positions')
            .select(
                `
      id, company_id, title, url, city, work_model,
      requires_native_language, local_language_advantage,
      category:categories(name)
    `,
            )
            .in('company_id', companyIds),
    ]);

    const countryMap = new Map((countryData ?? []).map((c) => [c.id, c]));
    const positionsByCompany = new Map<string, PositionDetail[]>();
    for (const row of posData ?? []) {
        const list = positionsByCompany.get(row.company_id) ?? [];
        list.push({
            id: row.id,
            company_id: row.company_id,
            title: row.title,
            url: row.url ?? null,
            city: row.city ?? null,
            work_model: row.work_model ?? null,
            category_name: row.category?.name ?? 'Other',
            requires_native_language: row.requires_native_language,
            local_language_advantage: row.local_language_advantage ?? false,
        });
        positionsByCompany.set(row.company_id, list);
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
                career_page_url: m.career_page_url,
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
        updated_at: matches.reduce(
            (latest, m) => (m.updated_at > latest ? m.updated_at : latest),
            matches[0].updated_at,
        ),
        entries,
    };
}
