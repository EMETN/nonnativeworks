import { test, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
    buildDetailPages,
    RESERVED_SLUGS,
    type CompanyPage,
    type CountryPage,
} from './detail-paths';
import type { CompanyStats, CountryStats, PositionDetail } from './types';

const country = (id: string, name: string, total = 10) =>
    ({
        country_id: id,
        name,
        slug: name.toLowerCase(),
        code: id.toUpperCase(),
        total_positions: total,
        english_positions: total,
    }) as CountryStats;

const company = (id: string, name: string, countryId: string, total = 5) =>
    ({
        company_id: id,
        name,
        country_id: countryId,
        career_page_url: `https://${id}.example/careers`,
        updated_at: `2026-10-0${id.length}T00:00:00Z`,
        total_positions: total,
        english_positions: total - 1,
    }) as CompanyStats;

const position = (
    id: string,
    companyId: string,
    title = id,
): PositionDetail => ({
    id,
    company_id: companyId,
    title,
    url: null,
    category_name: 'Engineering',
    requires_native_language: false,
    local_language_advantage: false,
    city: null,
    work_model: null,
});

const countries = [country('pt', 'Portugal'), country('fr', 'France')];

test('emits a country page with every position in that country, across companies', () => {
    const pages = buildDetailPages(
        countries,
        [company('t1', 'Tekever', 'pt'), company('f1', 'Feedzai', 'pt')],
        [position('a', 't1', 'Zed'), position('b', 'f1', 'Alpha')],
    );

    const portugal = pages.find((p) => p.slug === 'portugal') as CountryPage;
    expect(portugal.kind).toBe('country');
    expect(portugal.positions.map((p) => [p.company_name, p.title])).toEqual([
        ['Feedzai', 'Alpha'],
        ['Tekever', 'Zed'],
    ]);
});

test('groups a company present in several countries into one page', () => {
    const pages = buildDetailPages(
        countries,
        [company('t1', 'Tekever', 'pt', 4), company('t22', 'Tekever', 'fr', 6)],
        [position('a', 't1'), position('b', 't22')],
    );

    const tekever = pages.find((p) => p.slug === 'tekever') as CompanyPage;
    expect(tekever.kind).toBe('company');
    expect(tekever.country_count).toBe(2);
    expect(tekever.total_positions).toBe(10);
    expect(tekever.updated_at).toBe('2026-10-03T00:00:00Z');
    expect(tekever.positions.map((p) => p.country_slug)).toEqual([
        'portugal',
        'france',
    ]);
});

test('drops positions that require the native language', () => {
    const native = { ...position('n', 't1'), requires_native_language: true };
    const pages = buildDetailPages(
        countries,
        [company('t1', 'Tekever', 'pt')],
        [native, position('a', 't1')],
    );

    const tekever = pages.find((p) => p.slug === 'tekever')!;
    expect(tekever.positions.map((p) => p.id)).toEqual(['a']);
});

test('skips country pages with no positions', () => {
    const pages = buildDetailPages([country('pt', 'Portugal', 0)], [], []);

    expect(pages).toEqual([]);
});

test('fails the build when a company slug collides with a country', () => {
    expect(() =>
        buildDetailPages(countries, [company('m1', 'France', 'pt')], []),
    ).toThrow('Company "France" slug "france" collides with country "France"');
});

test('fails the build on a collision even when the country has no positions', () => {
    expect(() =>
        buildDetailPages(
            [country('mt', 'Malta', 0), country('pt', 'Portugal')],
            [company('m1', 'Malta', 'pt')],
            [],
        ),
    ).toThrow('collides with country "Malta"');
});

test('fails the build when a company slug collides with a reserved path', () => {
    expect(() =>
        buildDetailPages(countries, [company('c1', 'Companies', 'pt')], []),
    ).toThrow('collides with the reserved path /companies');
});

test('reserves every slug-shaped top-level route, public entry and redirect source', () => {
    const slugShaped = (name: string) => /^[a-z0-9-]+$/.test(name);
    const routes = readdirSync('src/pages')
        .map((f) => f.replace(/\.(astro|ts)$/, ''))
        .filter(slugShaped);
    const publicEntries = readdirSync('public').filter(slugShaped);
    const redirectSources = [
        ...readFileSync('netlify.toml', 'utf8').matchAll(
            /from = "\/([^/"*]+)/g,
        ),
        ...readFileSync('astro.config.mjs', 'utf8').matchAll(
            /'\/([a-z0-9-]+)': '/g,
        ),
    ].map((m) => m[1]);

    for (const name of [...routes, ...publicEntries, ...redirectSources]) {
        expect(RESERVED_SLUGS, name).toContain(name);
    }
});
