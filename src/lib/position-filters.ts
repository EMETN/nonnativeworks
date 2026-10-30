import { nameToSlug } from './country-flags';
import type { ListedPosition } from './types';

export type PageKind = 'country' | 'company';

export const FACET_KEYS = ['company', 'country', 'category'] as const;

export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_LABELS: Record<FacetKey, string> = {
    company: 'Company',
    country: 'Country',
    category: 'Category',
};

export const FACET_PLURALS: Record<FacetKey, string> = {
    company: 'companies',
    country: 'countries',
    category: 'categories',
};

export const SORT_PARAM = 'sort';

export const SORT_KEYS = ['title', 'company', 'country', 'category'] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const DEFAULT_SORT: SortKey = 'title';

export const SORT_LABELS: Record<SortKey, string> = {
    title: 'Title',
    company: 'Company',
    country: 'Country',
    category: 'Category',
};

export interface FacetOption {
    value: string;
    label: string;
}

export type Facets = Partial<Record<FacetKey, FacetOption[]>>;

export interface FilterState {
    selected: Partial<Record<FacetKey, string[]>>;
}

export const EMPTY_FILTERS: FilterState = { selected: {} };

function facetValue(p: ListedPosition, key: FacetKey): FacetOption {
    switch (key) {
        case 'company':
            return { value: p.company_slug, label: p.company_name };
        case 'country':
            return { value: p.country_slug, label: p.country_name };
        case 'category':
            return {
                value: nameToSlug(p.category_name),
                label: p.category_name,
            };
    }
}

export function facetKeysFor(kind: PageKind): FacetKey[] {
    return FACET_KEYS.filter((k) => k !== kind);
}

export function facetOptions(
    positions: ListedPosition[],
    key: FacetKey,
): FacetOption[] {
    const options = new Map<string, string>();
    for (const p of positions) {
        const { value, label } = facetValue(p, key);
        if (value && !options.has(value)) options.set(value, label);
    }
    return [...options]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** A facet with a single option can't narrow anything, so it's dropped. */
export function buildFacets(
    positions: ListedPosition[],
    kind: PageKind,
): Facets {
    const facets: Facets = {};
    for (const key of facetKeysFor(kind)) {
        const options = facetOptions(positions, key);
        if (options.length >= 2) facets[key] = options;
    }
    return facets;
}

export function facetSummary(
    key: FacetKey,
    options: FacetOption[],
    selected: string[],
    results: ListedPosition[],
): string {
    const count = (n: number) =>
        `${n} ${n === 1 ? FACET_LABELS[key].toLowerCase() : FACET_PLURALS[key]}`;

    if (options.length === 1) return options[0].label;
    if (selected.length === 1)
        return options.find((o) => o.value === selected[0])!.label;
    if (selected.length > 1) return count(selected.length);
    if (key === 'category') return 'all categories';
    return count(new Set(results.map((p) => facetValue(p, key).value)).size);
}

export function parseFilters(search: string, facets: Facets): FilterState {
    const params = new URLSearchParams(search);
    const selected: FilterState['selected'] = {};
    for (const key of FACET_KEYS) {
        const known = facets[key];
        const raw = params.get(key);
        if (!known || !raw) continue;
        const allowed = new Set(known.map((o) => o.value));
        const values = [
            ...new Set(raw.split(',').map((v) => v.trim().toLowerCase())),
        ].filter((v) => allowed.has(v));
        if (values.length > 0) selected[key] = values;
    }
    return { selected };
}

export function sortKeysFor(kind: PageKind): SortKey[] {
    return SORT_KEYS.filter((k) => k !== kind);
}

/** null means the visitor never picked a sort, so the URL stays clean. */
export function parseSort(search: string, kind: PageKind): SortKey | null {
    const value = new URLSearchParams(search).get(SORT_PARAM);
    return sortKeysFor(kind).find((k) => k === value) ?? null;
}

const compareText = (a: string, b: string) =>
    a.localeCompare(b, 'en', { sensitivity: 'base', ignorePunctuation: true });

const SORT_FIELD: Record<SortKey, (p: ListedPosition) => string> = {
    title: (p) => p.title,
    company: (p) => p.company_name,
    country: (p) => p.country_name,
    category: (p) => p.category_name,
};

export function sortPositions(
    positions: ListedPosition[],
    sort: SortKey,
): ListedPosition[] {
    const field = SORT_FIELD[sort];
    return [...positions].sort(
        (a, b) =>
            compareText(field(a), field(b)) || compareText(a.title, b.title),
    );
}

/** Commas stay literal (URLSearchParams would encode them) so shared links read cleanly. */
export function serializeFilters(
    state: FilterState,
    sort: SortKey | null = null,
): string {
    const parts: string[] = [];
    for (const key of FACET_KEYS) {
        const values = state.selected[key];
        if (values && values.length > 0) {
            parts.push(`${key}=${values.map(encodeURIComponent).join(',')}`);
        }
    }
    if (sort) parts.push(`${SORT_PARAM}=${sort}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function hasActiveFilters(state: FilterState): boolean {
    return Object.values(state.selected).some((v) => v && v.length > 0);
}

function matches(
    p: ListedPosition,
    state: FilterState,
    skip?: FacetKey,
): boolean {
    for (const key of FACET_KEYS) {
        const wanted = state.selected[key];
        if (key === skip || !wanted || wanted.length === 0) continue;
        if (!wanted.includes(facetValue(p, key).value)) return false;
    }
    return true;
}

export function applyFilters(
    positions: ListedPosition[],
    state: FilterState,
): ListedPosition[] {
    return positions.filter((p) => matches(p, state));
}

/** Counts per option given every other active filter, so each count is what selecting it would add. */
export function facetCounts(
    positions: ListedPosition[],
    state: FilterState,
    key: FacetKey,
): Map<string, number> {
    const counts = new Map<string, number>();
    for (const p of positions) {
        if (!matches(p, state, key)) continue;
        const { value } = facetValue(p, key);
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
}
