import { useState, useEffect } from 'preact/hooks';
import { CATEGORIES } from '../../lib/categories';
import { isHttpUrl } from '../../lib/safe-url';
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
    catalogSummary,
    companyOptions,
    countryOptions,
    positionSummary,
    resolveScope,
} from '../../lib/admin-position-scope';

const filterSelectClass = (value: string) =>
    `admin-select flex-1 min-w-0 max-w-sm text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B] [&>option:enabled]:text-gray-900 [&>option:disabled]:text-gray-400 ${value ? '' : 'text-gray-500'}`;

const EDUCATION_OPTIONS = [
    { value: '', label: '— not specified —' },
    { value: 'vocational', label: 'Vocational' },
    { value: 'bachelor', label: "Bachelor's" },
    { value: 'master', label: "Master's" },
    { value: 'mba', label: 'MBA' },
    { value: 'phd', label: 'PhD' },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SortArrow({ dir, active }: { dir: 'asc' | 'desc'; active: boolean }) {
    const cls = 'w-2.5 h-2.5 inline-block ml-1 sm:ml-1.5';
    if (!active) {
        return (
            <svg
                class={cls}
                width="10"
                height="12"
                style={{ opacity: 0.35 }}
                fill="none"
                viewBox="0 0 10 12"
                stroke="currentColor"
                stroke-width={2}
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 4l4-4 4 4"
                />
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 8l4 4 4-4"
                />
            </svg>
        );
    }
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
    const [sort, setSort] = useState<{
        key: 'company' | 'title';
        dir: 'asc' | 'desc';
    } | null>(null);
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
    const showCompanyColumn = scope?.multiCompany ?? false;

    useEffect(() => {
        if (scopeQuery === null) {
            setPositions([]);
            setLoadingPositions(false);
            return;
        }
        setError('');
        // Match the order the API returns rows in, so the sorted column loads active.
        setSort({ key: showCompanyColumn ? 'company' : 'title', dir: 'asc' });

        const cacheKey = `positions:${scopeQuery}`;
        const cached = readCache<PositionRow[]>(cacheKey);
        if (cached) {
            setPositions(cached);
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
    }, [scopeQuery, reloadKey]);

    function refresh() {
        invalidateCache('companies');
        invalidateCachePrefix('positions:');
        loadCompanies(true);
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

    function toggleSort(key: 'company' | 'title') {
        setSort((prev) =>
            prev?.key === key
                ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: 'asc' },
        );
    }

    const sortedPositions = sort
        ? [...positions].sort((a, b) => {
              const av =
                  sort.key === 'company'
                      ? (a.company?.name ?? '')
                      : (a.title ?? '');
              const bv =
                  sort.key === 'company'
                      ? (b.company?.name ?? '')
                      : (b.title ?? '');
              const cmp = av.localeCompare(bv);
              return sort.dir === 'asc' ? cmp : -cmp;
          })
        : positions;

    function setSave(id: string, state: SaveState) {
        setSaveStates((prev) => ({ ...prev, [id]: state }));
    }

    // Optimistic edits also update the cached copy for the current selection.
    function setPositionsAndCache(
        updater: (prev: PositionRow[]) => PositionRow[],
    ) {
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

    const summary = scope
        ? positionSummary(positions)
        : catalogSummary(companies);
    const showSummary = scope
        ? !loadingPositions && positions.length > 0
        : companies.length > 0;

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
        <div class="space-y-4 md:[--sticky-head-offset:8.75rem] lg:[--sticky-head-offset:5.875rem]">
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
            </div>

            {error && <p class="text-sm text-red-600">{error}</p>}

            {/* Positions table */}
            {scope && (
                <div>
                    {loadingPositions ? (
                        <div class="text-sm text-gray-500 py-4">
                            Loading positions…
                        </div>
                    ) : positions.length === 0 ? (
                        <div class="text-sm text-gray-500 py-4">
                            {showCompanyColumn
                                ? 'No positions found.'
                                : 'No positions found for this company.'}
                        </div>
                    ) : (
                        <div class="relative overflow-x-auto md:max-lg:overflow-auto md:max-lg:max-h-[calc(100dvh-19rem)] md:max-lg:[--admin-sticky-top:0px] md:max-lg:[--sticky-head-offset:0px] lg:overflow-visible rounded-xl border border-gray-200">
                            <table class="md:sticky-head w-full text-sm">
                                <thead>
                                    <tr class="bg-gray-50 border-b border-gray-200 text-left">
                                        {showCompanyColumn && (
                                            <th class="px-4 py-2.5 font-medium text-gray-600">
                                                <button
                                                    type="button"
                                                    class="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                                                    onClick={() =>
                                                        toggleSort('company')
                                                    }
                                                >
                                                    Company
                                                    <SortArrow
                                                        dir={
                                                            sort?.key ===
                                                            'company'
                                                                ? sort.dir
                                                                : 'desc'
                                                        }
                                                        active={
                                                            sort?.key ===
                                                            'company'
                                                        }
                                                    />
                                                </button>
                                            </th>
                                        )}
                                        <th class="px-4 py-2.5 font-medium text-gray-600 min-w-40 xl:w-1/2">
                                            <button
                                                type="button"
                                                class="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                                                onClick={() =>
                                                    toggleSort('title')
                                                }
                                            >
                                                Position
                                                <SortArrow
                                                    dir={
                                                        sort?.key === 'title'
                                                            ? sort.dir
                                                            : 'desc'
                                                    }
                                                    active={
                                                        sort?.key === 'title'
                                                    }
                                                />
                                            </button>
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
                                <tbody class="divide-y divide-gray-100">
                                    {sortedPositions.map((pos) => {
                                        const state =
                                            saveStates[pos.id] ?? 'idle';
                                        return (
                                            <tr
                                                key={pos.id}
                                                class="bg-white hover:bg-gray-50/50"
                                            >
                                                {/* Company */}
                                                {showCompanyColumn && (
                                                    <td class="px-4 py-2.5 xl:whitespace-nowrap">
                                                        <span class="font-medium text-gray-800">
                                                            {pos.company
                                                                ?.name ?? '—'}
                                                        </span>
                                                    </td>
                                                )}

                                                {/* Title */}
                                                <td class="px-4 py-2.5 min-w-40 [overflow-wrap:anywhere]">
                                                    {pos.url &&
                                                    isHttpUrl(pos.url) ? (
                                                        <a
                                                            href={pos.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            class="text-[#0F7A4F] hover:underline font-medium line-clamp-2"
                                                        >
                                                            {pos.title}
                                                            <span class="sr-only">
                                                                {' '}
                                                                (opens in a new
                                                                tab)
                                                            </span>
                                                        </a>
                                                    ) : (
                                                        <span class="font-medium text-gray-800">
                                                            {pos.title}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Category */}
                                                <td class="px-4 py-2.5">
                                                    <select
                                                        name={`category-${pos.id}`}
                                                        aria-label={`Category for ${pos.title}`}
                                                        class="admin-select text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#12956B] bg-white"
                                                        value={
                                                            pos.category
                                                                ?.slug ?? ''
                                                        }
                                                        onChange={(e) =>
                                                            handleCategoryChange(
                                                                pos,
                                                                (
                                                                    e.target as HTMLSelectElement
                                                                ).value,
                                                            )
                                                        }
                                                    >
                                                        {knownCategories.map(
                                                            (cat) => (
                                                                <option
                                                                    key={
                                                                        cat.slug
                                                                    }
                                                                    value={
                                                                        cat.slug
                                                                    }
                                                                >
                                                                    {cat.name}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </td>

                                                {/* Local language */}
                                                <td class="px-4 py-2.5">
                                                    <div class="flex justify-center gap-3">
                                                        <span class="w-10 flex justify-center">
                                                            <input
                                                                type="radio"
                                                                name={`lang-${pos.id}`}
                                                                checked={
                                                                    pos.requires_native_language
                                                                }
                                                                onChange={() =>
                                                                    handleLangChange(
                                                                        pos,
                                                                        'required',
                                                                    )
                                                                }
                                                            />
                                                        </span>
                                                        <span class="w-10 flex justify-center">
                                                            <input
                                                                type="radio"
                                                                name={`lang-${pos.id}`}
                                                                checked={
                                                                    pos.local_language_advantage
                                                                }
                                                                onChange={() =>
                                                                    handleLangChange(
                                                                        pos,
                                                                        'advantage',
                                                                    )
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
                                                                onChange={() =>
                                                                    handleLangChange(
                                                                        pos,
                                                                        'none',
                                                                    )
                                                                }
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
                                                        value={
                                                            pos.required_education ??
                                                            ''
                                                        }
                                                        onChange={(e) =>
                                                            handleEducationChange(
                                                                pos,
                                                                (
                                                                    e.target as HTMLSelectElement
                                                                ).value,
                                                            )
                                                        }
                                                    >
                                                        {EDUCATION_OPTIONS.map(
                                                            (opt) => (
                                                                <option
                                                                    key={
                                                                        opt.value
                                                                    }
                                                                    value={
                                                                        opt.value
                                                                    }
                                                                >
                                                                    {opt.label}
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                </td>

                                                {/* Save indicator */}
                                                <td class="px-4 py-2.5 text-center">
                                                    {state === 'saving' && (
                                                        <span class="text-xs text-gray-500">
                                                            Saving…
                                                        </span>
                                                    )}
                                                    {state === 'saved' && (
                                                        <span class="text-xs text-green-700">
                                                            Saved
                                                        </span>
                                                    )}
                                                    {state === 'error' && (
                                                        <span class="text-xs text-red-600">
                                                            Error
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
