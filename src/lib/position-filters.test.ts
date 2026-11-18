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
    searchPositions,
    serializeFilters,
    sortPositions,
    EMPTY_FILTERS,
} from './position-filters';
import type { ListedCountry, ListedPosition } from './types';

const PORTUGAL: ListedCountry = {
    name: 'Portugal',
    slug: 'portugal',
    is_region: false,
};
const NORWAY: ListedCountry = {
    name: 'Norway',
    slug: 'norway',
    is_region: false,
};
const EUROPE: ListedCountry = {
    name: 'Europe',
    slug: 'europe',
    is_region: true,
};

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
    countries: [PORTUGAL],
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

test('country summary leaves Europe out of the country count', () => {
    const spread = [
        pos({ id: '1' }),
        pos({ id: '2', countries: [NORWAY] }),
        pos({ id: '3', countries: [EUROPE], work_model: 'remote' }),
    ];
    const options = facetOptions(spread, 'country');

    expect(facetSummary('country', options, [], spread)).toBe('2 countries');
    expect(facetSummary('country', options, [], spread.slice(1))).toBe(
        '1 country',
    );
    expect(facetSummary('country', options, [], spread.slice(2))).toBe(
        'Europe',
    );
});

test('work model is a facet once any position states one', () => {
    const mixed = [
        pos({ id: '1' }),
        pos({ id: '2', work_model: 'remote' }),
        pos({ id: '3', work_model: 'on-site' }),
    ];

    expect(buildFacets(mixed, 'company')['work-model']).toEqual([
        { value: 'remote', label: 'Remote' },
        { value: 'on-site', label: 'On-site' },
    ]);
    expect(buildFacets(mixed.slice(0, 2), 'company')['work-model']).toEqual([
        { value: 'remote', label: 'Remote' },
    ]);
    expect(buildFacets(positions, 'company')['work-model']).toBeUndefined();
    expect(
        buildFacets([pos({ work_model: 'remote' })], 'company')['work-model'],
    ).toBeUndefined();
});

test('filtering by work model drops positions without one', () => {
    const mixed = [pos({ id: '1' }), pos({ id: '2', work_model: 'remote' })];
    const state = parseFilters(
        '?work-model=remote',
        buildFacets(mixed, 'company'),
    );

    expect(applyFilters(mixed, state).map((p) => p.id)).toEqual(['2']);
    expect(serializeFilters(state)).toBe('?work-model=remote');
});

test('work model summary reads as part of the sentence', () => {
    const options = [
        { value: 'remote', label: 'Remote' },
        { value: 'hybrid', label: 'Hybrid' },
    ];

    expect(facetSummary('work-model', options, [], positions)).toBe(
        'any work model',
    );
    expect(facetSummary('work-model', options, ['hybrid'], positions)).toBe(
        'hybrid',
    );
    expect(
        facetSummary('work-model', options, ['hybrid', 'remote'], positions),
    ).toBe('remote or hybrid');
});

test('work model summary names the one model every position shares', () => {
    const remoteOnly = [
        pos({ id: '1', work_model: 'remote' }),
        pos({ id: '2', work_model: 'remote' }),
    ];
    const options = facetOptions(remoteOnly, 'work-model');

    expect(facetSummary('work-model', options, [], remoteOnly)).toBe(
        'all remote',
    );
    expect(facetSummary('work-model', options, ['remote'], remoteOnly)).toBe(
        'remote',
    );
});

test('a job in several countries matches, counts and summarises under each', () => {
    const spread = [
        pos({ id: '1' }),
        pos({ id: '2', countries: [NORWAY, PORTUGAL, EUROPE] }),
    ];
    const facets = buildFacets(spread, 'company');

    expect(facets.country).toEqual([
        { value: 'europe', label: 'Europe' },
        { value: 'norway', label: 'Norway' },
        { value: 'portugal', label: 'Portugal' },
    ]);
    expect(
        Object.fromEntries(facetCounts(spread, EMPTY_FILTERS, 'country')),
    ).toEqual({ portugal: 2, norway: 1, europe: 1 });
    const norway = parseFilters('?country=norway', facets);
    expect(applyFilters(spread, norway).map((p) => p.id)).toEqual(['2']);
    expect(facetSummary('country', facets.country!, [], spread)).toBe(
        '2 countries',
    );
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

test('search finds positions by title or city, ignoring accents', () => {
    const positions = [
        { title: 'Engineer', city: ['Łódź'] },
        { title: 'Lodz Sales Lead', city: null },
        { title: 'Designer', city: ['Warsaw'] },
    ] as ListedPosition[];

    expect(searchPositions(positions, ' lodz ').map((p) => p.title)).toEqual([
        'Engineer',
        'Lodz Sales Lead',
    ]);
});

test('search finds positions by work model', () => {
    const positions = [
        { title: 'Engineer', city: ['Berlin'], work_model: 'remote' },
        { title: 'Designer', city: null, work_model: 'hybrid' },
        { title: 'Remote Sensing Analyst', city: null, work_model: 'on-site' },
        { title: 'Analyst', city: null, work_model: null },
    ] as ListedPosition[];

    expect(searchPositions(positions, 'Remote').map((p) => p.title)).toEqual([
        'Engineer',
        'Remote Sensing Analyst',
    ]);
    expect(searchPositions(positions, 'hybrid').map((p) => p.title)).toEqual([
        'Designer',
    ]);
});

test('an empty search keeps every position', () => {
    const positions = [{ title: 'Engineer', city: null }] as ListedPosition[];

    expect(searchPositions(positions, '  ')).toEqual(positions);
});
