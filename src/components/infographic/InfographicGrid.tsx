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

function CountryRow({ country, isLast }: { country: CountryData; isLast: boolean }) {
  const pct = Math.round(country.english_percentage);
  const border = isLast ? '' : 'border-b border-gray-200';

  return (
    <a
      href={`/${country.slug}`}
      class="group contents no-underline"
    >
      {/* Country name */}
      <div class={`flex items-center py-4 md:py-8 pr-4 md:pr-12 ${border}`}>
        <span class="text-xs sm:text-base md:text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors" style={numFont}>
          {country.name}
        </span>
      </div>

      {/* Non-native — right-aligned */}
      <div class={`flex flex-col items-end justify-end py-4 md:py-8 ${border}`}>
        <span class="text-[0.45rem] sm:text-[0.55rem] md:text-xs font-semibold tracking-wider uppercase text-blue-600 mb-0.5">
          Non-native
        </span>
        <span class="text-base sm:text-2xl md:text-5xl font-bold text-blue-600 leading-none" style={numFont}>
          {formatNumber(country.english_positions)}
        </span>
      </div>

      {/* Slash */}
      <div class={`flex items-end justify-center py-4 md:py-8 px-0.5 md:px-2 ${border}`}>
        <span class="text-sm sm:text-xl md:text-4xl font-light text-gray-300 leading-none">/</span>
      </div>

      {/* Total — left-aligned */}
      <div class={`flex flex-col items-start justify-end py-4 md:py-8 ${border}`}>
        <span class="text-[0.45rem] sm:text-[0.55rem] md:text-xs font-semibold tracking-wider uppercase text-gray-900 mb-0.5">
          Total
        </span>
        <span class="text-base sm:text-2xl md:text-5xl font-bold text-gray-900 leading-none" style={numFont}>
          {formatNumber(country.total_positions)}
        </span>
      </div>

      {/* Percentage — right-aligned */}
      <div class={`flex flex-col items-end justify-end py-4 md:py-8 pl-2 md:pl-8 ${border}`}>
        <span class="text-[0.45rem] sm:text-[0.55rem] md:text-xs font-semibold tracking-wider uppercase text-gray-900 mb-0.5">
          Percentage
        </span>
        <span class="text-base sm:text-2xl md:text-5xl font-black text-gray-800 leading-none" style={numFont}>
          {pct}%
        </span>
      </div>
    </a>
  );
}

export default function InfographicGrid({ countries }: Props) {
  const sort = useSignal<SortMode>('recent');

  const sorted = [...countries].sort((a, b) => {
    if (sort.value === 'recent') {
      const aTime = a.last_updated ? new Date(a.last_updated).getTime() : 0;
      const bTime = b.last_updated ? new Date(b.last_updated).getTime() : 0;
      return bTime - aTime;
    }
    if (sort.value === 'positions') return b.total_positions - a.total_positions;
    if (sort.value === 'percentage') return b.english_percentage - a.english_percentage;
    return 0;
  });

  const btnBase = 'rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors';
  const btnActive = `${btnBase} bg-blue-600 text-white hover:bg-blue-700`;
  const btnInactive = `${btnBase} bg-gray-100 text-gray-600 hover:bg-gray-200`;

  return (
    <div class="flex flex-col items-center">
      <div class="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-8">
        <button
          onClick={() => { sort.value = 'recent'; }}
          class={sort.value === 'recent' ? btnActive : btnInactive}
        >
          Recently updated
        </button>
        <button
          onClick={() => { sort.value = 'positions'; }}
          class={sort.value === 'positions' ? btnActive : btnInactive}
        >
          Most positions
        </button>
        <button
          onClick={() => { sort.value = 'percentage'; }}
          class={sort.value === 'percentage' ? btnActive : btnInactive}
        >
          Highest % non-native language
        </button>
      </div>

      <div
        class="w-full sm:w-auto sm:inline-grid grid border-t border-gray-200"
        style={{ gridTemplateColumns: 'auto auto auto auto auto' }}
      >
        {sorted.map((c, i) => (
          <CountryRow key={c.slug} country={c} isLast={i === sorted.length - 1} />
        ))}
      </div>
    </div>
  );
}
