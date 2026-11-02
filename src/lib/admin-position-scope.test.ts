import { describe, expect, test } from 'vitest';
import {
    ALL_COMPANIES,
    ALL_COUNTRIES,
    catalogSummary,
    companyOptions,
    countryOptions,
    positionSummary,
    resolveScope,
} from './admin-position-scope';

const row = (
    company_id: string,
    name: string,
    country: string,
    total_positions = 1,
) => ({
    company_id,
    name,
    country_id: `id-${country}`,
    country_name: country,
    total_positions,
});

const COMPANIES = [
    row('spotify-se', 'Spotify', 'Sweden'),
    row('spotify-de', 'Spotify', 'Germany'),
    row('abb-se', 'ABB', 'Sweden'),
    row('sap-de', 'SAP', 'Germany'),
    row('sap-se', 'SAP', 'Sweden', 0),
    row('abb-fr', 'ABB', 'France'),
];

const summarise = (options: { label: string; available: boolean }[]) =>
    options.map((o) => (o.available ? o.label : `(${o.label})`));

describe('companyOptions', () => {
    test('lists a company present in several countries once, sorted', () => {
        expect(summarise(companyOptions(COMPANIES, '', ''))).toEqual([
            'ABB',
            'SAP',
            'Spotify',
        ]);
    });

    test('all countries leaves every company available', () => {
        expect(summarise(companyOptions(COMPANIES, '', ALL_COUNTRIES))).toEqual(
            ['ABB', 'SAP', 'Spotify'],
        );
    });

    test('orders companies in the country first and disables the rest', () => {
        expect(summarise(companyOptions(COMPANIES, '', 'id-France'))).toEqual([
            'ABB',
            '(SAP)',
            '(Spotify)',
        ]);
    });

    test('a company with no positions in the country is unavailable', () => {
        expect(summarise(companyOptions(COMPANIES, '', 'id-Sweden'))).toEqual([
            'ABB',
            'Spotify',
            '(SAP)',
        ]);
    });

    test('keeps the selected company available', () => {
        expect(
            summarise(companyOptions(COMPANIES, 'SAP', 'id-Sweden')),
        ).toEqual(['ABB', 'SAP', 'Spotify']);
    });
});

describe('countryOptions', () => {
    test('lists each country once, sorted by name', () => {
        expect(countryOptions(COMPANIES, '', '')).toEqual([
            { value: 'id-France', label: 'France', available: true },
            { value: 'id-Germany', label: 'Germany', available: true },
            { value: 'id-Sweden', label: 'Sweden', available: true },
        ]);
    });

    test('all companies leaves every country available', () => {
        expect(summarise(countryOptions(COMPANIES, ALL_COMPANIES, ''))).toEqual(
            ['France', 'Germany', 'Sweden'],
        );
    });

    test('orders the countries of the company first and disables the rest', () => {
        expect(summarise(countryOptions(COMPANIES, 'SAP', ''))).toEqual([
            'Germany',
            '(France)',
            '(Sweden)',
        ]);
    });

    test('keeps the selected country available', () => {
        expect(
            summarise(countryOptions(COMPANIES, 'SAP', 'id-Sweden')),
        ).toEqual(['Germany', 'Sweden', '(France)']);
    });
});

describe('resolveScope', () => {
    test('loads nothing until a company or country is chosen', () => {
        expect(resolveScope(COMPANIES, '', '')).toBeNull();
    });

    test('all companies queries with no filter', () => {
        expect(resolveScope(COMPANIES, ALL_COMPANIES, '')).toEqual({
            query: '',
            multiCompany: true,
        });
    });

    test('all countries with no company queries with no filter', () => {
        expect(resolveScope(COMPANIES, '', ALL_COUNTRIES)).toEqual({
            query: '',
            multiCompany: true,
        });
    });

    test('all countries with a company spans its countries', () => {
        expect(resolveScope(COMPANIES, 'Spotify', ALL_COUNTRIES)).toEqual({
            query: '?company_id=spotify-se&company_id=spotify-de',
            multiCompany: true,
        });
    });

    test('a country with no company gets every position in that country', () => {
        const expected = { query: '?country_id=id-Sweden', multiCompany: true };
        expect(resolveScope(COMPANIES, '', 'id-Sweden')).toEqual(expected);
        expect(resolveScope(COMPANIES, ALL_COMPANIES, 'id-Sweden')).toEqual(
            expected,
        );
    });

    test('a company with no country spans all its countries', () => {
        expect(resolveScope(COMPANIES, 'Spotify', '')).toEqual({
            query: '?company_id=spotify-se&company_id=spotify-de',
            multiCompany: true,
        });
    });

    test('company and country together select that one company row', () => {
        expect(resolveScope(COMPANIES, 'Spotify', 'id-Germany')).toEqual({
            query: '?company_id=spotify-de',
            multiCompany: false,
        });
    });

    test('a company that no longer exists resolves to nothing', () => {
        expect(resolveScope(COMPANIES, 'Gone', '')).toBeNull();
    });
});

describe('positionSummary', () => {
    const position = (name: string, requires_native_language: boolean) => ({
        requires_native_language,
        company: { name, country_name: 'Sweden' },
    });

    test('counts positions that do not require the local language', () => {
        const summary = positionSummary([
            position('ABB', false),
            position('ABB', true),
            position('SAP', false),
        ]);

        expect(summary).toMatchObject({ english: 2, total: 3 });
    });

    test('counts a company in several countries once', () => {
        const summary = positionSummary([
            position('ABB', false),
            {
                ...position('ABB', false),
                company: { name: 'ABB', country_name: 'France' },
            },
            position('SAP', false),
        ]);

        expect(summary.companies).toBe(2);
    });

    test('counts the countries the positions are in', () => {
        const summary = positionSummary([
            position('ABB', false),
            position('SAP', false),
            {
                ...position('ABB', false),
                company: { name: 'ABB', country_name: 'France' },
            },
        ]);

        expect(summary.countries).toBe(2);
    });
});

test('catalogSummary totals every company, counting a name once', () => {
    const company = (
        name: string,
        country_name: string,
        total_positions: number,
        english_positions: number,
    ) => ({ name, country_name, total_positions, english_positions });

    expect(
        catalogSummary([
            company('ABB', 'Sweden', 10, 4),
            company('ABB', 'France', 5, 5),
            company('SAP', 'Sweden', 3, 0),
        ]),
    ).toEqual({ english: 9, total: 18, companies: 2, countries: 2 });
});
