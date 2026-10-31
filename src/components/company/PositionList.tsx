import {
    useState,
    useRef,
    useMemo,
    useEffect,
    useLayoutEffect,
} from 'preact/hooks';
import type { ListedPosition } from '../../lib/types';
import { foldText, formatCount } from '../../lib/text';
import {
    DEFAULT_SORT,
    EMPTY_FILTERS,
    FACET_LABELS,
    FACET_PLURALS,
    SORT_LABELS,
    applyFilters,
    buildFacets,
    facetCounts,
    facetOptions,
    facetSummary,
    hasActiveFilters,
    parseFilters,
    parseSort,
    serializeFilters,
    sortKeysFor,
    sortPositions,
    type FacetKey,
    type FacetOption,
    type FilterState,
    type PageKind,
    type SortKey,
} from '../../lib/position-filters';
import MultiSelectFilter from '../shared/MultiSelectFilter';

interface Props {
    positions: ListedPosition[];
    kind: PageKind;
    report: { company?: string; country?: string; url: string };
}

const numFont = { fontFamily: "'Inter', 'Inter Fallback', sans-serif" };

function PositionRow({ pos, kind }: { pos: ListedPosition; kind: PageKind }) {
    const context = kind === 'country' ? pos.company_name : pos.country_name;
    const inner = (
        <div class="flex items-center justify-between gap-4 py-3 sm:py-5 md:py-6">
            <div class="min-w-0 flex-1">
                <span
                    class="text-sm sm:text-base font-semibold text-gray-900 leading-tight line-clamp-2"
                    style={numFont}
                >
                    {pos.title}
                </span>
                <div
                    class="text-xs sm:text-sm text-gray-500 mt-1.5"
                    style={numFont}
                >
                    <span class="font-medium text-gray-700">{context}</span>
                    {pos.work_model && (
                        <span class="capitalize"> · {pos.work_model}</span>
                    )}
                    {pos.city && pos.city.length > 0 && (
                        <span>
                            {' · '}
                            {pos.city.length > 1
                                ? 'Multiple locations'
                                : pos.city[0]}
                        </span>
                    )}
                </div>
                {pos.local_language_advantage && (
                    <div class="mt-1 leading-none" style={numFont}>
                        <span class="text-xs sm:text-sm text-amber-700 font-medium">
                            Local language advantage
                        </span>
                    </div>
                )}
            </div>
            <div class="flex items-center gap-2 sm:gap-4 shrink-0">
                <span
                    class="text-[0.65rem] sm:text-xs font-semibold tracking-wider uppercase text-gray-500 max-w-24 sm:max-w-none text-right line-clamp-2"
                    style={numFont}
                >
                    {pos.category_name}
                </span>
                <svg
                    class="w-4 h-4 sm:w-[1.125rem] sm:h-[1.125rem] md:w-5 md:h-5 text-gray-500"
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width={1.5}
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M10.0002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002V15.8002C5 16.9203 5 17.4801 5.21799 17.9079C5.40973 18.2842 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8031C16.921 19 17.48 19 17.9074 18.7822C18.2837 18.5905 18.5905 18.2839 18.7822 17.9076C19 17.4802 19 16.921 19 15.8031V14M20 9V4M20 4H15M20 4L13 11"
                    />
                </svg>
            </div>
        </div>
    );

    return (
        <li class="border-b border-gray-100 hover-hl-item">
            {pos.url ? (
                <a
                    href={pos.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="no-underline block"
                >
                    {inner}
                    <span class="sr-only"> (opens in a new tab)</span>
                </a>
            ) : (
                inner
            )}
        </li>
    );
}

const TALLY_REPORT_URL = 'https://tally.so/r/MeZWEl';
const PAGE_SIZE = 25;

export default function PositionList({ positions, kind, report }: Props) {
    const [inputValue, setInputValue] = useState('');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [sort, setSort] = useState<SortKey | null>(null);
    const activeSort = sort ?? DEFAULT_SORT;
    // Some browsers keep a select :focus-visible after a mouse pick, so the ring is keyboard-only by hand.
    const [sortByPointer, setSortByPointer] = useState(false);
    const [ready, setReady] = useState(false);
    const [shown, setShown] = useState(PAGE_SIZE);
    const debounceRef = useRef(0);

    const facets = useMemo(
        () => buildFacets(positions, kind),
        [positions, kind],
    );
    const placeKey: FacetKey = kind === 'country' ? 'company' : 'country';
    const placeOptions = useMemo(
        () => facetOptions(positions, placeKey),
        [positions, placeKey],
    );
    const categoryOptions = useMemo(
        () => facetOptions(positions, 'category'),
        [positions],
    );

    // Layout effect: the URL must be parsed before any input event can write a stale one.
    useLayoutEffect(() => {
        setFilters(parseFilters(location.search, facets));
        setSort(parseSort(location.search, kind));
        setReady(true);
    }, [facets, kind]);

    useEffect(() => {
        if (ready) document.documentElement.dataset.filtersReady = '';
    }, [ready]);

    const writeUrl = (nextFilters: FilterState, nextSort: SortKey | null) =>
        history.replaceState(
            history.state,
            '',
            `${location.pathname}${serializeFilters(nextFilters, nextSort)}${location.hash}`,
        );

    const updateFilters = (next: FilterState) => {
        setFilters(next);
        writeUrl(next, sort);
    };

    const updateSort = (next: SortKey) => {
        setSort(next);
        writeUrl(filters, next);
    };

    const setFacet = (key: FacetKey, values: string[]) =>
        updateFilters({
            ...filters,
            selected: { ...filters.selected, [key]: values },
        });

    const clearAll = () => {
        updateFilters(EMPTY_FILTERS);
        setInputValue('');
        setSearch('');
        clearTimeout(debounceRef.current);
    };

    const filtered = useMemo(() => {
        const narrowed = sortPositions(
            applyFilters(positions, filters),
            activeSort,
        );
        const q = foldText(search).trim();
        if (!q) return narrowed;
        return narrowed.filter((p) => foldText(p.title).includes(q));
    }, [positions, filters, sort, search]);

    useEffect(() => setShown(PAGE_SIZE), [filters, sort, search]);

    const narrowedTo = filters.selected[placeKey];
    const narrowedLabel =
        narrowedTo?.length === 1
            ? facets[placeKey]?.find((o) => o.value === narrowedTo[0])?.label
            : undefined;
    const reportParams = new URLSearchParams({
        company:
            report.company ?? (kind === 'country' ? (narrowedLabel ?? '') : ''),
        country:
            report.country ?? (kind === 'company' ? (narrowedLabel ?? '') : ''),
        url: `${report.url}${serializeFilters(filters, sort)}`,
    });
    const reportUrl = `${TALLY_REPORT_URL}?${reportParams}`;

    const filtersActive = hasActiveFilters(filters);

    const renderFacet = (key: FacetKey, options: FacetOption[]) => {
        const selected = filters.selected[key] ?? [];
        const summary = facetSummary(key, options, selected, filtered);
        return options.length < 2 ? (
            summary
        ) : (
            <MultiSelectFilter
                id={`filter-${key}`}
                label={FACET_LABELS[key]}
                plural={FACET_PLURALS[key]}
                summary={summary}
                options={options}
                counts={facetCounts(positions, filters, key)}
                selected={selected}
                onChange={(values) => setFacet(key, values)}
            />
        );
    };

    const namedCategory =
        categoryOptions.length === 1 || filters.selected.category?.length === 1;

    return (
        <div>
            <div class="flex items-center gap-3 mb-5 sm:mb-6 px-4 bg-white border border-gray-200 rounded-lg shadow-[0_2px_12px_rgba(17,24,39,0.08)] focus-within:border-[#12956B] focus-within:ring-1 focus-within:ring-[#12956B] transition-colors">
                <svg
                    aria-hidden="true"
                    class="w-5 h-5 shrink-0 text-gray-500"
                    width="20"
                    height="20"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width={2}
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
                    />
                </svg>
                <input
                    type="text"
                    aria-label="Search positions"
                    placeholder="Search positions"
                    value={inputValue}
                    onInput={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        setInputValue(val);
                        clearTimeout(debounceRef.current);
                        debounceRef.current = window.setTimeout(() => {
                            setSearch(val);
                        }, 500);
                    }}
                    class="flex-1 min-w-0 py-3.5 text-base text-gray-900 placeholder:text-gray-500 bg-transparent outline-none"
                    style={numFont}
                />
                {inputValue && (
                    <button
                        type="button"
                        onClick={() => {
                            setInputValue('');
                            setSearch('');
                            clearTimeout(debounceRef.current);
                        }}
                        class="shrink-0 w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B]"
                        aria-label="Clear search"
                    >
                        <svg
                            aria-hidden="true"
                            class="w-4 h-4"
                            width="16"
                            height="16"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width={2.5}
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                )}
            </div>

            <div class="mb-4">
                <div
                    class="relative min-w-0 text-xl sm:text-2xl md:text-[1.625rem] leading-snug font-bold text-gray-900"
                    style={numFont}
                    data-position-results
                >
                    <span role="status">
                        {formatCount(filtered.length)}{' '}
                        {filtered.length === 1 ? 'position' : 'positions'}
                    </span>{' '}
                    {kind === 'country' ? 'at' : 'in'}{' '}
                    {renderFacet(placeKey, placeOptions)}{' '}
                    {namedCategory ? 'in' : 'across'}{' '}
                    {renderFacet('category', categoryOptions)}
                    {filtersActive && (
                        <>
                            {' '}
                            <button
                                type="button"
                                onClick={() => updateFilters(EMPTY_FILTERS)}
                                class="align-[0.16em] sm:align-[0.18em] md:align-[0.22em] text-sm sm:text-base font-normal text-gray-500 hover:text-gray-700 hover:underline transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2"
                            >
                                Clear filters
                            </button>
                        </>
                    )}
                </div>
                <div class="flex justify-end mt-2">
                    <label
                        class="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500"
                        style={numFont}
                    >
                        Sort by
                        <span
                            class={`icon-link relative inline-flex items-center gap-1 font-semibold text-[#0F7A4F] rounded ${sortByPointer ? '' : 'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#12956B] has-[:focus-visible]:ring-offset-2'}`}
                        >
                            <span aria-hidden="true">
                                {SORT_LABELS[activeSort]}
                            </span>
                            <svg
                                aria-hidden="true"
                                class="w-3 h-3"
                                width="12"
                                height="12"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                stroke-width={3}
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M6 9l6 6 6-6"
                                />
                            </svg>
                            <select
                                aria-label="Sort by"
                                value={activeSort}
                                onPointerDown={() => setSortByPointer(true)}
                                onBlur={() => setSortByPointer(false)}
                                onChange={(e) =>
                                    updateSort(
                                        (e.target as HTMLSelectElement)
                                            .value as SortKey,
                                    )
                                }
                                class="absolute inset-0 w-full opacity-0 cursor-pointer"
                            >
                                {sortKeysFor(kind).map((key) => (
                                    <option key={key} value={key}>
                                        {SORT_LABELS[key]}
                                    </option>
                                ))}
                            </select>
                        </span>
                    </label>
                </div>
            </div>

            <ul
                class="hover-hl-list border-t border-gray-200"
                data-position-results
            >
                {filtered.length === 0 ? (
                    <li class="py-12 text-center text-gray-500">
                        {search || filtersActive ? (
                            <>
                                <p
                                    class="text-base sm:text-lg mb-1.5"
                                    style={numFont}
                                >
                                    {search
                                        ? `No positions found matching "${inputValue}"`
                                        : 'No positions match these filters'}
                                </p>
                                <p class="text-sm text-gray-500">
                                    Try a different search term or{' '}
                                    <button
                                        type="button"
                                        onClick={clearAll}
                                        class="font-medium text-[#0F7A4F] hover:underline cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2"
                                    >
                                        clear the filters
                                    </button>
                                    .
                                </p>
                            </>
                        ) : (
                            <p class="text-base sm:text-lg" style={numFont}>
                                No English-friendly positions available right
                                now.
                            </p>
                        )}
                    </li>
                ) : (
                    filtered
                        .slice(0, shown)
                        .map((pos) => (
                            <PositionRow key={pos.id} pos={pos} kind={kind} />
                        ))
                )}
            </ul>

            <div class="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
                <span
                    class="text-center xs:text-left text-[0.6rem] sm:text-xs text-gray-500 font-semibold tracking-wider uppercase"
                    style={numFont}
                >
                    {formatCount(Math.min(shown, filtered.length))} of{' '}
                    {formatCount(filtered.length)}{' '}
                    <span class="max-xs:block">positions</span>
                </span>
                {filtered.length > shown && (
                    <button
                        type="button"
                        onClick={() => setShown(shown + PAGE_SIZE)}
                        class="btn"
                    >
                        Show more
                    </button>
                )}
                <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="col-start-3 text-center xs:text-right text-xs sm:text-sm font-medium text-gray-500 hover:text-[#0F7A4F] hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2 rounded"
                >
                    Report <span class="max-xs:block">an issue</span>
                    <span class="sr-only"> (opens in a new tab)</span>
                </a>
            </div>
        </div>
    );
}
