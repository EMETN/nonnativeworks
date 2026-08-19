import { createPublicClient } from './supabase';
import { computeRanges, mapWithConcurrency } from './pagination';
import type { CompanyStats, PositionDetail } from './types';

/**
 * PostgREST's default cap; a dashboard override wouldn't be visible here,
 * so keep paging regardless.
 */
const PAGE_SIZE = 1000;

/** Bounded so a large build does not open one connection per page. */
const CONCURRENCY = 5;

/** Groups rows by a derived key, preserving input order within each group. */
export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
    const grouped = new Map<K, T[]>();
    for (const row of rows) {
        const k = key(row);
        const existing = grouped.get(k);
        if (existing) {
            existing.push(row);
        } else {
            grouped.set(k, [row]);
        }
    }
    return grouped;
}

const POSITION_COLUMNS = `
    id,
    company_id,
    title,
    url,
    city,
    work_model,
    requires_native_language,
    local_language_advantage,
    category:categories(name)
`;

/**
 * Reads every position in one pass, paged and in parallel;
 * mirrors getPositionsByCompany's row shape.
 */
export async function fetchAllPositions(): Promise<PositionDetail[]> {
    const supabase = createPublicClient();

    const { count, error: countError } = await supabase
        .from('positions')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('fetchAllPositions (count):', countError.message);
        throw new Error('Failed to count positions');
    }

    const ranges = computeRanges(count ?? 0, PAGE_SIZE);

    const pages = await mapWithConcurrency(
        ranges,
        CONCURRENCY,
        async (range) => {
            const { data, error } = await supabase
                .from('positions')
                .select(POSITION_COLUMNS)
                .order('id')
                .range(range.from, range.to);

            if (error) {
                console.error('fetchAllPositions (page):', error.message);
                throw new Error('Failed to load positions');
            }
            return data ?? [];
        },
    );

    return pages.flat().map((row) => ({
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

export async function fetchAllCompanyStats(): Promise<CompanyStats[]> {
    const supabase = createPublicClient();

    const { count, error: countError } = await supabase
        .from('company_stats')
        .select('*', { count: 'exact', head: true });

    if (countError) {
        console.error('fetchAllCompanyStats (count):', countError.message);
        throw new Error('Failed to count company stats');
    }

    const ranges = computeRanges(count ?? 0, PAGE_SIZE);

    const pages = await mapWithConcurrency(
        ranges,
        CONCURRENCY,
        async (range) => {
            const { data, error } = await supabase
                .from('company_stats')
                .select('*')
                .order('name')
                .range(range.from, range.to);

            if (error) {
                console.error('fetchAllCompanyStats (page):', error.message);
                throw new Error('Failed to load company stats');
            }
            return data ?? [];
        },
    );

    return pages.flat();
}
