import { test, expect, vi, beforeAll } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/preact/container-renderer';
import { loadRenderers } from 'astro:container';
import HomePage from '../../src/pages/index.astro';
import NotFoundPage from '../../src/pages/404.astro';
import CompaniesPage from '../../src/pages/companies/index.astro';
import CountriesPage from '../../src/pages/countries.astro';
import * as queries from '../../src/lib/queries';
import type { TopCompany } from '../../src/lib/queries';
import type { CountryStats } from '../../src/lib/types';

vi.mock('../../src/lib/queries', () => ({
    getCountryStats: vi.fn(),
    getCompanyCountsByCountry: vi.fn(),
    getGlobalStats: vi.fn(),
    getTopCompanies: vi.fn(),
}));

let container: AstroContainer;

beforeAll(async () => {
    const renderers = await loadRenderers([getContainerRenderer()]);
    container = await AstroContainer.create({ renderers });

    vi.mocked(queries.getCountryStats).mockResolvedValue([
        {
            name: 'Finland',
            code: 'FI',
            slug: 'finland',
            total_positions: 10,
            english_positions: 6,
        } as CountryStats,
    ]);
    vi.mocked(queries.getCompanyCountsByCountry).mockResolvedValue({
        Finland: 1,
    });
    vi.mocked(queries.getGlobalStats).mockResolvedValue({
        total_positions: 10,
        english_positions: 6,
        total_companies: 1,
    } as Awaited<ReturnType<typeof queries.getGlobalStats>>);
    vi.mocked(queries.getTopCompanies).mockResolvedValue([
        {
            name: 'Acme',
            primary_company_slug: 'acme',
            total_positions: 10,
            english_positions: 6,
            english_percentage: 60,
        } as TopCompany,
    ]);
});

test.each([
    ['companies', CompaniesPage],
    ['countries', CountriesPage],
])('the %s list page has a back-to-top button', async (_name, Page) => {
    const html = await container.renderToString(Page);

    expect(html).toContain('aria-label="Back to top"');
});

test.each([
    ['home', HomePage],
    ['404', NotFoundPage],
])('the short %s page has no back-to-top button', async (_name, Page) => {
    const html = await container.renderToString(Page);

    expect(html).not.toContain('Back to top');
});
