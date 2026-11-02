import { Fragment, type ComponentChildren } from 'preact';
import { useState, useEffect, useMemo } from 'preact/hooks';
import { CATEGORIES } from '../../lib/categories';
import { isHttpUrl } from '../../lib/safe-url';
import { mapWithConcurrency } from '../../lib/pagination';
import { formatCount } from '../../lib/text';
import {
    readCache,
    writeCache,
    invalidateCache,
    invalidateCachePrefix,
} from '../../lib/admin-cache';
import {
    AdminCompanyListSchema,
    AdminPositionListSchema,
    type AdminCompany as CompanyOption,
    type AdminPosition as PositionRow,
} from '../../lib/admin-schemas';
import {
    ALL_COMPANIES,
    ALL_COUNTRIES,
    catalogGroups,
    catalogSummary,
    companyOptions,
    countryOptions,
    groupPositions,
    positionSummary,
    resolveScope,
    type PositionGroup,
} from '../../lib/admin-position-scope';

const filterSelectClass = (value: string) =>
    `admin-select flex-1 min-w-0 max-w-sm text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B] [&>option:enabled]:text-gray-900 [&>option:disabled]:text-gray-400 ${value ? '' : 'text-gray-500'}`;

const COLUMN_COUNT = 6;
const COMPANIES_PAGE_SIZE = 25;
const COMPANY_IDS_PER_REQUEST = 50;
const REQUEST_CONCURRENCY = 4;
const collator = new Intl.Collator('en');
const groupKeys = (groups: PositionGroup<PositionRow>[]) =>
    groups.flatMap((g) => [g.key, ...g.children.map((c) => c.key)]);
const lazyCompanyIds = (groups: PositionGroup<PositionRow>[]) =>
    groups.flatMap((g) =>
        [g, ...g.children].flatMap((group) => group.companyId ?? []),
    );
const companyCacheKey = (id: string) =>
    `positions:?company_id=${encodeURIComponent(id)}`;

