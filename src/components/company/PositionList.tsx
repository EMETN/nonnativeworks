import { useState, useMemo } from 'preact/hooks';
import type { PositionDetail } from '../../lib/types';

interface Props {
  positions: PositionDetail[];
  careerPageUrl: string | null;
}

const numFont = { fontFamily: "'Inter', sans-serif" };

function PositionRow({ pos }: { pos: PositionDetail }) {
  return (
    <li class="border-b border-gray-100 py-3 px-0 sm:px-4 hover:bg-gray-50 transition-colors">
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          {pos.url ? (
            <a
              href={pos.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-sm sm:text-base text-gray-900 hover:text-[#002EA2] hover:underline font-medium"
            >
              {pos.title}
            </a>
          ) : (
            <span class="text-sm sm:text-base text-gray-900 font-medium">{pos.title}</span>
          )}
          {pos.local_language_advantage && (
            <span class="ml-2 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              Local language advantage
            </span>
          )}
          {pos.city && pos.city.length > 0 && (
            <div class="text-xs text-gray-400 mt-0.5">{pos.city.join(', ')}</div>
          )}
        </div>
        <span class="text-xs text-gray-400 whitespace-nowrap mt-0.5">{pos.category_name}</span>
      </div>
    </li>
  );
}

export default function PositionList({ positions, careerPageUrl }: Props) {
  const [search, setSearch] = useState('');

  const nonNativePositions = useMemo(
    () => positions.filter((p) => !p.requires_native_language),
    [positions]
  );

  const searchQuery = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!searchQuery) return nonNativePositions;
    return nonNativePositions.filter(
      (p) =>
        p.title.toLowerCase().includes(searchQuery) ||
        p.category_name.toLowerCase().includes(searchQuery)
    );
  }, [nonNativePositions, searchQuery]);

  const categories = useMemo(() => {
    const cats = [...new Set(filtered.map((p) => p.category_name))].sort();
    return cats;
  }, [filtered]);

  return (
    <div>
      {/* Search */}
      <div class="mb-6 relative w-full sm:w-80">
        <input
          type="text"
          placeholder="Search positions, categories…"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          class="w-full text-sm border-b border-gray-200 bg-transparent px-1 py-2 pr-7 focus:outline-none focus:border-[#1A4DB8] transition-colors"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Categories summary */}
      {categories.length > 0 && (
        <div class="flex flex-wrap gap-1.5 mb-4">
          {categories.map((cat) => {
            const count = filtered.filter((p) => p.category_name === cat).length;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSearch(cat)}
                class="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-500 hover:border-[#002EA2] hover:text-[#002EA2] transition-colors cursor-pointer"
              >
                {cat} <span class="font-bold" style={numFont}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Position list */}
      <ul class="border-t border-gray-200">
        {filtered.length === 0 ? (
          <li class="py-8 text-center text-gray-400 text-sm">
            No positions match your search.
          </li>
        ) : (
          filtered.map((pos) => <PositionRow key={pos.id} pos={pos} />)
        )}
      </ul>

      {/* Footer */}
      <div class="mt-3 flex items-center justify-between">
        <span class="text-xs text-gray-400" style={numFont}>
          {filtered.length} of {nonNativePositions.length} non-native positions
        </span>
        {careerPageUrl && (
          <a
            href={careerPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-[#002EA2] hover:text-[#001C6A] hover:underline font-medium"
          >
            See all positions ↗
          </a>
        )}
      </div>
    </div>
  );
}
