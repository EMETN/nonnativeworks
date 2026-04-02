import { useSignal } from '@preact/signals';

export interface DataGridItem {
  id: string;
  name: string;
  href: string;
  englishBadge?: boolean;
  english_positions: number;
  total_positions: number;
  english_percentage: number;
  updated_at: string | null;
}

interface Props {
  items: DataGridItem[];
  compact?: boolean;
}

type SortMode = 'recent' | 'positions' | 'percentage';

function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

const numFont = { fontFamily: "'Inter', sans-serif" };

function GridRow({
  item,
  isLast,
  compact,
}: {
  item: DataGridItem;
  isLast: boolean;
  compact?: boolean;
}) {
  const pct = Math.round(item.english_percentage);
  const border = isLast ? '' : 'border-b border-gray-200';

  return (
    <li
      class={border}
      style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }}
    >
      <a
        href={item.href}
        class="group relative no-underline hover:bg-[#002EA2] transition-colors"
        style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1 / -1' }}
      >
        {/* Name */}
        <div class={`flex items-center py-4 md:py-8 ${compact ? 'pl-0 lg:pl-8' : 'pl-4 lg:pl-8'} pr-4 lg:pr-12`}>
          <div class="relative">
            <div class="flex items-center gap-1 sm:gap-2">
              <span
                class="text-base sm:text-2xl md:text-5xl font-bold text-gray-900 group-hover:text-white transition-colors whitespace-nowrap leading-none"
                style={numFont}
              >
                {item.name}
              </span>
              {item.englishBadge && (
                <span class="text-[0.5rem] sm:text-xs bg-[#CCd9ED] text-[#002383] group-hover:bg-white/20 group-hover:text-white px-1 sm:px-1.5 py-0.5 rounded font-semibold shrink-0">
                  EN
                </span>
              )}
            </div>
            {item.updated_at && (
              <span
                class="absolute top-full left-0 text-[0.45rem] sm:text-[0.55rem] md:text-xs text-gray-400 group-hover:text-[#809AD1] transition-colors whitespace-nowrap"
                style={numFont}
              >
                Updated: {formatDate(item.updated_at)}
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
              {formatNumber(item.english_positions)}
            </span>
          </div>
        </div>

        {/* Slash */}
        <div class="flex items-center justify-center py-4 md:py-8 px-3 md:px-5">
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
              {formatNumber(item.total_positions)}
            </span>
          </div>
        </div>

        {/* Percentage — right-aligned */}
        <div class="flex items-center justify-end py-4 md:py-8 pl-4 md:pl-12 pr-5 lg:pr-8">
          <span
            class="text-base sm:text-2xl md:text-5xl font-black text-black group-hover:text-white transition-colors leading-none"
            style={numFont}
          >
            {pct}%
          </span>
        </div>

        {/* Arrow */}
        <div class="absolute right-0 top-0 bottom-0 w-4 lg:w-8 flex items-center justify-center">
          <svg
            class="w-4 h-4 md:w-5 md:h-5 text-gray-300 group-hover:text-white transition-colors"
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

export default function DataGrid({ items, compact }: Props) {
  const sort = useSignal<SortMode>('recent');

  const sorted = [...items].sort((a, b) => {
    if (sort.value === 'recent') {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bTime - aTime;
    }
    if (sort.value === 'positions') return b.english_positions - a.english_positions;
    if (sort.value === 'percentage') return b.english_percentage - a.english_percentage;
    return 0;
  });

  const btnBase =
    'rounded-lg px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium transition-colors border border-[#002EA2] cursor-pointer';
  const btnActive = `${btnBase} bg-[#002EA2] text-white hover:bg-white hover:text-[#002EA2]`;
  const btnInactive = `${btnBase} bg-white text-[#002EA2] hover:bg-[#002EA2] hover:text-white`;

  return (
    <div class="w-full">
      <div class="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-8">
        <button
          onClick={() => { sort.value = 'recent'; }}
          class={sort.value === 'recent' ? btnActive : btnInactive}
        >
          <span class="sm:hidden">Updated</span><span class="hidden sm:inline">Recently updated</span>
        </button>
        <button
          onClick={() => { sort.value = 'positions'; }}
          class={sort.value === 'positions' ? btnActive : btnInactive}
        >
          <span class="sm:hidden">Positions</span><span class="hidden sm:inline">Most positions</span>
        </button>
        <button
          onClick={() => { sort.value = 'percentage'; }}
          class={sort.value === 'percentage' ? btnActive : btnInactive}
        >
          <span class="sm:hidden">Percentage</span><span class="hidden sm:inline">Best percentage</span>
        </button>
      </div>

      <ul
        class="w-full border-t border-gray-200"
        style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto' }}
      >
        {sorted.map((c, i) => (
          <GridRow
            key={c.id}
            item={c}
            isLast={i === sorted.length - 1}
            compact={compact}
          />
        ))}
      </ul>
    </div>
  );
}
