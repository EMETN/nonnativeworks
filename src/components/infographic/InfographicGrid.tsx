import { useSignal } from '@preact/signals';

interface CountryData {
    name: string;
    slug: string;
    code: string;
    flag_colors: string[];
    total_positions: number;
    english_positions: number;
    english_percentage: number;
    last_updated: string | null;
}

interface Props {
    countries: CountryData[];
}

type SortMode = 'recent' | 'positions' | 'percentage';

function formatNumber(n: number): string {
    return n.toLocaleString('en-US');
}

const numFont = { fontFamily: "'Inter', sans-serif" };

function CountryRow({
    country,
    isLast,
}: {
    country: CountryData;
    isLast: boolean;
}) {
    const pct = Math.round(country.english_percentage);
    const border = isLast ? '' : 'border-b border-gray-200';

    return (
        <li
            class={border}
            style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }}
        >
            <a
                href={`/${country.slug}`}
                class="group relative no-underline hover:bg-[#002EA2] transition-colors"
                style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }}
            >
                {/* Country name */}
                <div class="flex items-center py-4 md:py-8 pl-4 md:pl-8 pr-4 md:pr-12">
                    <div class="relative">
                        <span
                            class="text-base sm:text-2xl md:text-5xl font-bold text-gray-900 group-hover:text-white transition-colors whitespace-nowrap leading-none"
                            style={numFont}
                        >
                            {country.name}
                        </span>
                        {country.last_updated && (
                            <span
                                class="absolute top-full left-0 text-[0.45rem] sm:text-[0.55rem] md:text-xs text-gray-400 group-hover:text-[#809AD1] transition-colors whitespace-nowrap"
                                style={numFont}
                            >
                                Updated: {new Date(country.last_updated).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </span>
                        )}
                    </div>
                </div>

                {/* Non-native — right-aligned */}
                <div class="flex items-center justify-end py-4 md:py-8">
                    <div class="relative">
                        <span class="absolute bottom-full right-0 mb-[-2px] md:mb-0 text-[0.45rem] sm:text-[0.55rem] md:text-xs font-semibold tracking-wider uppercase text-[#002EA2] group-hover:text-white transition-colors whitespace-nowrap">
                            Non-native
                        </span>
                        <span
                            class="text-base sm:text-2xl md:text-5xl font-black text-[#002EA2] group-hover:text-white transition-colors leading-none"
                            style={numFont}
                        >
                            {formatNumber(country.english_positions)}
                        </span>
                    </div>
                </div>

                {/* Slash */}
                <div class="flex items-center justify-center py-4 md:py-8 px-0.5 md:px-2">
                    <span class="text-sm sm:text-xl md:text-4xl font-light text-gray-300 group-hover:text-[#99B3DB] transition-colors leading-none">
                        /
                    </span>
                </div>

                {/* Total — right-aligned */}
                <div class="flex items-center justify-end py-4 md:py-8">
                    <div class="relative">
                        <span class="absolute bottom-full right-0 mb-[-2px] md:mb-0 text-[0.45rem] sm:text-[0.55rem] md:text-xs font-semibold tracking-wider uppercase text-gray-900 group-hover:text-white transition-colors whitespace-nowrap">
                            Total
                        </span>
                        <span
                            class="text-base sm:text-2xl md:text-5xl font-black text-gray-900 group-hover:text-white transition-colors leading-none"
                            style={numFont}
                        >
                            {formatNumber(country.total_positions)}
                        </span>
                    </div>
                </div>

                {/* Percentage — right-aligned */}
                <div class="flex items-center justify-end py-4 md:py-8 pl-4 md:pl-12 pr-4 md:pr-8">
                    <span
                        class="text-base sm:text-2xl md:text-5xl font-black text-black group-hover:text-white transition-colors leading-none"
                        style={numFont}
                    >
                        {pct}%
                    </span>
                </div>

                {/* Arrow — absolute, centered between percentage and right edge */}
                <div class="absolute right-0 top-0 bottom-0 w-4 md:w-8 flex items-center justify-center">
                    <svg
                        class="w-4 h-4 md:w-5 md:h-5 text-gray-300 md:text-transparent group-hover:text-white transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width={2}
                    >
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                </div>
            </a>
        </li>
    );
}

export default function InfographicGrid({ countries }: Props) {
    const sort = useSignal<SortMode>('recent');

    const sorted = [...countries].sort((a, b) => {
        if (sort.value === 'recent') {
            const aTime = a.last_updated
                ? new Date(a.last_updated).getTime()
                : 0;
            const bTime = b.last_updated
                ? new Date(b.last_updated).getTime()
                : 0;
            return bTime - aTime;
        }
        if (sort.value === 'positions')
            return b.total_positions - a.total_positions;
        if (sort.value === 'percentage')
            return b.english_percentage - a.english_percentage;
        return 0;
    });

    const btnBase =
        'rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors';
    const btnActive = `${btnBase} bg-[#002EA2] text-white hover:bg-[#002383]`;
    const btnInactive = `${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`;

    return (
        <div class="w-full">
            <div class="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-8">
                <button
                    onClick={() => {
                        sort.value = 'recent';
                    }}
                    class={sort.value === 'recent' ? btnActive : btnInactive}
                >
                    <span class="sm:hidden">Updated</span><span class="hidden sm:inline">Recently updated</span>
                </button>
                <button
                    onClick={() => {
                        sort.value = 'positions';
                    }}
                    class={sort.value === 'positions' ? btnActive : btnInactive}
                >
                    <span class="sm:hidden">Positions</span><span class="hidden sm:inline">Most positions</span>
                </button>
                <button
                    onClick={() => {
                        sort.value = 'percentage';
                    }}
                    class={
                        sort.value === 'percentage' ? btnActive : btnInactive
                    }
                >
                    <span class="sm:hidden">Percentage</span><span class="hidden sm:inline">Best percentage</span>
                </button>
            </div>

            <ul
                class="w-full border-t border-gray-200"
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto' }}
            >
                {sorted.map((c, i) => (
                    <CountryRow
                        key={c.slug}
                        country={c}
                        isLast={i === sorted.length - 1}
                    />
                ))}
            </ul>
        </div>
    );
}
