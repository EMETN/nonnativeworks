import { useState, useMemo } from 'preact/hooks';
import type { PositionDetail } from '../../lib/types';

interface Props {
    positions: PositionDetail[];
    careerPageUrl: string | null;
}

const numFont = { fontFamily: "'Inter', 'Inter Fallback', sans-serif" };

function PositionRow({
    pos,
    faded,
    onEnter,
    onLeave,
}: {
    pos: PositionDetail;
    faded: boolean;
    onEnter: () => void;
    onLeave: () => void;
}) {
    const inner = (
        <div
            class="flex items-center justify-between gap-4 py-3 sm:py-5 md:py-6"
            style={{
                opacity: faded ? 0.12 : 1,
                transition: 'opacity 0.3s',
            }}
        >
            <div class="min-w-0 flex-1">
                <span
                    class="text-base sm:text-lg md:text-xl font-semibold text-gray-900 leading-tight line-clamp-2"
                    style={numFont}
                >
                    {pos.title}
                </span>
                {pos.local_language_advantage && (
                    <div class="leading-none" style={numFont}>
                        <span class="text-xs sm:text-sm text-amber-600 font-medium">
                            Local language advantage
                        </span>
                    </div>
                )}
                {(pos.work_model || (pos.city && pos.city.length > 0)) && (
                    <div
                        class="text-xs sm:text-sm text-gray-400 mt-1.5"
                        style={numFont}
                    >
                        {pos.work_model && (
                            <span class="capitalize mr-1">
                                {pos.work_model}
                            </span>
                        )}
                        {pos.work_model &&
                            pos.city &&
                            pos.city.length > 0 &&
                            '· '}
                        {pos.city && pos.city.length > 1
                            ? 'Multiple locations'
                            : pos.city && pos.city.length === 1 && pos.city[0]}
                    </div>
                )}
            </div>
            <div class="flex items-center gap-2 sm:gap-4 shrink-0">
                <span
                    class="text-[0.65rem] sm:text-xs font-semibold tracking-wider uppercase text-gray-400 max-w-24 sm:max-w-none text-right line-clamp-2"
                    style={numFont}
                >
                    {pos.category_name}
                </span>
                <svg
                    class="w-4 h-4 sm:w-[1.125rem] sm:h-[1.125rem] md:w-5 md:h-5 text-gray-400"
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
        <li
            class="border-b border-gray-100"
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
        >
            {pos.url ? (
                <a
                    href={pos.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="no-underline block"
                >
                    {inner}
                </a>
            ) : (
                inner
            )}
        </li>
    );
}

export default function PositionList({ positions, careerPageUrl }: Props) {
    const [search, setSearch] = useState('');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const nonNativePositions = useMemo(
        () => positions.filter((p) => !p.requires_native_language),
        [positions],
    );

    const searchQuery = search.trim().toLowerCase();

    const filtered = useMemo(() => {
        if (!searchQuery) return nonNativePositions;
        return nonNativePositions.filter(
            (p) =>
                p.title.toLowerCase().includes(searchQuery) ||
                p.category_name.toLowerCase().includes(searchQuery) ||
                (p.work_model &&
                    p.work_model.toLowerCase().includes(searchQuery)) ||
                (p.city &&
                    p.city.some((c) => c.toLowerCase().includes(searchQuery))),
        );
    }, [nonNativePositions, searchQuery]);

    return (
        <div>
            {/* Search */}
            <div class="w-full border-b border-gray-200 pb-2 mb-2">
                <div class="relative w-full sm:w-56 md:w-64">
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
                        aria-label="Search positions"
                        placeholder="Search..."
                        value={search}
                        onInput={(e) =>
                            setSearch((e.target as HTMLInputElement).value)
                        }
                        class={`w-full text-xs sm:text-sm bg-transparent pl-5 sm:pl-6 ${search ? 'pr-6' : 'pr-1'} py-1 outline-none`}
                        style={numFont}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
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

            {/* Position list */}
            <ul>
                {filtered.length === 0 ? (
                    <li class="py-12 text-center text-gray-400">
                        {searchQuery ? (
                            <>
                                <p
                                    class="text-base sm:text-lg mb-1.5"
                                    style={numFont}
                                >
                                    No positions found matching "{search}"
                                </p>
                                <p class="text-sm text-gray-400">
                                    Try a different search term.
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
                    filtered.map((pos) => (
                        <PositionRow
                            key={pos.id}
                            pos={pos}
                            faded={hoveredId !== null && hoveredId !== pos.id}
                            onEnter={() => setHoveredId(pos.id)}
                            onLeave={() => setHoveredId(null)}
                        />
                    ))
                )}
            </ul>

            {/* Footer */}
            <div class="mt-4 flex items-center justify-between">
                <span
                    class="text-[0.6rem] sm:text-xs text-gray-400 font-semibold tracking-wider uppercase"
                    style={numFont}
                >
                    {filtered.length} of {nonNativePositions.length} positions
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
                        <svg class="w-4 h-4 sm:w-[1.125rem] sm:h-[1.125rem] md:w-5 md:h-5 inline-block ml-1" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5}><path stroke-linecap="round" stroke-linejoin="round" d="M10.0002 5H8.2002C7.08009 5 6.51962 5 6.0918 5.21799C5.71547 5.40973 5.40973 5.71547 5.21799 6.0918C5 6.51962 5 7.08009 5 8.2002V15.8002C5 16.9203 5 17.4801 5.21799 17.9079C5.40973 18.2842 5.71547 18.5905 6.0918 18.7822C6.5192 19 7.07899 19 8.19691 19H15.8031C16.921 19 17.48 19 17.9074 18.7822C18.2837 18.5905 18.5905 18.2839 18.7822 17.9076C19 17.4802 19 16.921 19 15.8031V14M20 9V4M20 4H15M20 4L13 11" /></svg>
                    </a>
                )}
            </div>
        </div>
    );
}
