import { useSignal, useComputed } from '@preact/signals';
import { useRef, useEffect } from 'preact/hooks';

export interface DataGridItem {
    id: string;
    name: string;
    href: string;
    flag?: string;
    englishBadge?: boolean;
    english_positions: number;
    total_positions: number;
    english_percentage: number;
    updated_at: string | null;
    company_count?: number;
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
        <li
            aria-hidden="true"
            class="h-0 overflow-hidden invisible dg-subgrid"
        >
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
                            class={`${ss} font-light text-gray-300`}
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
                        class={`${ss} font-light text-gray-300`}
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

function GridRow({
    item,
    isLast,
    faded,
    compact,
    onEnter,
    onLeave,
}: {
    item: DataGridItem;
    isLast: boolean;
    faded: boolean;
    compact?: boolean;
    onEnter: () => void;
    onLeave: () => void;
}) {
    const nameRef = useRef<HTMLDivElement>(null);
    const isOverflowing = useSignal(false);
    const isSmall = useSignal(false);

    useEffect(() => {
        const el = nameRef.current;
        if (!el) return;
        const check = () => {
            isOverflowing.value = el.scrollWidth > el.clientWidth;
        };
        check();
        const ro = new ResizeObserver(check);
        ro.observe(el);

        const mq = window.matchMedia('(max-width: 639px)');
        isSmall.value = mq.matches;
        const onMq = (e: MediaQueryListEvent) => { isSmall.value = e.matches; };
        mq.addEventListener('change', onMq);

        return () => { ro.disconnect(); mq.removeEventListener('change', onMq); };
    }, []);

    const fadeMask =
        'linear-gradient(to right, black calc(100% - 4rem), transparent)';
    const textSize = 'text-xl md:text-lg lg:text-2xl';
    const slashSize = 'text-sm md:text-xs lg:text-base';
    const totalSize = 'text-sm md:text-xs lg:text-base';
    const arrowSize = 'w-4 h-4 md:w-3.5 md:h-3.5 lg:w-5 lg:h-5';
    const rowPy = 'py-3.5 sm:py-4';

    return (
        <li
            class="border-b border-gray-100 dg-subgrid"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            <a
                href={item.href}
                data-astro-prefetch
                class="no-underline rounded-lg dg-subgrid"
                style={{
                    opacity: faded ? 0.4 : 1,
                    transition: 'opacity 0.3s',
                }}
            >
                <div
                    class={`flex items-center ${rowPy} pr-2 sm:pr-4 md:pr-8 xl:pr-12 overflow-hidden min-w-0`}
                >
                    <div
                        ref={nameRef}
                        class="flex items-center gap-2 sm:gap-3 md:gap-4 overflow-hidden min-w-0"
                        style={
                            isOverflowing.value && !isSmall.value
                                ? {
                                      maskImage: fadeMask,
                                      WebkitMaskImage: fadeMask,
                                  }
                                : undefined
                        }
                    >
                        {item.flag && (
                            <span class="inline-flex items-center justify-center shrink-0 w-[1.875rem] md:w-[1.6875rem] lg:w-[2.25rem]">
                                <img
                                    src={item.flag}
                                    alt=""
                                    class="w-auto shadow-[0_1px_3px_rgba(0,0,0,0.15)] h-[1.25rem] md:h-[1.125rem] lg:h-[1.5rem]"
                                />
                            </span>
                        )}
                        <span
                            class={`${textSize} font-semibold text-gray-900 leading-tight tracking-tight ${isSmall.value ? 'truncate' : 'whitespace-nowrap'}`}
                            style={numFont}
                        >
                            {item.name}
                        </span>
                        {item.englishBadge && (
                            <span class="text-[0.4rem] sm:text-xs bg-[#C2E0D1] text-[#0B5E3C] px-0.5 sm:px-1.5 py-0.5 rounded font-semibold shrink-0">
                                EN
                            </span>
                        )}
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
                        >
                            <span
                                class={`${textSize} font-semibold text-[#0F7A4F] leading-none tabular-nums`}
                                style={numFont}
                            >
                                {formatNumber(item.english_positions)}
                            </span>
                            <span
                                class={`${slashSize} font-light text-gray-300 leading-none`}
                                style={numFont}
                            >
                                /
                            </span>
                            <span
                                class={`${totalSize} font-semibold text-gray-300 leading-none tabular-nums`}
                                style={numFont}
                            >
                                {formatNumber(item.total_positions)}
                            </span>
                        </div>
                    </>
                ) : (
                    <div
                        class={`flex items-center justify-end gap-0.5 sm:gap-1 ${rowPy} pr-2.5 sm:pr-3 md:pr-4 pl-2 sm:pl-4 md:pl-6`}
                    >
                        <span
                            class={`${textSize} font-semibold text-[#0F7A4F] leading-none tabular-nums`}
                            style={numFont}
                        >
                            {formatNumber(item.english_positions)}
                        </span>
                        <span
                            class={`${slashSize} font-light text-gray-300 leading-none`}
                            style={numFont}
                        >
                            /
                        </span>
                        <span
                            class={`${totalSize} font-semibold text-gray-300 leading-none tabular-nums`}
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
                        class={`${arrowSize} text-gray-300`}
                        width="12"
                        height="12"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width={1.5}
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M9 5l7 7-7 7"
                        />
                    </svg>
                </div>
            </a>
        </li>
    );
}

export default function DataGrid({ items, compact, compactLabel = 'Companies', entityName }: Props) {
    const sortField = useSignal<SortField>('positions');
    const sortDir = useSignal<SortDir>('desc');
    const search = useSignal('');
    const hoveredId = useSignal<string | null>(null);
    const canHover = useSignal(false);

    useEffect(() => {
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        canHover.value = mq.matches;
        const onChange = (e: MediaQueryListEvent) => {
            canHover.value = e.matches;
        };
        mq.addEventListener('change', onChange);
        const onPageShow = () => {
            hoveredId.value = null;
        };
        window.addEventListener('pageshow', onPageShow);
        return () => {
            mq.removeEventListener('change', onChange);
            window.removeEventListener('pageshow', onPageShow);
        };
    }, []);

    function toggleSort(field: SortField) {
        if (sortField.value === field) {
            sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc';
        } else {
            sortField.value = field;
            sortDir.value = 'desc';
        }
    }

    const filtered = useComputed(() => {
        const q = search.value.toLowerCase().trim();
        const list = q
            ? items.filter((it) => it.name.toLowerCase().includes(q))
            : items;
        const dir = sortDir.value === 'desc' ? 1 : -1;
        return [...list].sort((a, b) => {
            if (sortField.value === 'companies')
                return ((b.company_count ?? 0) - (a.company_count ?? 0)) * dir;
            if (sortField.value === 'total')
                return (b.total_positions - a.total_positions) * dir;
            return (b.english_positions - a.english_positions) * dir;
        });
    });

    const labelBase =
        'text-[0.6rem] sm:text-[0.7rem] md:text-xs font-semibold tracking-wider uppercase whitespace-nowrap cursor-pointer transition-colors select-none inline-flex items-center';
    const labelActive = `${labelBase} text-gray-900`;
    const labelInactive = `${labelBase} text-gray-400 hover:text-gray-500`;

    const entityLabel = entityName ?? (compact ? 'country' : 'company');
    const hasResults = filtered.value.length > 0;
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
                class="w-full"
                style={{ display: 'grid', gridTemplateColumns: gridCols }}
            >
                <SizingRow items={items} compact={compact} />

                {/* Header — subgrid row; label cells use absolute positioning so they don't inflate column widths */}
                <li class="border-b border-gray-200 dg-subgrid" style={{ alignItems: 'center' }}>
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
                                placeholder="Search..."
                                value={search.value}
                                onInput={(e) => {
                                    search.value = (
                                        e.target as HTMLInputElement
                                    ).value;
                                }}
                                class={`w-full pl-5 sm:pl-6 ${search.value ? 'pr-5 sm:pr-6' : 'pr-1'} py-1 text-xs sm:text-sm outline-none bg-transparent`}
                                style={numFont}
                            />
                            {search.value && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        search.value = '';
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
                                        sortField.value === 'companies'
                                            ? labelActive
                                            : labelInactive
                                    }`}
                                    style={numFont}
                                >
                                    {compactLabel}
                                    <SortArrow
                                        dir={
                                            sortField.value === 'companies'
                                                ? sortDir.value
                                                : 'desc'
                                        }
                                        active={sortField.value === 'companies'}
                                    />
                                </button>
                            </div>
                            <div class="relative overflow-visible">
                                <button
                                    onClick={() => toggleSort('positions')}
                                    class={`absolute right-0 top-1/2 -translate-y-1/2 ${
                                        sortField.value === 'positions'
                                            ? labelActive
                                            : labelInactive
                                    }`}
                                    style={numFont}
                                >
                                    Positions
                                    <SortArrow
                                        dir={
                                            sortField.value === 'positions'
                                                ? sortDir.value
                                                : 'desc'
                                        }
                                        active={sortField.value === 'positions'}
                                    />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div class="relative overflow-visible">
                            <button
                                onClick={() => toggleSort('positions')}
                                class={`absolute right-0 top-1/2 -translate-y-1/2 ${
                                    sortField.value === 'positions'
                                        ? labelActive
                                        : labelInactive
                                }`}
                                style={numFont}
                            >
                                Positions
                                <SortArrow
                                    dir={
                                        sortField.value === 'positions'
                                            ? sortDir.value
                                            : 'desc'
                                    }
                                    active={sortField.value === 'positions'}
                                />
                            </button>
                        </div>
                    )}

                    <div />
                </li>

                {hasResults &&
                    filtered.value.map((c, i) => (
                        <GridRow
                            key={c.id}
                            item={c}
                            isLast={i === filtered.value.length - 1}
                            compact={compact}
                            faded={
                                canHover.value &&
                                hoveredId.value !== null &&
                                hoveredId.value !== c.id
                            }
                            onEnter={() => {
                                if (canHover.value) hoveredId.value = c.id;
                            }}
                            onLeave={() => {
                                hoveredId.value = null;
                            }}
                        />
                    ))}
            </ul>

            {/* Empty state — outside grid, never affects columns */}
            {!hasResults && (
                <div class="py-20 text-center text-gray-400">
                    <p class="text-base sm:text-lg mb-1.5" style={numFont}>
                        No {entityLabel} found matching "{search.value}"
                    </p>
                    <p class="text-sm text-gray-400">
                        {compact
                            ? "This country hasn't been added yet — we're expanding regularly."
                            : "This company isn't tracked here yet. Check back soon."}
                    </p>
                </div>
            )}
        </div>
    );
}
