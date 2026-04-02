import { useState, useMemo } from 'preact/hooks';
import type { CompanyStats, PositionDetail } from '../../lib/types';
import { nameToSlug } from '../../lib/country-flags';

type SortKey = 'name' | 'total_positions' | 'english_positions' | 'english_percentage';
type SortDir = 'asc' | 'desc';

interface Props {
  companies: CompanyStats[];
  positions: PositionDetail[];
  countrySlug: string;
}

const numFont = { fontFamily: "'Inter', sans-serif" };

function PercentageBadge({ value }: { value: number }) {
  const color =
    value >= 60 ? 'text-green-600'
    : value >= 30 ? 'text-amber-500'
    : 'text-[#FF0000]';
  return (
    <span class={`font-bold ${color}`} style={numFont}>
      {value}%
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span class="ml-1 text-gray-300">↕</span>;
  return <span class="ml-1 text-[#002EA2]">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function PositionRow({ pos }: { pos: PositionDetail }) {
  return (
    <tr class="border-t border-gray-100 bg-gray-100/60">
      <td class="pl-10 pr-4 py-2 text-sm text-gray-700" colSpan={5}>
        <div class="flex items-center gap-2 flex-wrap">
          {pos.url ? (
            <a
              href={pos.url}
              target="_blank"
              rel="noopener noreferrer"
              class="hover:underline hover:text-[#002EA2] text-gray-800"
            >
              {pos.title}
            </a>
          ) : (
            <span>{pos.title}</span>
          )}
          <span class="text-xs text-gray-400">{pos.category_name}</span>
        </div>
      </td>
    </tr>
  );
}

function SeeAllRow({ url }: { url: string }) {
  return (
    <tr class="border-t border-gray-100 bg-gray-100/60">
      <td class="pl-10 pr-4 py-2" colSpan={5}>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm text-[#002EA2] hover:text-[#001C6A] hover:underline font-medium"
        >
          See all positions ↗
        </a>
      </td>
    </tr>
  );
}

export default function CompanyTable({ companies, positions, countrySlug }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('english_percentage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const positionsByCompany = useMemo(() => {
    const map = new Map<string, PositionDetail[]>();
    for (const p of positions) {
      if (p.requires_native_language) continue;
      const arr = map.get(p.company_id) ?? [];
      arr.push(p);
      map.set(p.company_id, arr);
    }
    return map;
  }, [positions]);

  const categoriesByCompany = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [companyId, pos] of positionsByCompany) {
      const cats = [...new Set(pos.map((p) => p.category_name))].sort();
      map.set(companyId, cats);
    }
    return map;
  }, [positionsByCompany]);

  function toggleExpand(companyId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const searchQuery = search.trim().toLowerCase();

  const filteredPositionsByCompany = useMemo(() => {
    if (!searchQuery) return positionsByCompany;
    const map = new Map<string, PositionDetail[]>();
    for (const [companyId, pos] of positionsByCompany) {
      const matched = pos.filter(
        (p) => p.title.toLowerCase().includes(searchQuery) || p.category_name.toLowerCase().includes(searchQuery)
      );
      if (matched.length > 0) map.set(companyId, matched);
    }
    return map;
  }, [searchQuery, positionsByCompany]);

  const filtered = useMemo(() => {
    if (!searchQuery) return companies;
    return companies.filter((c) => {
      if (c.name.toLowerCase().includes(searchQuery)) return true;
      return filteredPositionsByCompany.has(c.company_id);
    });
  }, [companies, searchQuery, filteredPositionsByCompany]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === 'string' && typeof bv === 'string'
          ? av.localeCompare(bv)
          : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const cols: { key: SortKey; label: string; align: string }[] = [
    { key: 'name',               label: 'Company',     align: 'text-left'  },
    { key: 'english_positions',  label: 'Non-native',  align: 'text-center whitespace-nowrap' },
    { key: 'total_positions',    label: 'Total',       align: 'text-center' },
    { key: 'english_percentage', label: '%',            align: 'text-center' },
  ];

  return (
    <div class="mb-8">
      {/* Search */}
      <div class="mb-4 relative w-full sm:w-80">
        <input
          type="text"
          placeholder="Search companies, positions, categories…"
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

      {/* Table */}
      <div class="overflow-x-auto">
        <table class="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: '750px' }}>
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '34%' }} />
          </colgroup>
          <thead>
            <tr class="border-b border-gray-200">
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  class={`px-4 py-3 font-semibold text-xs tracking-wider uppercase text-gray-400 cursor-pointer select-none hover:text-gray-900 transition-colors ${col.align}`}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
              <th class="px-4 py-3 font-semibold text-xs tracking-wider uppercase text-gray-400 text-left">Categories</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} class="px-4 py-8 text-center text-gray-400">
                  No companies match your search.
                </td>
              </tr>
            )}
            {sorted.map((co) => {
              const isExpanded = expanded.has(co.company_id);
              const visiblePositions = filteredPositionsByCompany.get(co.company_id) ?? [];
              const visibleCount = visiblePositions.length;
              const allPositions = positionsByCompany.get(co.company_id) ?? [];
              const totalCount = allPositions.length + (co.total_positions - co.english_positions);
              const pct = totalCount > 0 ? Math.round((visibleCount / totalCount) * 100) : 0;
              const visibleCategories = [...new Set(visiblePositions.map((p) => p.category_name))].sort();
              return (
                <>
                  <tr
                    key={co.company_id}
                    class="border-b border-gray-100 hover:bg-[#002EA2] hover:text-white group transition-colors cursor-pointer"
                    onClick={() => toggleExpand(co.company_id)}
                  >
                    <td class="px-4 py-3 font-medium text-gray-900 group-hover:text-white overflow-hidden">
                      <div class="flex items-center gap-1 whitespace-nowrap" style={{ maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent)', WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent)' }}>
                        <span class="text-gray-400 group-hover:text-[#99B3DB] text-xl w-5 select-none">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        <a
                          href={`/${countrySlug}/${nameToSlug(co.name)}`}
                          onClick={(e) => e.stopPropagation()}
                          class="hover:underline"
                        >
                          {co.name}
                        </a>
                        {co.is_english_company && (
                          <span class="text-xs bg-[#CCd9ED] text-[#002383] group-hover:bg-white/20 group-hover:text-white px-1.5 py-0.5 rounded font-semibold">
                            EN
                          </span>
                        )}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-center text-[#002EA2] group-hover:text-white font-bold" style={numFont}>{visibleCount}</td>
                    <td class="px-4 py-3 text-center text-gray-600 group-hover:text-white" style={numFont}>{co.total_positions}</td>
                    <td class="px-4 py-3 text-center group-hover:text-white">
                      <PercentageBadge value={pct} />
                    </td>
                    <td class="px-4 py-3 text-gray-400 group-hover:text-[#CCd9ED] text-xs max-w-[200px] truncate">
                      {visibleCategories.join(', ') || '—'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <>
                      {visiblePositions.map((pos) => (
                        <PositionRow key={pos.id} pos={pos} />
                      ))}
                      {co.career_page_url && <SeeAllRow url={co.career_page_url} />}
                    </>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      <div class="mt-2 text-xs text-gray-400">
        {sorted.length} of {companies.length} companies
      </div>
    </div>
  );
}
