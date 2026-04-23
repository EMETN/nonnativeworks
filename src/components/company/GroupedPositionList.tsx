import { useState, useMemo } from 'preact/hooks';
import type { PositionDetail } from '../../lib/types';

interface CountryGroup {
  country_name: string;
  country_slug: string;
  country_code: string;
  positions: PositionDetail[];
}

interface Props {
  groups: CountryGroup[];
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
        opacity: faded ? 0.4 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      <div class="min-w-0 flex-1">
        <span
          class="text-sm sm:text-lg md:text-xl font-semibold text-gray-900 leading-tight"
          style={numFont}
        >
          {pos.title}
        </span>
        {pos.local_language_advantage && (
          <div class="sm:inline">
            <span class="text-[0.6rem] sm:text-xs text-amber-600 bg-amber-50 px-1 sm:px-1.5 py-0.5 rounded font-medium whitespace-nowrap sm:ml-2">
              Local language advantage
            </span>
          </div>
        )}
        {(pos.work_model || (pos.city && pos.city.length > 0)) && (
          <div class="text-[0.6rem] sm:text-xs text-gray-400 mt-0.5" style={numFont}>
            {pos.work_model && (
              <span class="capitalize mr-1">{pos.work_model}</span>
            )}
            {pos.work_model && pos.city && pos.city.length > 0 && '· '}
            {pos.city && pos.city.length > 0 && pos.city.join(', ')}
          </div>
        )}
      </div>
      <div class="flex items-center gap-2 sm:gap-4 shrink-0">
        <span class="text-[0.6rem] sm:text-xs font-semibold tracking-wider uppercase text-gray-400" style={numFont}>
          {pos.category_name}
        </span>
        <svg class="w-3 h-3 sm:w-5 sm:h-5 text-gray-300" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5}>
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
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
          class="no-underline block rounded-lg"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </li>
  );
}

export default function GroupedPositionList({ groups, careerPageUrl }: Props) {
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const allNonNative = useMemo(
    () => groups.map((g) => ({
      ...g,
      positions: g.positions.filter((p) => !p.requires_native_language),
    })).filter((g) => g.positions.length > 0),
    [groups]
  );

  const searchQuery = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    let result = selectedCountry === 'all'
      ? allNonNative
      : allNonNative.filter((g) => g.country_slug === selectedCountry);

    if (searchQuery) {
      result = result.map((g) => ({
        ...g,
        positions: g.positions.filter(
          (p) =>
            p.title.toLowerCase().includes(searchQuery) ||
            p.category_name.toLowerCase().includes(searchQuery)
        ),
      })).filter((g) => g.positions.length > 0);
    }

    return result;
  }, [allNonNative, selectedCountry, searchQuery]);

  const totalFiltered = filtered.reduce((s, g) => s + g.positions.length, 0);
  const totalAll = allNonNative.reduce((s, g) => s + g.positions.length, 0);

  return (
    <div>
      {/* Controls */}
      <div class="w-full border-b border-gray-200 flex items-center py-1.5">
        <div class="relative flex-1 max-w-40 sm:max-w-48 md:max-w-56 mr-3 sm:mr-4 shrink-0">
          <svg
            class="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 pointer-events-none"
            width="16" height="16"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            class={`w-full pl-5 sm:pl-6 ${search ? 'pr-5 sm:pr-6' : 'pr-1'} py-1 text-xs sm:text-sm outline-none bg-transparent`}
            style={numFont}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              class="absolute right-0 sm:right-1 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2.5}>
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {allNonNative.length > 1 && (
          <div class="relative">
            <select
              value={selectedCountry}
              onChange={(e) => {
                const val = (e.target as HTMLSelectElement).value;
                setSelectedCountry(val);
                if (val === 'all') {
                  setCollapsed(new Set());
                } else {
                  const others = new Set(allNonNative.map((g) => g.country_slug).filter((s) => s !== val));
                  setCollapsed(others);
                }
              }}
              class="text-[0.6rem] sm:text-[0.7rem] md:text-xs font-semibold tracking-wider uppercase text-gray-900 bg-transparent pl-0 pr-4 sm:pr-5 py-1 border-none outline-none cursor-pointer appearance-none transition-colors"
              style={numFont}
            >
              <option value="all">All countries</option>
              {allNonNative.map((g) => (
                <option key={g.country_slug} value={g.country_slug}>
                  {g.country_name} ({g.positions.length})
                </option>
              ))}
            </select>
            <svg
              class="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 sm:w-2.5 sm:h-2.5 text-gray-900 pointer-events-none"
              width="10" height="10"
              fill="none" viewBox="0 0 10 6" stroke="currentColor" stroke-width={2}
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M1 1l4 4 4-4" />
            </svg>
          </div>
        )}
      </div>

      {/* Grouped position lists */}
      {filtered.length === 0 ? (
        <div class="py-12 text-center text-gray-400">
          {searchQuery ? (
            <>
              <p class="text-base sm:text-lg mb-1.5" style={numFont}>
                No positions found matching "{search}"
              </p>
              <p class="text-sm text-gray-300">Try a different search term.</p>
            </>
          ) : (
            <p class="text-base sm:text-lg" style={numFont}>
              No English-friendly positions available right now.
            </p>
          )}
        </div>
      ) : (
        filtered.map((group) => {
          const isCollapsed = collapsed.has(group.country_slug);
          return (
            <div key={group.country_slug}>
              <button
                type="button"
                onClick={() => {
                  const next = new Set(collapsed);
                  if (isCollapsed) next.delete(group.country_slug);
                  else next.add(group.country_slug);
                  setCollapsed(next);
                }}
                class="w-full flex items-center gap-2.5 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 mt-2 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
              >
                <svg
                  class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 shrink-0 transition-transform"
                  style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={2}
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <img
                  src={`/flags/${group.country_code.toLowerCase()}.png`}
                  alt=""
                  class="h-[0.7rem] sm:h-[0.85rem] md:h-[1rem] w-auto shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
                />
                <span
                  class="text-xs sm:text-sm md:text-base font-semibold text-gray-900"
                  style={numFont}
                >
                  {group.country_name}
                </span>
                <span class="text-xs sm:text-sm text-gray-400" style={numFont}>
                  {group.positions.length}
                </span>
              </button>
              {!isCollapsed && (
                <ul>
                  {group.positions.map((pos) => (
                    <PositionRow
                      key={pos.id}
                      pos={pos}
                      faded={hoveredId !== null && hoveredId !== pos.id}
                      onEnter={() => setHoveredId(pos.id)}
                      onLeave={() => setHoveredId(null)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })
      )}

      {/* Footer */}
      <div class="mt-4 flex items-center justify-between">
        <span class="text-[0.6rem] sm:text-xs text-gray-400 font-semibold tracking-wider uppercase" style={numFont}>
          {totalFiltered} of {totalAll} positions
        </span>
        {careerPageUrl && (
          <a
            href={careerPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs sm:text-sm text-[#0F7A4F] hover:text-[#084A2F] font-semibold"
            style={numFont}
          >
            All positions ↗
          </a>
        )}
      </div>
    </div>
  );
}
