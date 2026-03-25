import { useState, useMemo } from 'preact/hooks';
import type { CompanyStats, PositionDetail } from '../../lib/types';

type SortKey = 'name' | 'total_positions' | 'english_positions' | 'english_percentage';
type SortDir = 'asc' | 'desc';

interface Props {
  companies: CompanyStats[];
  positions: PositionDetail[];
}

function PercentageBadge({ value }: { value: number }) {
  const color =
    value >= 60 ? 'text-green-700 bg-green-50'
    : value >= 30 ? 'text-yellow-700 bg-yellow-50'
    : 'text-red-700 bg-red-50';
  return (
    <span class={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {value}%
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span class="ml-1 text-gray-300">↕</span>;
  return <span class="ml-1 text-blue-600">{dir === 'asc' ? '↑' : '↓'}</span>;
}

function PositionRow({ pos }: { pos: PositionDetail }) {
  return (
    <tr class="bg-gray-50 border-t border-gray-100">
      <td class="pl-10 pr-4 py-2 text-sm text-gray-700" colSpan={4}>
        <div class="flex items-center gap-2 flex-wrap">
          {pos.url ? (
            <a
              href={pos.url}
              target="_blank"
              rel="noopener noreferrer"
              class="hover:underline hover:text-blue-600 text-gray-800"
            >
              {pos.title}
            </a>
          ) : (
            <span>{pos.title}</span>
          )}
          {pos.local_language_advantage && (
            <span class="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">lang advantage</span>
          )}
          <span class="text-xs text-gray-400">{pos.category_name}</span>
        </div>
      </td>
      <td class="px-4 py-2 text-xs text-gray-400">
        {pos.url ? (
          <a
            href={pos.url}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-blue-500 underline"
            title={pos.url}
          >
            view ↗
          </a>
        ) : (
          <span class="text-gray-300">no link</span>
        )}
      </td>
    </tr>
  );
}

export default function CompanyTable({ companies, positions }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('english_percentage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const positionsByCompany = useMemo(() => {
    const map = new Map<string, PositionDetail[]>();
    for (const p of positions) {
      const arr = map.get(p.company_id) ?? [];
      arr.push(p);
      map.set(p.company_id, arr);
    }
    return map;
  }, [positions]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? companies.filter((c) => c.name.toLowerCase().includes(q))
      : companies;
  }, [companies, search]);

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
    { key: 'name',               label: 'Company',  align: 'text-left'  },
    { key: 'total_positions',    label: 'Total',    align: 'text-right' },
    { key: 'english_positions',  label: 'English',  align: 'text-right' },
    { key: 'english_percentage', label: '%',        align: 'text-right' },
  ];

  return (
    <div class="bg-white border border-gray-200 rounded-xl overflow-hidden mb-8">
      {/* Search */}
      <div class="px-4 py-3 border-b border-gray-100">
        <input
          type="search"
          placeholder="Search companies…"
          value={search}
          onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
          class="w-full sm:w-72 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  class={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 ${col.align}`}
                >
                  {col.label}
                  <SortIcon active={sortKey === col.key} dir={sortDir} />
                </th>
              ))}
              <th class="px-4 py-3 font-medium text-gray-600 text-left">Categories</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} class="px-4 py-8 text-center text-gray-400">
                  No companies match your search.
                </td>
              </tr>
            )}
            {sorted.map((co) => {
              const isExpanded = expanded.has(co.company_id);
              const companyPositions = positionsByCompany.get(co.company_id) ?? [];
              return (
                <>
                  <tr
                    key={co.company_id}
                    class="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleExpand(co.company_id)}
                  >
                    <td class="px-4 py-3 font-medium text-gray-900">
                      <div class="flex items-center gap-2">
                        <span class="text-gray-300 text-xs w-4 select-none">
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {co.career_page_url ? (
                          <a
                            href={co.career_page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="hover:underline hover:text-blue-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {co.name}
                          </a>
                        ) : (
                          co.name
                        )}
                        {co.is_english_company && (
                          <span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                            EN
                          </span>
                        )}
                      </div>
                    </td>
                    <td class="px-4 py-3 text-right text-gray-600">{co.total_positions}</td>
                    <td class="px-4 py-3 text-right text-blue-600 font-medium">{co.english_positions}</td>
                    <td class="px-4 py-3 text-right">
                      <PercentageBadge value={Number(co.english_percentage)} />
                    </td>
                    <td class="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">
                      {co.categories?.join(', ') ?? '—'}
                    </td>
                  </tr>
                  {isExpanded && companyPositions.map((pos) => (
                    <PositionRow key={pos.id} pos={pos} />
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      <div class="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
        {sorted.length} of {companies.length} companies
      </div>
    </div>
  );
}
