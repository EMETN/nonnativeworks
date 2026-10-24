import {
    useState,
    useRef,
    useMemo,
    useEffect,
    useLayoutEffect,
} from 'preact/hooks';
import type { ListedPosition } from '../../lib/types';
import { foldText } from '../../lib/text';
import {
    DEFAULT_SORT,
    EMPTY_FILTERS,
    FACET_LABELS,
    SORT_LABELS,
    applyFilters,
    buildFacets,
    facetCounts,
    hasActiveFilters,
    parseFilters,
    parseSort,
    serializeFilters,
    sortKeysFor,
    sortPositions,
    type FacetKey,
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
                    class="text-base sm:text-lg md:text-xl font-semibold text-gray-900 leading-tight line-clamp-2"
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
    const [ready, setReady] = useState(false);
    const [shown, setShown] = useState(PAGE_SIZE);
    const debounceRef = useRef(0);

    const facets = useMemo(
        () => buildFacets(positions, kind),
        [positions, kind],
    );
    const facetKeys = Object.keys(facets) as FacetKey[];

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

    const careerUrls = new Set(filtered.map((p) => p.career_page_url));
    const careerPageUrl = careerUrls.size === 1 ? [...careerUrls][0] : null;

    const otherDimension = kind === 'country' ? 'company' : 'country';
    const narrowedTo = filters.selected[otherDimension];
    const narrowedLabel =
        narrowedTo?.length === 1
            ? facets[otherDimension]?.find((o) => o.value === narrowedTo[0])
                  ?.label
            : undefined;
    const reportParams = new URLSearchParams({
        company:
            report.company ?? (kind === 'country' ? (narrowedLabel ?? '') : ''),
        country:
            report.country ?? (kind === 'company' ? (narrowedLabel ?? '') : ''),
        url: `${report.url}${serializeFilters(filters, sort)}`,
    });
    const reportUrl = `${TALLY_REPORT_URL}?${reportParams}`;

    const hasLocalAdvantage = positions.some((p) => p.local_language_advantage);
    const filtersActive = hasActiveFilters(filters);
    const anythingActive = filtersActive || inputValue !== '';

    return (
        <div>
            <div class="relative flex flex-wrap items-center gap-2 mb-3">
                {facetKeys.map((key) => (
                    <MultiSelectFilter
                        key={key}
                        id={`filter-${key}`}
                        label={FACET_LABELS[key]}
                        options={facets[key]!}
                        counts={facetCounts(positions, filters, key)}
                        selected={filters.selected[key] ?? []}
                        onChange={(values) => setFacet(key, values)}
                    />
                ))}
                {hasLocalAdvantage && (
                    <button
                        type="button"
                        aria-pressed={filters.hideLocalAdvantage}
                        onClick={() =>
                            updateFilters({
                                ...filters,
                                hideLocalAdvantage: !filters.hideLocalAdvantage,
                            })
                        }
                        class={`text-xs sm:text-sm font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2 ${filters.hideLocalAdvantage ? 'border-[#0F7A4F] text-[#0F7A4F] bg-[#0F7A4F]/5' : 'border-gray-300 text-gray-700 hover:border-gray-400'}`}
                        style={numFont}
                    >
                        Hide local language advantage
                    </button>
                )}
                {anythingActive && (
                    <button
                        type="button"
                        onClick={clearAll}
                        class="inline-flex items-center gap-1 text-xs sm:text-sm font-medium px-2 py-1 text-gray-500 hover:text-[#0F7A4F] transition-colors cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2"
                        style={numFont}
                    >
                        <svg
                            aria-hidden="true"
                            class="w-3 h-3 sm:w-3.5 sm:h-3.5"
                            width="12"
                            height="12"
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
                        Clear filters
                    </button>
                )}
                <label
                    class="w-full sm:w-auto ml-auto flex items-center justify-end gap-1.5 text-xs sm:text-sm text-gray-500 border-t border-gray-200 pt-2 mt-1 sm:border-t-0 sm:pt-0 sm:mt-0"
                    style={numFont}
                >
                    Sort by
                    <span class="relative inline-flex items-center gap-1 font-medium px-3 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-gray-400 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#12956B] has-[:focus-visible]:ring-offset-2">
                        <span aria-hidden="true" class="grid">
                            {sortKeysFor(kind).map((key) => (
                                <span
                                    key={key}
                                    class={`[grid-area:1/1] ${key === activeSort ? '' : 'invisible'}`}
                                >
                                    {SORT_LABELS[key]}
                                </span>
                            ))}
                        </span>
                        <svg
                            aria-hidden="true"
                            class="w-3 h-3"
                            width="12"
                            height="12"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            stroke-width={2.5}
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

            {/* Search */}
            <div class="w-full border-b border-gray-200 pb-2 mb-2 flex items-center justify-between gap-3">
                <div class="relative flex-1 min-w-0 sm:flex-none sm:w-56 md:w-64">
                    <svg
                        class="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 pointer-events-none"
                        width="16"
                        height="16"
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
                        aria-label="Search by title"
                        placeholder="Search by title..."
                        value={inputValue}
                        onInput={(e) => {
                            const val = (e.target as HTMLInputElement).value;
                            setInputValue(val);
                            clearTimeout(debounceRef.current);
                            debounceRef.current = window.setTimeout(() => {
                                setSearch(val);
                            }, 200);
                        }}
                        class={`w-full text-xs sm:text-sm bg-transparent pl-5 sm:pl-6 ${inputValue ? 'pr-6' : 'pr-1'} py-1 outline-none`}
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
                            class="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-600 transition-colors cursor-pointer"
                            aria-label="Clear search"
                        >
                            <svg
                                class="w-3 h-3 sm:w-3.5 sm:h-3.5"
                                width="12"
                                height="12"
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
                <a
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="shrink-0 text-xs sm:text-sm font-medium text-gray-500 hover:text-[#0F7A4F] hover:underline transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2 rounded"
                >
                    Report an issue
                    <span class="sr-only"> (opens in a new tab)</span>
                </a>
            </div>

            {/* Position list */}
            <ul class="hover-hl-list" data-position-results>
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

            {filtered.length > shown && (
                <div class="mt-4 text-center">
                    <button
                        type="button"
                        onClick={() => setShown(shown + PAGE_SIZE)}
                        class="text-xs sm:text-sm font-medium px-4 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:border-gray-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12956B] focus-visible:ring-offset-2"
                        style={numFont}
                    >
                        Show more
                    </button>
                </div>
            )}

            {/* Footer */}
            <div class="mt-4 flex items-center justify-between">
                <span
                    class="text-[0.6rem] sm:text-xs text-gray-500 font-semibold tracking-wider uppercase"
                    style={numFont}
                >
                    {Math.min(shown, filtered.length)} of {filtered.length}{' '}
                    positions
                </span>
                {careerPageUrl && (
                    <a
                        href={careerPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-[0.65rem] sm:text-xs text-[#0F7A4F] hover:text-[#084A2F] font-semibold tracking-wider uppercase"
                        style={numFont}
                    >
                        All positions
                        <span class="sr-only"> (opens in a new tab)</span>
                        <svg
                            aria-hidden="true"
                            class="w-4 h-4 sm:w-[1.125rem] sm:h-[1.125rem] md:w-5 md:h-5 inline-block ml-1"
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
                    </a>
                )}
            </div>
        </div>
    );
}