const EDUCATION_OPTIONS = [
    { value: '', label: '— not specified —' },
    { value: 'vocational', label: 'Vocational' },
    { value: 'bachelor', label: "Bachelor's" },
    { value: 'master', label: "Master's" },
    { value: 'mba', label: 'MBA' },
    { value: 'phd', label: 'PhD' },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SortArrow({ dir }: { dir: 'asc' | 'desc' }) {
    const cls = 'w-2.5 h-2.5 inline-block ml-1 sm:ml-1.5';
    // asc = A→Z, rendered as a down chevron
    return (
        <svg
            class={cls}
            width="10"
            height="12"
            fill="none"
            viewBox="0 0 10 12"
            stroke="currentColor"
            stroke-width={2}
        >
            {dir === 'asc' ? (
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 5l4 4 4-4"
                />
            ) : (
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 7l4-4 4 4"
                />
            )}
        </svg>
    );
}

export default function PositionEditor() {
    const [companies, setCompanies] = useState<CompanyOption[]>([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [selectedCountryId, setSelectedCountryId] = useState('');
    const [positions, setPositions] = useState<PositionRow[]>([]);
    const [loadingCompanies, setLoadingCompanies] = useState(true);
    const [loadingPositions, setLoadingPositions] = useState(false);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [toggledGroups, setToggledGroups] = useState<Set<string>>(new Set());
    const [allExpanded, setAllExpanded] = useState(false);
    const [visibleCompanies, setVisibleCompanies] =
        useState(COMPANIES_PAGE_SIZE);
    const [positionsByCompany, setPositionsByCompany] = useState<
        Record<string, PositionRow[]>
    >({});
    const [loadingCompanyIds, setLoadingCompanyIds] = useState<Set<string>>(
        new Set(),
    );
    const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
    const [reloadKey, setReloadKey] = useState(0);
    const [error, setError] = useState('');

    function loadCompanies(force = false) {
        if (!force) {
            const cached = AdminCompanyListSchema.safeParse(
                readCache('companies'),
            );
            if (cached.success) {
                setCompanies(cached.data);
                setLoadingCompanies(false);
                return;
            }
        }
        setLoadingCompanies(true);
        fetch('/api/admin/companies')
            .then((r) => r.json())
            .then((raw) => {
                const rows = AdminCompanyListSchema.parse(raw);
                setCompanies(rows);
                writeCache('companies', rows);
            })
            .catch(() => setError('Could not load companies.'))
            .finally(() => setLoadingCompanies(false));
    }

    useEffect(() => {
        loadCompanies();
    }, []);

    const scope = resolveScope(companies, selectedCompany, selectedCountryId);
    const scopeQuery = scope?.query ?? null;
    const grouping = scope?.grouping ?? null;
    const browsingCatalog = grouping === 'company-country';

    useEffect(() => {
        setSortDir('asc');
        setToggledGroups(new Set());
        setAllExpanded(false);
        setVisibleCompanies(COMPANIES_PAGE_SIZE);
    }, [scopeQuery]);

    useEffect(() => {
        if (scopeQuery === null || browsingCatalog) {
            setPositions([]);
            setLoadingPositions(false);
            return;
        }
        setError('');

        const cacheKey = `positions:${scopeQuery}`;
        const cached = AdminPositionListSchema.safeParse(readCache(cacheKey));
        if (cached.success) {
            setPositions(cached.data);
            setLoadingPositions(false);
            return;
        }

        let superseded = false;
        setLoadingPositions(true);
        fetch(`/api/admin/positions${scopeQuery}`)
            .then((r) => r.json())
            .then((raw) => {
                const rows = AdminPositionListSchema.parse(raw);
                writeCache(cacheKey, rows);
                if (!superseded) setPositions(rows);
            })
            .catch(() => {
                if (!superseded) setError('Could not load positions.');
            })
            .finally(() => {
                if (!superseded) setLoadingPositions(false);
            });
        return () => {
            superseded = true;
        };
    }, [scopeQuery, browsingCatalog, reloadKey]);

    function refresh() {
        invalidateCache('companies');
        invalidateCachePrefix('positions:');
        loadCompanies(true);
        setPositionsByCompany({});
        setToggledGroups(new Set());
        setAllExpanded(false);
        setReloadKey((k) => k + 1);
    }

    function selectCompany(company: string) {
        setSelectedCompany(company);
        setSelectedCountryId((country) => country || ALL_COUNTRIES);
    }

    function selectCountry(countryId: string) {
        setSelectedCountryId(countryId);
        setSelectedCompany((company) => company || ALL_COMPANIES);
    }

    function clearFilters() {
        setSelectedCompany('');
        setSelectedCountryId('');
    }

    function sortRows(rows: PositionRow[]) {
        const sign = sortDir === 'asc' ? 1 : -1;
        return [...rows].sort(
            (a, b) => sign * collator.compare(a.title ?? '', b.title ?? ''),
        );
    }

    const sortedPositions = useMemo(
        () => sortRows(positions),
        [positions, sortDir],
    );

    const catalog = useMemo(
        () => catalogGroups<PositionRow>(companies, visibleCompanies),
        [companies, visibleCompanies],
    );
    const groups = useMemo(
        () =>
            browsingCatalog
                ? catalog.groups
                : groupPositions(sortedPositions, grouping),
        [browsingCatalog, catalog, sortedPositions, grouping],
    );

    function setCompaniesLoading(ids: string[], loading: boolean) {
        setLoadingCompanyIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
                if (loading) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }

    async function fetchCompanyRows(ids: string[]) {
        const query = ids
            .map((id) => `company_id=${encodeURIComponent(id)}`)
            .join('&');
        const res = await fetch(`/api/admin/positions?${query}`);
        const rows = AdminPositionListSchema.parse(await res.json());
        const loaded: Record<string, PositionRow[]> = Object.fromEntries(
            ids.map((id) => [id, []]),
        );
        for (const row of rows) loaded[row.company_id]?.push(row);
        for (const [id, companyRows] of Object.entries(loaded)) {
            writeCache(companyCacheKey(id), companyRows);
        }
        return loaded;
    }

    async function loadCompanyRows(ids: string[]) {
        const missing = ids.filter(
            (id) => !positionsByCompany[id] && !loadingCompanyIds.has(id),
        );
        const cached = missing.flatMap((id) => {
            const rows = AdminPositionListSchema.safeParse(
                readCache(companyCacheKey(id)),
            );
            return rows.success ? [[id, rows.data] as const] : [];
        });
        if (cached.length > 0) {
            setPositionsByCompany((prev) => ({
                ...prev,
                ...Object.fromEntries(cached),
            }));
        }

        const known = new Set(cached.map(([id]) => id));
        const uncached = missing.filter((id) => !known.has(id));
        const batches = [];
        for (let i = 0; i < uncached.length; i += COMPANY_IDS_PER_REQUEST) {
            batches.push(uncached.slice(i, i + COMPANY_IDS_PER_REQUEST));
        }
        if (uncached.length === 0) return;

        setCompaniesLoading(uncached, true);
        try {
            const pages = await mapWithConcurrency(
                batches,
                REQUEST_CONCURRENCY,
                fetchCompanyRows,
            );
            setPositionsByCompany((prev) => Object.assign({}, prev, ...pages));
        } catch {
            setError('Could not load positions.');
        } finally {
            setCompaniesLoading(uncached, false);
        }
    }

    function toggleGroup(group: PositionGroup<PositionRow>) {
        if (group.companyId && !toggledGroups.has(group.key)) {
            loadCompanyRows([group.companyId]);
        }
        setToggledGroups((prev) => {
            const next = new Set(prev);
            if (!next.delete(group.key)) next.add(group.key);
            return next;
        });
    }

    function expandAllGroups() {
        setAllExpanded(true);
        loadCompanyRows(lazyCompanyIds(groups));
        setToggledGroups(new Set(browsingCatalog ? groupKeys(groups) : []));
    }

    function collapseAllGroups() {
        setAllExpanded(false);
        setToggledGroups(new Set(browsingCatalog ? [] : groupKeys(groups)));
    }

    function loadMoreCompanies() {
        const count = visibleCompanies + COMPANIES_PAGE_SIZE;
        setVisibleCompanies(count);
        if (!allExpanded) return;

        const added = catalogGroups<PositionRow>(companies, count).groups.slice(
            visibleCompanies,
        );
        loadCompanyRows(lazyCompanyIds(added));
        setToggledGroups((prev) => new Set([...prev, ...groupKeys(added)]));
    }

    function setSave(id: string, state: SaveState) {
        setSaveStates((prev) => ({ ...prev, [id]: state }));
    }

    // Optimistic edits also update the cached copy for the current selection.
    function setPositionsAndCache(
        updater: (prev: PositionRow[]) => PositionRow[],
    ) {
        if (browsingCatalog) {
            setPositionsByCompany((prev) =>
                Object.fromEntries(
                    Object.entries(prev).map(([id, rows]) => {
                        const next = updater(rows);
                        if (next.some((row, i) => row !== rows[i])) {
                            writeCache(companyCacheKey(id), next);
                        }
                        return [id, next];
                    }),
                ),
            );
            return;
        }
        setPositions((prev) => {
            const next = updater(prev);
            if (scopeQuery !== null) {
                writeCache(`positions:${scopeQuery}`, next);
            }
            return next;
        });
    }

    async function patchPosition(id: string, patch: Record<string, unknown>) {
        setSave(id, 'saving');
        try {
            const res = await fetch(
                `/api/admin/positions/${encodeURIComponent(id)}`,
                {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(patch),
                },
            );
            if (!res.ok) throw new Error(await res.text());
            setSave(id, 'saved');
            window.dispatchEvent(new CustomEvent('admin:data-changed'));
            setTimeout(() => setSave(id, 'idle'), 2000);
        } catch {
            setSave(id, 'error');
        }
    }

    function handleCategoryChange(pos: PositionRow, newSlug: string) {
        // Optimistic local update
        setPositionsAndCache((prev) =>
            prev.map((p) =>
                p.id === pos.id
                    ? {
                          ...p,
                          category: p.category
                              ? { ...p.category, slug: newSlug }
                              : null,
                      }
                    : p,
            ),
        );
        patchPosition(pos.id, { category_slug: newSlug });
    }

    // The two flags are mutually exclusive; clicking the active one clears it (neither).
    function handleLangChange(
        pos: PositionRow,
        target: 'required' | 'advantage' | 'none',
    ) {
        const requires_native_language = target === 'required';
        const local_language_advantage = target === 'advantage';
        setPositionsAndCache((prev) =>
            prev.map((p) =>
                p.id === pos.id
                    ? {
                          ...p,
                          requires_native_language,
                          local_language_advantage,
                      }
                    : p,
            ),
        );
        patchPosition(pos.id, {
            requires_native_language,
            local_language_advantage,
        });
    }

    function handleEducationChange(pos: PositionRow, value: string) {
        const education = value === '' ? null : value;
        setPositionsAndCache((prev) =>
            prev.map((p) =>
                p.id === pos.id ? { ...p, required_education: education } : p,
            ),
        );
        patchPosition(pos.id, { required_education: education });
    }

    // Full category list from the canonical source — not derived from loaded positions,
    // which would omit categories not yet used by this company.
    const knownCategories = CATEGORIES;

    const showingCatalog = !scope || browsingCatalog;
    const summary = showingCatalog
        ? catalogSummary(companies)
        : positionSummary(positions);
    const showSummary = showingCatalog
        ? companies.length > 0
        : !loadingPositions && positions.length > 0;

    function renderRow(pos: PositionRow) {
        const state = saveStates[pos.id] ?? 'idle';
        const location = pos.city?.join(', ') || 'Not specified';
        return (
            <tr key={pos.id} class="bg-white hover:bg-gray-50/50">
                {/* Title */}
                <td class="px-4 py-2.5 min-w-40 [overflow-wrap:anywhere]">
                    {pos.url && isHttpUrl(pos.url) ? (
                        <a
                            href={pos.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-[#0F7A4F] hover:underline font-medium line-clamp-2"
                        >
                            {pos.title}
                            <span class="sr-only"> (opens in a new tab)</span>
                        </a>
                    ) : (
                        <span class="font-medium text-gray-800">
                            {pos.title}
                        </span>
                    )}
                </td>

                <td class="px-4 py-2.5 min-w-32 text-gray-600 [overflow-wrap:anywhere]">
                    <span class="line-clamp-2" title={location}>
                        {location}
                    </span>
                </td>

                {/* Category */}
                <td class="px-4 py-2.5">
                    <select
                        name={`category-${pos.id}`}
                        aria-label={`Category for ${pos.title}`}
                        class="admin-select text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#12956B] bg-white"
                        value={pos.category?.slug ?? ''}
                        onChange={(e) =>
                            handleCategoryChange(
                                pos,
                                (e.target as HTMLSelectElement).value,
                            )
                        }
                    >
                        {knownCategories.map((cat) => (
                            <option key={cat.slug} value={cat.slug}>
                                {cat.name}
                            </option>
                        ))}
                    </select>
                </td>

                {/* Local language */}
                <td class="px-4 py-2.5">
                    <div class="flex justify-center gap-3">
                        <span class="w-10 flex justify-center">
                            <input
                                type="radio"
                                name={`lang-${pos.id}`}
                                checked={pos.requires_native_language}
                                onChange={() =>
                                    handleLangChange(pos, 'required')
                                }
                            />
                        </span>
                        <span class="w-10 flex justify-center">
                            <input
                                type="radio"
                                name={`lang-${pos.id}`}
                                checked={pos.local_language_advantage}
                                onChange={() =>
                                    handleLangChange(pos, 'advantage')
                                }
                            />
                        </span>
                        <span class="w-10 flex justify-center">
                            <input
                                type="radio"
                                name={`lang-${pos.id}`}
                                checked={
                                    !pos.requires_native_language &&
                                    !pos.local_language_advantage
                                }
                                onChange={() => handleLangChange(pos, 'none')}
                            />
                        </span>
                    </div>
                </td>

                {/* Education */}
                <td class="px-4 py-2.5">
                    <select
                        name={`education-${pos.id}`}
                        aria-label={`Education for ${pos.title}`}
                        class="admin-select text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#12956B] bg-white"
                        value={pos.required_education ?? ''}
                        onChange={(e) =>
                            handleEducationChange(
                                pos,
                                (e.target as HTMLSelectElement).value,
                            )
                        }
                    >
                        {EDUCATION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </td>

                {/* Save indicator */}
                <td class="px-4 py-2.5 text-center">
                    {state === 'saving' && (
                        <span class="text-xs text-gray-500">Saving…</span>
                    )}
                    {state === 'saved' && (
                        <span class="text-xs text-green-700">Saved</span>
                    )}
                    {state === 'error' && (
                        <span class="text-xs text-red-600">Error</span>
                    )}
                </td>
            </tr>
        );
    }

    function renderLazyRows(companyId: string, rows?: PositionRow[]) {
        if (rows) return sortRows(rows).map((pos) => renderRow(pos));
        if (!loadingCompanyIds.has(companyId)) return null;
        return (
            <tr>
                <td
                    colSpan={COLUMN_COUNT}
                    class="px-4 py-2.5 text-sm text-gray-500"
                >
                    Loading positions…
                </td>
            </tr>
        );
    }

    function renderGroup(
        group: PositionGroup<PositionRow>,
        depth = 0,
    ): ComponentChildren {
        const toggled = toggledGroups.has(group.key);
        const open = browsingCatalog ? toggled : !toggled;
        const nested = group.children.length;
        const rows = group.companyId
            ? positionsByCompany[group.companyId]
            : group.positions;
        return (
            <Fragment key={group.key}>
                <tr>
                    <th
                        scope="rowgroup"
                        colSpan={COLUMN_COUNT}
                        data-group-depth={depth}
                        class="p-0 font-normal text-left bg-white"
                    >
                        <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggleGroup(group)}
                            class="w-full px-4 py-2.5 text-left cursor-pointer hover:bg-gray-100/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#12956B]"
                        >
                            <span class="sticky left-4 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <svg
                                    aria-hidden="true"
                                    class={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}
                                    width="14"
                                    height="14"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    stroke-width={2.5}
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M9 6l6 6-6 6"
                                    />
                                </svg>
                                <span
                                    class={
                                        depth === 0
                                            ? 'font-semibold text-gray-900'
                                            : 'font-medium text-gray-800'
                                    }
                                >
                                    {group.label}
                                </span>
                                {group.note && (
                                    <span class="text-gray-500">
                                        {group.note}
                                    </span>
                                )}
                                {nested > 0 && (
                                    <span class="text-gray-500">
                                        {formatCount(nested)} countries
                                    </span>
                                )}
                                <span class="text-xs text-gray-500">
                                    <span class="font-semibold text-[#0F7A4F]">
                                        {formatCount(group.english)}
                                    </span>{' '}
                                    of {formatCount(group.total)}{' '}
                                    {group.total === 1
                                        ? 'position'
                                        : 'positions'}
                                </span>
                            </span>
                        </button>
                    </th>
                </tr>
                {open &&
                    (nested > 0
                        ? group.children.map((child) =>
                              renderGroup(child, depth + 1),
                          )
                        : group.companyId
                          ? renderLazyRows(group.companyId, rows)
                          : rows?.map((pos) => renderRow(pos)))}
            </Fragment>
        );
    }

    if (loadingCompanies) {
        return (
            <div class="text-sm text-gray-500 py-1.5 border border-transparent">
                Loading…
            </div>
        );
    }

    if (error && companies.length === 0) {
        return <div class="text-sm text-red-600 py-4">{error}</div>;
    }

    return (
        <div
            class={`space-y-4 ${grouping ? 'md:[--sticky-head-offset:10.75rem] lg:[--sticky-head-offset:7.875rem]' : 'md:[--sticky-head-offset:8.75rem] lg:[--sticky-head-offset:5.875rem]'}`}
        >
            <div class="flex flex-col gap-3 md:justify-center md:sticky md:top-(--admin-sticky-top) md:z-20 md:h-(--sticky-head-offset) md:-mt-3 md:mb-1 bg-white">
                <p class="min-h-5 text-center text-sm font-bold text-gray-900">
                    {showSummary && (
                        <>
                            <span class="text-[#0F7A4F]">
                                {formatCount(summary.english)}
                            </span>{' '}
                            of {formatCount(summary.total)}{' '}
                            {summary.total === 1 ? 'position' : 'positions'}{' '}
                            <span
                                aria-hidden="true"
                                class="font-normal text-gray-500"
                            >
                                |
                            </span>{' '}
                            <span class="text-[#0F7A4F]">
                                {formatCount(summary.companies)}
                            </span>{' '}
                            {summary.companies === 1 ? 'company' : 'companies'}{' '}
                            <span
                                aria-hidden="true"
                                class="font-normal text-gray-500"
                            >
                                |
                            </span>{' '}
                            <span class="text-[#0F7A4F]">
                                {formatCount(summary.countries)}
                            </span>{' '}
                            {summary.countries === 1 ? 'country' : 'countries'}
                        </>
                    )}
                </p>
                <div class="flex flex-wrap items-center gap-3">
                    <div class="flex items-center gap-3 grow basis-64 min-w-0 max-w-64 sm:max-w-[29rem]">
                        <label
                            class="w-17 shrink-0 text-sm font-medium text-gray-700 whitespace-nowrap"
                            for="company-select"
                        >
                            Company
                        </label>
                        <select
                            id="company-select"
                            class={filterSelectClass(selectedCompany)}
                            value={selectedCompany}
                            onChange={(e) =>
                                selectCompany(
                                    (e.target as HTMLSelectElement).value,
                                )
                            }
                        >
                            <option value="" disabled hidden>
                                Select a company
                            </option>
                            {companies.length > 0 && (
                                <option value={ALL_COMPANIES}>
                                    All companies
                                </option>
                            )}
                            {companyOptions(
                                companies,
                                selectedCompany,
                                selectedCountryId,
                            ).map((o) => (
                                <option
                                    key={o.value}
                                    value={o.value}
                                    disabled={!o.available}
                                >
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class="flex items-center gap-3 grow basis-64 min-w-0 max-w-64 sm:max-w-[29rem]">
                        <label
                            class="w-17 shrink-0 text-sm font-medium text-gray-700 whitespace-nowrap"
                            for="country-select"
                        >
                            Country
                        </label>
                        <select
                            id="country-select"
                            class={filterSelectClass(selectedCountryId)}
                            value={selectedCountryId}
                            onChange={(e) =>
                                selectCountry(
                                    (e.target as HTMLSelectElement).value,
                                )
                            }
                        >
                            <option value="" disabled hidden>
                                Select a country
                            </option>
                            <option value={ALL_COUNTRIES}>All countries</option>
                            {countryOptions(
                                companies,
                                selectedCompany,
                                selectedCountryId,
                            ).map((o) => (
                                <option
                                    key={o.value}
                                    value={o.value}
                                    disabled={!o.available}
                                >
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div class="ml-auto flex items-center gap-3 md:max-lg:w-full md:max-lg:justify-end">
                        <button
                            type="button"
                            onClick={clearFilters}
                            class="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap"
                        >
                            Clear filters
                        </button>
                        <button
                            onClick={refresh}
                            class="bg-[#0F7A4F] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0B5E3C] transition-colors whitespace-nowrap"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
                {grouping && (
                    <div class="flex h-5 items-center justify-end gap-2 text-sm">
                        {groups.length > 0 && !loadingPositions && (
                            <>
                                <button
                                    type="button"
                                    onClick={expandAllGroups}
                                    class="font-medium text-[#0F7A4F] hover:underline cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B]"
                                >
                                    Expand all
                                </button>
                                <span aria-hidden="true" class="text-gray-500">
                                    |
                                </span>
                                <button
                                    type="button"
                                    onClick={collapseAllGroups}
                                    class="font-medium text-[#0F7A4F] hover:underline cursor-pointer whitespace-nowrap rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B]"
                                >
                                    Collapse all
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {error && <p class="text-sm text-red-600">{error}</p>}

            {/* Positions table */}
            {scope && (
                <div>
                    {loadingPositions ? (
                        <div class="text-sm text-gray-500 py-4">
                            Loading positions…
                        </div>
                    ) : (browsingCatalog ? groups : positions).length === 0 ? (
                        <div class="text-sm text-gray-500 py-4">
                            {grouping
                                ? 'No positions found.'
                                : 'No positions found for this company.'}
                        </div>
                    ) : (
                        <div
                            class={`relative overflow-x-auto md:max-lg:overflow-auto ${grouping ? 'md:max-lg:max-h-[calc(100dvh-21rem)]' : 'md:max-lg:max-h-[calc(100dvh-19rem)]'} md:max-lg:[--admin-sticky-top:0px] md:max-lg:[--sticky-head-offset:0px] lg:overflow-clip rounded-xl border border-gray-200`}
                        >
                            <table class="md:sticky-head w-full text-sm">
                                <thead>
                                    <tr class="bg-gray-50 border-b border-gray-200 text-left">
                                        <th class="px-4 py-2.5 font-medium text-gray-600 min-w-40 xl:w-1/2">
                                            <button
                                                type="button"
                                                class="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                                                onClick={() =>
                                                    setSortDir((dir) =>
                                                        dir === 'asc'
                                                            ? 'desc'
                                                            : 'asc',
                                                    )
                                                }
                                            >
                                                Position
                                                <SortArrow dir={sortDir} />
                                            </button>
                                        </th>
                                        <th class="px-4 py-2.5 font-medium text-gray-600">
                                            Location
                                        </th>
                                        <th class="px-4 py-2.5 font-medium text-gray-600">
                                            Category
                                        </th>
                                        <th class="px-4 py-2.5 font-medium text-gray-600 text-center">
                                            <div>Local language</div>
                                            <div class="flex justify-center gap-3 mt-1 text-xs font-normal text-gray-500">
                                                <span class="w-10 text-center">
                                                    Req.
                                                </span>
                                                <span class="w-10 text-center">
                                                    Adv.
                                                </span>
                                                <span class="w-10 text-center">
                                                    No
                                                </span>
                                            </div>
                                        </th>
                                        <th class="px-4 py-2.5 font-medium text-gray-600">
                                            Education
                                        </th>
                                        <th class="px-4 py-2.5 w-16" />
                                    </tr>
                                </thead>
                                {groups.length > 0 ? (
                                    groups.map((group) => (
                                        <tbody
                                            key={group.key}
                                            class="divide-y divide-gray-100 border-t border-gray-200 first-of-type:border-t-0"
                                        >
                                            {renderGroup(group)}
                                        </tbody>
                                    ))
                                ) : (
                                    <tbody class="divide-y divide-gray-100">
                                        {sortedPositions.map((pos) =>
                                            renderRow(pos),
                                        )}
                                    </tbody>
                                )}
                                {browsingCatalog &&
                                    catalog.total > visibleCompanies && (
                                        <tbody class="border-t border-gray-200">
                                            <tr>
                                                <td
                                                    colSpan={COLUMN_COUNT}
                                                    class="px-4 py-3"
                                                >
                                                    <div class="sticky left-4 inline-flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={
                                                                loadMoreCompanies
                                                            }
                                                            class="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
                                                        >
                                                            Load more
                                                        </button>
                                                        <span class="text-sm text-gray-500 whitespace-nowrap">
                                                            {formatCount(
                                                                visibleCompanies,
                                                            )}{' '}
                                                            of{' '}
                                                            {formatCount(
                                                                catalog.total,
                                                            )}{' '}
                                                            companies
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </tbody>
                                    )}
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
