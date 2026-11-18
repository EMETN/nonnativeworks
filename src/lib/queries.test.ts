import { test, expect, beforeAll } from 'vitest';
import type { AstroCookies } from 'astro';
import { countCompaniesByCountry, resolveClient } from './queries';
import { createPublicClient } from './supabase';
import { buildDetailPages, type CountryPage } from './detail-paths';
import type { CompanyStats, CountryStats, PositionDetail } from './types';

beforeAll(() => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
});

test('resolveClient returns the shared public client when no request is given', () => {
    expect(resolveClient(undefined, undefined)).toBe(createPublicClient());
});

test('resolveClient returns a request-scoped client when both are given', () => {
    const request = new Request('https://example.com', {
        headers: { Cookie: 'sb-token=abc' },
    });
    const cookies = {
        set() {},
        get() {},
        has: () => false,
    } as unknown as AstroCookies;

    const scoped = resolveClient(request, cookies);

    expect(scoped).not.toBe(createPublicClient());
});

test('resolveClient falls back to the public client if only one is given', () => {
    const request = new Request('https://example.com');

    expect(resolveClient(request, undefined)).toBe(createPublicClient());
});

const companyRow = (
    company_id: string,
    country_id: string,
    english_positions: number,
    total_positions = english_positions,
) =>
    ({
        company_id,
        name: company_id,
        country_id,
        career_page_url: null,
        updated_at: '2026-11-01T00:00:00Z',
        total_positions,
        english_positions,
    }) as CompanyStats;

test('countCompaniesByCountry counts only companies with English-friendly positions as hiring', () => {
    const counts = countCompaniesByCountry([
        companyRow('a', 'no', 3),
        companyRow('b', 'no', 0, 4),
        companyRow('c', 'no', 0, 0),
        companyRow('d', 'pt', 1),
    ]);

    expect(counts).toEqual({
        no: { hiring: 1, tracked: 3 },
        pt: { hiring: 1, tracked: 1 },
    });
});

test('the hiring count matches the companies a country page lists', () => {
    const companies = [
        companyRow('a', 'no', 2),
        companyRow('b', 'no', 0, 3),
        companyRow('c', 'no', 0, 0),
        companyRow('d', 'no', 1, 2),
    ];
    const position = (
        id: string,
        company_id: string,
        requires_native_language: boolean,
    ): PositionDetail => ({
        id,
        company_id,
        title: id,
        url: null,
        city: null,
        work_model: null,
        category_name: 'Engineering',
        requires_native_language,
        local_language_advantage: false,
    });
    const positions = [
        position('p1', 'a', false),
        position('p2', 'a', false),
        position('p3', 'b', true),
        position('p4', 'b', true),
        position('p5', 'b', true),
        position('p6', 'd', false),
        position('p7', 'd', true),
    ];
    const norway = {
        country_id: 'no',
        name: 'Norway',
        slug: 'norway',
        code: 'NO',
        total_positions: 7,
        english_positions: 3,
    } as CountryStats;

    const page = buildDetailPages([norway], companies, positions).find(
        (p) => p.slug === 'norway',
    ) as CountryPage;
    const listedCompanies = new Set(page.positions.map((p) => p.company_id));

    expect(countCompaniesByCountry(companies).no).toEqual({
        hiring: listedCompanies.size,
        tracked: 4,
    });
    expect(page.positions).toHaveLength(norway.english_positions);
});
