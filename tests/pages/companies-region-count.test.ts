import { test, expect, vi, beforeAll } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/preact/container-renderer';
import { loadRenderers } from 'astro:container';
import CompaniesPage from '../../src/pages/companies/index.astro';
import * as queries from '../../src/lib/queries';
import type { TopCompany } from '../../src/lib/queries';

vi.mock('../../src/lib/queries', () => ({
    getGlobalStats: vi.fn(),
    getTopCompanies: vi.fn(),
}));

const FOOTNOTE = '* Includes fully remote positions open across Europe.';

const topCompany = (
    name: string,
    country_count: number,
    has_region_positions: boolean,
): TopCompany => ({
    name,
    primary_company_slug: name.toLowerCase(),
    primary_country_slug: 'finland',
    total_positions: 10,
    english_positions: 6,
    english_percentage: 60,
    country_count,
    has_region_positions,
    career_page_url: null,
});

let container: AstroContainer;

beforeAll(async () => {
    const renderers = await loadRenderers([getContainerRenderer()]);
    container = await AstroContainer.create({ renderers });
    vi.mocked(queries.getGlobalStats).mockResolvedValue({
        total_positions: 30,
        english_positions: 18,
        total_companies: 3,
    } as Awaited<ReturnType<typeof queries.getGlobalStats>>);
});

test('a company with Europe positions gets an asterisked count and the footnote', async () => {
    vi.mocked(queries.getTopCompanies).mockResolvedValue([
        topCompany('Acme', 3, true),
        topCompany('Remoteco', 0, true),
        topCompany('Plainco', 2, false),
    ]);

    const html = await container.renderToString(CompaniesPage);

    expect(html).toMatch(
        /aria-hidden="true">3<span class="absolute left-full">\*<\/span>/,
    );
    expect(html).toContain(
        '3 countries, includes fully remote positions open across Europe',
    );
    expect(html).toMatch(/aria-hidden="true">Remote<\/span>/);
    expect(html).toContain('Fully remote across Europe');
    expect(html).not.toMatch(/>2<span class="absolute/);
    expect(html).toContain(FOOTNOTE);
});

test('no footnote when no company has Europe positions', async () => {
    vi.mocked(queries.getTopCompanies).mockResolvedValue([
        topCompany('Plainco', 2, false),
    ]);

    const html = await container.renderToString(CompaniesPage);

    expect(html).not.toContain('left-full">*');
    expect(html).not.toContain(FOOTNOTE);
});
