import { test, expect, vi, beforeAll, beforeEach } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { getContainerRenderer } from '@astrojs/preact/container-renderer';
import { loadRenderers } from 'astro:container';
import HomePage from '../../src/pages/index.astro';
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

const SUGGEST_COMPANY = 'https://tally.so/r/xXb80y';
const SUGGEST_COUNTRY = 'https://tally.so/r/xXb80o';

const country = {
    name: 'Finland',
    code: 'FI',
    slug: 'finland',
    total_positions: 10,
    english_positions: 6,
} as CountryStats;

const company = {
    name: 'Acme',
    primary_company_slug: 'acme',
    total_positions: 10,
    english_positions: 6,
    english_percentage: 60,
} as TopCompany;

function seed(hasData: boolean) {
    vi.mocked(queries.getCountryStats).mockResolvedValue(
        hasData ? [country] : [],
    );
    vi.mocked(queries.getCompanyCountsByCountry).mockResolvedValue(
        hasData ? { [country.name]: 1 } : {},
    );
    vi.mocked(queries.getGlobalStats).mockResolvedValue({
        total_positions: hasData ? 10 : 0,
        english_positions: hasData ? 6 : 0,
        total_companies: hasData ? 1 : 0,
    } as Awaited<ReturnType<typeof queries.getGlobalStats>>);
    vi.mocked(queries.getTopCompanies).mockResolvedValue(
        hasData ? [company] : [],
    );
}

let container: AstroContainer;

beforeAll(async () => {
    const renderers = await loadRenderers([getContainerRenderer()]);
    container = await AstroContainer.create({ renderers });
});

beforeEach(() => {
    vi.clearAllMocks();
});

function suggestLinks(html: string): string[] {
    return [...html.matchAll(/href="(https:\/\/tally\.so\/r\/[^"]+)"/g)].map(
        (m) => m[1],
    );
}

test.each([
    ['home', HomePage, SUGGEST_COMPANY],
    ['companies', CompaniesPage, SUGGEST_COMPANY],
    ['countries', CountriesPage, SUGGEST_COUNTRY],
])(
    'the empty %s page offers the suggest CTA instead of a browse link',
    async (_name, Page, tallyUrl) => {
        seed(false);
        const html = await container.renderToString(Page);

        expect(suggestLinks(html)).toEqual([tallyUrl]);
        expect(html).not.toMatch(/Browse (companies|countries)/);
    },
);

test('the empty-state CTA opens the form in a new tab and says so', async () => {
    seed(false);
    const html = await container.renderToString(CountriesPage);
    const anchor = html.match(
        /<a href="https:\/\/tally\.so[^>]*>.*?<\/a>/s,
    )?.[0];

    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain('rel="noopener noreferrer"');
    expect(anchor).toMatch(
        /Suggest a country<span class="sr-only"[^>]*> \(opens in a new tab\)/,
    );
});

test.each([
    ['companies', CompaniesPage, SUGGEST_COMPANY],
    ['countries', CountriesPage, SUGGEST_COUNTRY],
])(
    'the %s page with data keeps a single suggest CTA below the list',
    async (_name, Page, tallyUrl) => {
        seed(true);
        const html = await container.renderToString(Page);

        expect(suggestLinks(html)).toEqual([tallyUrl]);
        expect(html).toContain('suggest-cta');
        expect(html).not.toContain('No countries tracked yet');
        expect(html).not.toContain('No companies tracked yet');
    },
);

test('the home page with data shows the top lists and no suggest CTA', async () => {
    seed(true);
    const html = await container.renderToString(HomePage);

    expect(suggestLinks(html)).toEqual([]);
    expect(html).toContain('See all companies');
    expect(html).not.toContain('No positions tracked yet');
});
