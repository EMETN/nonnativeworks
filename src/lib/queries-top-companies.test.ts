import { expect, test, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({
    createPublicClient: () => ({ rpc }),
    createSupabaseClient: () => ({ rpc }),
}));

const { getTopCompanies } = await import('./queries');

const row = {
    name: 'Acme',
    total_positions: 3,
    english_positions: 2,
    english_percentage: 66.7,
    country_count: 1,
    primary_country_slug: 'finland',
    career_page_url: null,
};

test('has_region_positions defaults to false when the RPC omits it', async () => {
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    const [company] = await getTopCompanies(undefined, undefined);
    expect(company.has_region_positions).toBe(false);
});

test('has_region_positions is kept when the RPC returns it', async () => {
    rpc.mockResolvedValueOnce({
        data: [{ ...row, has_region_positions: true }],
        error: null,
    });
    const [company] = await getTopCompanies(undefined, undefined);
    expect(company.has_region_positions).toBe(true);
});
