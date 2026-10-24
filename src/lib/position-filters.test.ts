import { test, expect } from 'vitest';
import {
    applyFilters,
    buildFacets,
    facetCounts,
    hasActiveFilters,
    parseFilters,
    parseSort,
    serializeFilters,
    sortPositions,
    EMPTY_FILTERS,
} from './position-filters';
import type { ListedPosition } from './types';

const pos = (overrides: Partial<ListedPosition>): ListedPosition => ({
    id: 'id',
    company_id: 'c',
    title: 'Engineer',
    url: null,
    category_name: 'Engineering',
    requires_native_language: false,
    local_language_advantage: false,
    city: null,
    work_model: null,
    skills: [],
    company_name: 'Tekever',
    company_slug: 'tekever',
    country_name: 'Portugal',
    country_slug: 'portugal',
    career_page_url: null,
    ...overrides,
});

const positions = [
    pos({
        id: '1',
        city: ['Lisbon'],
        work_model: 'remote',
        skills: ['Python'],
    }),
    pos({
        id: '2',
        city: ['Porto'],
        work_model: 'hybrid',
        category_name: 'Design',
        skills: ['Figma'],
    }),
    pos({
        id: '3',
        company_name: 'Feedzai',
        company_slug: 'feedzai',
        city: ['Lisbon', 'Porto'],
        work_model: 'remote',
        local_language_advantage: true,
        skills: ['Python', 'Go'],
    }),
];

const facets = buildFacets(positions, 'country');

test('facets exclude the page dimension and single-option facets', () => {
    expect(Object.keys(facets)).toEqual([
        'company',
        'category',
        'work_model',
        'city',
        'skills',
    ]);
    expect(buildFacets(positions, 'company').country).toBeUndefined();
});

test('facet options are slugged, labelled and alphabetical', () => {
    expect(facets.company).toEqual([
        { value: 'feedzai', label: 'Feedzai' },
        { value: 'tekever', label: 'Tekever' },
    ]);
    expect(facets.work_model).toEqual([
        { value: 'hybrid', label: 'Hybrid' },
        { value: 'remote', label: 'Remote' },
    ]);
});

test('parses comma-separated values, dropping unknown and duplicate ones', () => {
    const state = parseFilters(
        '?company=tekever,nope,TEKEVER&city=lisbon,&local_advantage=hide&q=x',
        facets,
    );

    expect(state).toEqual({
        selected: { company: ['tekever'], city: ['lisbon'] },
        hideLocalAdvantage: true,
    });
});

test('ignores a param for a facet the page does not offer', () => {
    expect(parseFilters('?country=portugal', facets)).toEqual(EMPTY_FILTERS);
});

test('serializes with literal commas in a stable key order and drops empty keys', () => {
    const query = serializeFilters({
        selected: {
            skills: ['python'],
            company: ['tekever', 'feedzai'],
            city: [],
        },
        hideLocalAdvantage: true,
    });

    expect(query).toBe(
        '?company=tekever,feedzai&skills=python&local_advantage=hide',
    );
});

test('serializes no filters to an empty string', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
});

test('round-trips through the URL', () => {
    const state = {
        selected: { company: ['feedzai'], category: ['design', 'engineering'] },
        hideLocalAdvantage: false,
    };

    expect(parseFilters(serializeFilters(state), facets)).toEqual(state);
});

test('ORs within a facet and ANDs across facets', () => {
    const ids = (
        selected: Record<string, string[]>,
        hideLocalAdvantage = false,
    ) =>
        applyFilters(positions, { selected, hideLocalAdvantage }).map(
            (p) => p.id,
        );

    expect(ids({ city: ['lisbon', 'porto'] })).toEqual(['1', '2', '3']);
    expect(ids({ city: ['porto'], work_model: ['remote'] })).toEqual(['3']);
    expect(ids({ skills: ['python'] }, true)).toEqual(['1']);
});

test('counts each option against every other active filter', () => {
    const state = {
        selected: { company: ['tekever'], city: ['porto'] },
        hideLocalAdvantage: false,
    };

    expect(facetCounts(positions, state, 'company')).toEqual(
        new Map([
            ['tekever', 1],
            ['feedzai', 1],
        ]),
    );
    expect(facetCounts(positions, state, 'city')).toEqual(
        new Map([
            ['lisbon', 1],
            ['porto', 1],
        ]),
    );
});

test('reports whether any filter is active', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(
        hasActiveFilters({ selected: { city: [] }, hideLocalAdvantage: false }),
    ).toBe(false);
    expect(hasActiveFilters({ selected: {}, hideLocalAdvantage: true })).toBe(
        true,
    );
});

test('sort is unset unless the URL names one the page offers', () => {
    expect(parseSort('', 'country')).toBeNull();
    expect(parseSort('?sort=company', 'country')).toBe('company');
    expect(parseSort('?sort=title', 'country')).toBe('title');
    expect(parseSort('?sort=country', 'country')).toBeNull();
    expect(parseSort('?sort=bogus', 'company')).toBeNull();
});

test('an explicitly chosen sort is always in the URL, including title', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
    expect(serializeFilters(EMPTY_FILTERS, 'title')).toBe('?sort=title');
    expect(
        serializeFilters(
            { selected: { city: ['porto'] }, hideLocalAdvantage: false },
            'category',
        ),
    ).toBe('?city=porto&sort=category');
});

test('sorts alphabetically, case-insensitively, with title as the tie-breaker', () => {
    const list = [
        pos({
            id: 'a',
            title: 'zeta',
            company_name: 'Acme',
            category_name: 'Sales',
        }),
        pos({
            id: 'b',
            title: 'Alpha',
            company_name: 'beta',
            category_name: 'Design',
        }),
        pos({
            id: 'c',
            title: 'beta',
            company_name: 'Acme',
            category_name: 'Design',
        }),
    ];
    const ids = (sort: Parameters<typeof sortPositions>[1]) =>
        sortPositions(list, sort).map((p) => p.id);

    expect(ids('title')).toEqual(['b', 'c', 'a']);
    expect(ids('company')).toEqual(['c', 'a', 'b']);
    expect(ids('category')).toEqual(['b', 'c', 'a']);
});

test('sorting ignores leading punctuation', () => {
    const list = [
        pos({ id: 'a', title: '(Senior) SAP Engineer' }),
        pos({ id: 'b', title: '.Net Developer' }),
        pos({ id: 'c', title: 'Data Analyst' }),
    ];

    expect(sortPositions(list, 'title').map((p) => p.id)).toEqual([
        'c',
        'b',
        'a',
    ]);
});
