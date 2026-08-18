export interface PageRange {
    /** Inclusive lower bound, matching Supabase `.range()`. */
    from: number;
    /** Inclusive upper bound, matching Supabase `.range()`. */
    to: number;
}

/**
 * Splits a known row count into inclusive page ranges.
 *
 * PostgREST caps responses at 1000 rows and returns no error when it truncates,
 * so every bulk read must page explicitly rather than relying on a single call.
 */
export function computeRanges(total: number, pageSize: number): PageRange[] {
    if (pageSize <= 0) {
        throw new Error('pageSize must be a positive integer');
    }
    if (total <= 0) {
        return [];
    }

    const ranges: PageRange[] = [];
    for (let from = 0; from < total; from += pageSize) {
        ranges.push({ from, to: Math.min(from + pageSize, total) - 1 });
    }
    return ranges;
}

/**
 * Runs `fn` over `items` with at most `limit` in flight, preserving input order.
 *
 * Pages are fetched concurrently because sequential paging dominates build time
 * once the table is large; the limit keeps a big build from opening a hundred
 * simultaneous connections against Supabase.
 */
export async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
    if (limit <= 0) {
        throw new Error('limit must be a positive integer');
    }

    const results = new Array<R>(items.length);
    let next = 0;

    const workers = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            for (;;) {
                const index = next;
                next += 1;
                if (index >= items.length) return;
                results[index] = await fn(items[index], index);
            }
        },
    );

    await Promise.all(workers);
    return results;
}
