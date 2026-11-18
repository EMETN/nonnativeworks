import { test, expect, vi, beforeAll } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/preact/container-renderer';
import { loadRenderers } from 'astro:container';
import CountriesPage from '../../src/pages/countries.astro';
import * as queries from '../../src/lib/queries';
import type { CountryStats } from '../../src/lib/types';

vi.mock('../../src/lib/queries', () => ({
    getCountryStats: vi.fn(),
    getCompanyCountsByCountry: vi.fn(),
    getGlobalStats: vi.fn(),
}));

let container: AstroContainer;

beforeAll(async () => {
    const renderers = await loadRenderers([getContainerRenderer()]);
    container = await AstroContainer.create({ renderers });

    vi.mocked(queries.getCountryStats).mockResolvedValue([
        {
            country_id: 'no',
            name: 'Norway',
            code: 'NO',
            slug: 'norway',
            total_positions: 120,
            english_positions: 89,
        } as CountryStats,
    ]);
    vi.mocked(queries.getCompanyCountsByCountry).mockResolvedValue({
        no: { hiring: 21, tracked: 36 },
    });
    vi.mocked(queries.getGlobalStats).mockResolvedValue({
        total_positions: 120,
        english_positions: 89,
        total_companies: 36,
    } as Awaited<ReturnType<typeof queries.getGlobalStats>>);
});

test('a country row shows the hiring company count and labels the tracked total', async () => {
    const html = await container.renderToString(CountriesPage);

    expect(html).toMatch(/>\s*21\s*</);
    expect(html).toContain(
        '<span class="sr-only">21 of 36 tracked companies hiring without the local language</span>',
    );
    expect(html).not.toMatch(/>\s*36\s*</);
});
