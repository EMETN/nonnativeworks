import { useState, useRef, useMemo } from 'preact/hooks';

export interface DataGridItem {
    id: string;
    name: string;
    href: string;
    flag?: string;
    english_positions: number;
    total_positions: number;
    english_percentage: number;
    updated_at: string | null;
    company_count?: number;
    career_page_url?: string | null;
}

interface Props {
    items: DataGridItem[];
    compact?: boolean;
    compactLabel?: string;
    entityName?: string;
}

type SortField = 'positions' | 'total' | 'companies';
type SortDir = 'desc' | 'asc';

function formatNumber(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const numFont = { fontFamily: "'Inter', 'Inter Fallback', sans-serif" };

// compact: name | companies | non-native | arrow
const compactGridCols = 'minmax(0, 1fr) auto auto auto';
// non-compact: name | positions (X/Y) | arrow
const fullGridCols = 'minmax(0, 1fr) auto auto';

function SortArrow({ dir, active }: { dir: SortDir; active: boolean }) {
    return (
        <svg
            class="w-2 h-2 sm:w-2.5 sm:h-2.5 inline-block ml-1 sm:ml-1.5"
            width="10"
            height="10"
            style={{ opacity: active ? 1 : 0.35 }}
            fill="none"
            viewBox="0 0 10 6"
            stroke="currentColor"
            stroke-width={2}
        >
            {dir === 'desc' ? (
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 1l4 4 4-4"
                />
            ) : (
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M1 5l4-4 4 4"
                />
            )}
        </svg>
    );
}

function SizingRow({
    items,
    compact,
}: {
    items: DataGridItem[];
    compact?: boolean;
}) {
    const widest = [...items].sort(
        (a, b) => b.total_positions - a.total_positions,
    )[0];
    if (!widest) return null;
    const ts = 'text-xl md:text-lg lg:text-2xl';
    const ss = 'text-sm md:text-xs lg:text-base';
    const ys = 'text-sm md:text-xs lg:text-base';
    const as = 'w-4 h-4 md:w-3.5 md:h-3.5 lg:w-5 lg:h-5';
    const maxCompanies = compact
        ? Math.max(...items.map((i) => i.company_count ?? 0))
        : 0;

    return (
        <li aria-hidden="true" class="h-0 overflow-hidden invisible dg-subgrid">
            <div class="pr-2 sm:pr-4 md:pr-8 xl:pr-12">
                <span class={ts} style={numFont}>
                    W
                </span>
            </div>
            {compact ? (
                <>
                    <div class="pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6">
                        <span class={`${ts} tabular-nums`} style={numFont}>
                            {formatNumber(maxCompanies)}
                        </span>
                    </div>
                    <div class="pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6 flex items-baseline gap-0.5 sm:gap-1">
                        <span class={`${ts} tabular-nums`} style={numFont}>
                            {formatNumber(widest.english_positions)}
                        </span>
                        <span
                            class={`${ss} font-light text-gray-400`}
                            style={numFont}
                        >
                            /
                        </span>
                        <span class={`${ys} tabular-nums`} style={numFont}>
                            {formatNumber(widest.total_positions)}
                        </span>
                    </div>
                </>
            ) : (
                <div class="pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6 flex items-baseline gap-0.5 sm:gap-1">
                    <span class={`${ts} tabular-nums`} style={numFont}>
                        {formatNumber(widest.english_positions)}
                    </span>
                    <span
                        class={`${ss} font-light text-gray-400`}
                        style={numFont}
                    >
                        /
                    </span>
                    <span class={`${ys} tabular-nums`} style={numFont}>
                        {formatNumber(widest.total_positions)}
                    </span>
                </div>
            )}
            <div class="pl-1 sm:pl-3 md:pl-6 xl:pl-10">
                <svg class={as} width="12" height="12" viewBox="0 0 24 24" />
            </div>
        </li>
    );
}

function GridRow({ item, compact }: { item: DataGridItem; compact?: boolean }) {
    const textSize = 'text-xl md:text-lg lg:text-2xl';
    const slashSize = 'text-sm md:text-xs lg:text-base';
    const totalSize = 'text-sm md:text-xs lg:text-base';
    const arrowSize = 'w-4 h-4 md:w-3.5 md:h-3.5 lg:w-5 lg:h-5';
    const rowPy = 'py-3.5 sm:py-4';

    const noPositions = item.english_positions === 0;

    // A company with no English-friendly positions has no meaningful detail page —
    // link straight out to its careers page (all positions) instead.
    const noEnglish = noPositions && !!item.career_page_url;

    return (
        <li
            class={`border-b border-gray-100 dg-subgrid hover-hl-item${noPositions ? ' hover-hl-none' : ''}`}
        >
            <a
                href={noEnglish ? item.career_page_url! : item.href}
                {...(noEnglish
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : { 'data-astro-prefetch': true })}
                class="no-underline rounded-lg dg-subgrid"
            >
                <div
                    class={`flex items-center ${rowPy} pr-2 sm:pr-4 md:pr-8 xl:pr-12 min-w-0`}
                >
                    <div class="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
                        {item.flag && (
                            <span class="inline-flex items-center justify-center shrink-0 w-[1.875rem] md:w-[1.6875rem] lg:w-[2.25rem]">
                                <img
                                    src={item.flag}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    class="w-auto shadow-[0_0_10px_0_rgba(100,115,139,0.4)] h-[1.25rem] md:h-[1.125rem] lg:h-[1.5rem]"
                                />
                            </span>
                        )}
                        <span
                            class={`${textSize} font-semibold text-gray-900 leading-tight tracking-tight truncate`}
                            style={numFont}
                        >
                            {item.name}
                        </span>
                    </div>
                </div>

                {compact ? (
                    <>
                        <div
                            class={`flex items-center justify-end ${rowPy} pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6`}
                        >
                            <span
                                class={`${textSize} font-semibold text-gray-800 leading-none tabular-nums`}
                                style={numFont}
                            >
                                {formatNumber(item.company_count ?? 0)}
                            </span>
                        </div>
                        <div
                            class={`flex items-center justify-end gap-0.5 sm:gap-1 ${rowPy} pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6`}
                            title={`${item.english_positions} English-friendly of ${item.total_positions} total positions`}
                            aria-label={`${item.english_positions} English-friendly of ${item.total_positions} total positions`}
                        >
                            <span
                                class={`${textSize} font-bold ${noPositions ? 'text-[#C0392B]' : 'text-[#0F7A4F]'} leading-none tabular-nums`}
                                style={numFont}
                            >
                                {formatNumber(item.english_positions)}
                            </span>
                            <span
                                class={`${slashSize} font-light text-gray-500 leading-none`}
                                style={numFont}
                                aria-hidden="true"
                            >
                                /
                            </span>
                            <span
                                class={`${totalSize} text-gray-500 leading-none tabular-nums`}
                                style={numFont}
                            >
                                {formatNumber(item.total_positions)}
                            </span>
                        </div>
                    </>
                ) : (
                    <div
                        class={`flex items-center justify-end gap-0.5 sm:gap-1 ${rowPy} pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6`}
                        title={`${item.english_positions} English-friendly of ${item.total_positions} total positions`}
                        aria-label={`${item.english_positions} English-friendly of ${item.total_positions} total positions`}
                    >
                        <span
                            class={`${textSize} font-bold ${noPositions ? 'text-[#C0392B]' : 'text-[#0F7A4F]'} leading-none tabular-nums`}
                            style={numFont}
                        >
                            {formatNumber(item.english_positions)}
                        </span>
                        <span
                            class={`${slashSize} font-light text-gray-500 leading-none`}
                            style={numFont}
                            aria-hidden="true"
                        >
                            /
                        </span>
                        <span
                            class={`${totalSize} text-gray-500 leading-none tabular-nums`}
                            style={numFont}
                        >
                            {formatNumber(item.total_positions)}
                        </span>
                    </div>
                )}

                <div
                    class={`flex items-center justify-end ${rowPy} pl-1 sm:pl-3 md:pl-6 xl:pl-10`}
                >
                    <svg
                        class={`${arrowSize} text-gray-400`}
                        width="12"
                        height="12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width={1.5}
                    >
                        {noEnglish ? (
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M10.0002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002V15.8002C5 16.9203 5 17.4801 5.21799 17.9079C5.40973 18.2842 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8031C16.921 19 17.48 19 17.9074 18.7822C18.2837 18.5905 18.5905 18.2839 18.7822 17.9076C19 17.4802 19 16.921 19 15.8031V14M20 9V4M20 4H15M20 4L13 11"
                            />
                        ) : (
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M9 5l7 7-7 7"
                            />
                        )}
                    </svg>
                </div>
            </a>
        </li>
    );
}

export default function DataGrid({
    items,
    compact,
    compactLabel = 'Companies',
    entityName,
}: Props) {
    const [sortField, setSortField] = useState<SortField>('positions');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [inputValue, setInputValue] = useState('');
    const [search, setSearch] = useState('');
    const debounceRef = useRef(0);

    function toggleSort(field: SortField) {
        if (sortField === field) {
            setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    }

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        const list = q
            ? items.filter((it) => it.name.toLowerCase().includes(q))
            : items;
        const dir = sortDir === 'desc' ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sortField === 'companies')
                return ((b.company_count ?? 0) - (a.company_count ?? 0)) * dir;
            if (sortField === 'total')
                return (b.total_positions - a.total_positions) * dir;
            return (b.english_positions - a.english_positions) * dir;
        });
    }, [items, search, sortField, sortDir]);

    const labelBase =
        'text-[0.6rem] sm:text-[0.7rem] md:text-xs font-semibold tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors select-none inline-flex items-center';
    const labelActive = `${labelBase} text-gray-900`;
    const labelInactive = `${labelBase} text-gray-500 hover:text-gray-700`;

    const entityLabel = entityName ?? (compact ? 'country' : 'company');
    const hasResults = filtered.length > 0;
    const gridCols = compact ? compactGridCols : fullGridCols;

    return (
        <div class="w-full">
            <style>{`
                .dg-subgrid {
                    display: grid;
                    grid-template-columns: subgrid;
                    grid-column: 1 / -1;
                }
            `}</style>
            <ul
                class="w-full hover-hl-list"
                style={{ display: 'grid', gridTemplateColumns: gridCols }}
            >
                <SizingRow items={items} compact={compact} />

                {/* Header — subgrid row; label cells use absolute positioning so they don't inflate column widths */}
                <li
                    class="border-b border-gray-200 dg-subgrid"
                    style={{ alignItems: 'center' }}
                >
                    <div class="flex items-center pr-2 sm:pr-4 md:pr-8 xl:pr-12 py-1.5">
                        <div class="relative flex-1 max-w-40 sm:max-w-48 md:max-w-56 mr-3 sm:mr-4 shrink-0">
                            <svg
                                class="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 pointer-events-none"
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
                                aria-label={`Search ${entityLabel === 'country' ? 'countries' : 'companies'}`}
                                placeholder={`Search ${entityLabel === 'country' ? 'countries' : 'companies'}...`}
                                value={inputValue}
                                onInput={(e) => {
                                    const val = (e.target as HTMLInputElement)
                                        .value;
                                    setInputValue(val);
                                    clearTimeout(debounceRef.current);
                                    debounceRef.current = window.setTimeout(
                                        () => {
                                            setSearch(val);
                                        },
                                        200,
                                    );
                                }}
                                class={`w-full pl-5 sm:pl-6 ${inputValue ? 'pr-5 sm:pr-6' : 'pr-1'} py-1 text-xs sm:text-sm outline-none bg-transparent`}
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
                                    class="absolute right-0 sm:right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
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
                    </div>

                    {compact ? (
                        <>
                            <div class="relative overflow-visible">
                                <button
                                    onClick={() => toggleSort('companies')}
                                    class={`absolute right-0 top-1/2 -translate-y-1/2 ${
                                        sortField === 'companies'
                                            ? labelActive
                                            : labelInactive
                                    }`}
                                    style={numFont}
                                >
                                    {compactLabel}
                                    <SortArrow
                                        dir={
                                            sortField === 'companies'
                                                ? sortDir
                                                : 'desc'
                                        }
                                        active={sortField === 'companies'}
                                    />
                                </button>
                            </div>
                            <div class="relative overflow-visible">
                                <button
                                    onClick={() => toggleSort('positions')}
                                    class={`absolute right-0 top-1/2 -translate-y-1/2 ${
                                        sortField === 'positions'
                                            ? labelActive
                                            : labelInactive
                                    }`}
                                    style={numFont}
                                >
                                    Positions
                                    <SortArrow
                                        dir={
                                            sortField === 'positions'
                                                ? sortDir
                                                : 'desc'
                                        }
                                        active={sortField === 'positions'}
                                    />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div class="relative overflow-visible">
                            <button
                                onClick={() => toggleSort('positions')}
                                class={`absolute right-0 top-1/2 -translate-y-1/2 ${
                                    sortField === 'positions'
                                        ? labelActive
                                        : labelInactive
                                }`}
                                style={numFont}
                            >
                                Positions
                                <SortArrow
                                    dir={
                                        sortField === 'positions'
                                            ? sortDir
                                            : 'desc'
                                    }
                                    active={sortField === 'positions'}
                                />
                            </button>
                        </div>
                    )}

                    <div />
                </li>

                {hasResults &&
                    filtered.map((c) => (
                        <GridRow key={c.id} item={c} compact={compact} />
                    ))}
            </ul>

            {/* Empty state — outside grid, never affects columns */}
            {!hasResults && (
                <div class="py-10 text-center text-gray-500">
                    <p class="text-base sm:text-lg mb-1.5" style={numFont}>
                        No {entityLabel} found matching "{inputValue}"
                    </p>
                    <p class="text-sm text-gray-500">
                        {entityLabel === 'country'
                            ? "This country hasn't been added yet — we're expanding regularly."
                            : "This company isn't tracked here yet. Check back soon."}
                    </p>
                </div>
            )}
        </div>
    );
}
