import { test, expect } from 'vitest';
import {
    applyFilters,
    buildFacets,
    facetCounts,
    facetOptions,
    facetSummary,
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
    company_name: 'Tekever',
    company_slug: 'tekever',
    country_name: 'Portugal',
    country_slug: 'portugal',
    ...overrides,
});

const positions = [
    pos({ id: '1' }),
    pos({ id: '2', category_name: 'Design' }),
    pos({ id: '3', company_name: 'Feedzai', company_slug: 'feedzai' }),
];

const facets = buildFacets(positions, 'country');

test('facets exclude the page dimension and single-option facets', () => {
    expect(Object.keys(facets)).toEqual(['company', 'category']);
    expect(buildFacets(positions, 'company').country).toBeUndefined();
});

test('facet options are slugged, labelled and alphabetical', () => {
    expect(facets.company).toEqual([
        { value: 'feedzai', label: 'Feedzai' },
        { value: 'tekever', label: 'Tekever' },
    ]);
});

test('facetOptions keeps a single option so it can be named in the sentence', () => {
    expect(facetOptions(positions, 'country')).toEqual([
        { value: 'portugal', label: 'Portugal' },
    ]);
});

test('parses comma-separated values, dropping unknown and duplicate ones', () => {
    const state = parseFilters('?company=tekever,nope,TEKEVER&q=x', facets);

    expect(state).toEqual({ selected: { company: ['tekever'] } });
});

test('ignores a param for a facet the page does not offer', () => {
    expect(parseFilters('?country=portugal', facets)).toEqual(EMPTY_FILTERS);
});

test('ignores params from retired filters in old shared links', () => {
    expect(
        parseFilters(
            '?city=lisbon&work_model=remote&skills=python&local_advantage=hide',
            facets,
        ),
    ).toEqual(EMPTY_FILTERS);
});

test('serializes with literal commas in a stable key order and drops empty keys', () => {
    const query = serializeFilters({
        selected: {
            category: ['design'],
            company: ['tekever', 'feedzai'],
            country: [],
        },
    });

    expect(query).toBe('?company=tekever,feedzai&category=design');
});

test('serializes no filters to an empty string', () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBe('');
});

test('round-trips through the URL', () => {
    const state = {
        selected: { company: ['feedzai'], category: ['design', 'engineering'] },
    };

    expect(parseFilters(serializeFilters(state), facets)).toEqual(state);
});

test('ORs within a facet and ANDs across facets', () => {
    const ids = (selected: Record<string, string[]>) =>
        applyFilters(positions, { selected }).map((p) => p.id);

    expect(ids({ company: ['tekever', 'feedzai'] })).toEqual(['1', '2', '3']);
    expect(ids({ company: ['tekever'], category: ['design'] })).toEqual(['2']);
});

test('counts each option against every other active filter', () => {
    const state = {
        selected: { company: ['feedzai'], category: ['engineering'] },
    };

    expect(facetCounts(positions, state, 'company')).toEqual(
        new Map([
            ['tekever', 1],
            ['feedzai', 1],
        ]),
    );
    expect(facetCounts(positions, state, 'category')).toEqual(
        new Map([['engineering', 1]]),
    );
});

test('reports whether any filter is active', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ selected: { company: [] } })).toBe(false);
    expect(hasActiveFilters({ selected: { company: ['tekever'] } })).toBe(true);
});

test('summarises a facet by what the results actually cover', () => {
    const options = facetOptions(positions, 'company');
    const summary = (selected: string[], results = positions) =>
        facetSummary('company', options, selected, results);

    expect(summary([])).toBe('2 companies');
    expect(summary([], [positions[0]])).toBe('1 company');
    expect(summary(['feedzai'])).toBe('Feedzai');
    expect(summary(['feedzai', 'tekever'])).toBe('2 companies');
});

test('category summary defaults to all categories', () => {
    const options = facetOptions(positions, 'category');

    expect(facetSummary('category', options, [], positions)).toBe(
        'all categories',
    );
    expect(facetSummary('category', options, ['design'], positions)).toBe(
        'Design',
    );
});

test('a facet with one option is named outright', () => {
    const options = facetOptions(positions, 'country');

    expect(facetSummary('country', options, [], positions)).toBe('Portugal');
});

test('a page with no listed positions still reads as a sentence', () => {
    expect(facetSummary('country', [], [], [])).toBe('0 countries');
    expect(facetSummary('category', [], [], [])).toBe('all categories');
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
        serializeFilters({ selected: { company: ['tekever'] } }, 'category'),
    ).toBe('?company=tekever&sort=category');
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
