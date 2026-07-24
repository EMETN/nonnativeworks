import { useState, useEffect } from 'preact/hooks';
import { CATEGORIES } from '../../lib/categories';
import { readCache, writeCache, invalidateCache, invalidateCachePrefix } from '../../lib/admin-cache';

interface CompanyOption {
  company_id: string;
  name: string;
  country_id: string;
  country_name: string;
  total_positions: number;
}

interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
}

interface PositionRow {
  id: string;
  title: string;
  url: string | null;
  requires_native_language: boolean;
  local_language_advantage: boolean;
  required_education: string | null;
  category: CategoryInfo | null;
  company?: { name: string; country_name: string } | null;
}

const ALL = '__all__';
const COUNTRY_PREFIX = '__country__:';

const EDUCATION_OPTIONS = [
  { value: '',           label: '— not specified —' },
  { value: 'vocational', label: 'Vocational' },
  { value: 'bachelor',   label: "Bachelor's" },
  { value: 'master',     label: "Master's" },
  { value: 'mba',        label: 'MBA' },
  { value: 'phd',        label: 'PhD' },
];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SortArrow({ dir, active }: { dir: 'asc' | 'desc'; active: boolean }) {
  const cls = 'w-2.5 h-2.5 inline-block ml-1 sm:ml-1.5';
  if (!active) {
    return (
      <svg class={cls} width="10" height="12" style={{ opacity: 0.35 }} fill="none" viewBox="0 0 10 12" stroke="currentColor" stroke-width={2}>
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 4l4-4 4 4" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 8l4 4 4-4" />
      </svg>
    );
  }
  // asc = A→Z, rendered as a down chevron
  return (
    <svg class={cls} width="10" height="12" fill="none" viewBox="0 0 10 12" stroke="currentColor" stroke-width={2}>
      {dir === 'asc' ? (
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 5l4 4 4-4" />
      ) : (
        <path stroke-linecap="round" stroke-linejoin="round" d="M1 7l4-4 4 4" />
      )}
    </svg>
  );
}

export default function PositionEditor() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [sort, setSort] = useState<{ key: 'company' | 'title'; dir: 'asc' | 'desc' } | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState('');

  function loadCompanies(force = false) {
    if (!force) {
      const cached = readCache<CompanyOption[]>('companies');
      if (cached) {
        setCompanies(cached);
        setLoadingCompanies(false);
        return;
      }
    }
    setLoadingCompanies(true);
    fetch('/api/admin/companies')
      .then((r) => r.json())
      .then((rows: CompanyOption[]) => {
        setCompanies(rows);
        writeCache('companies', rows);
      })
      .catch(() => setError('Could not load companies.'))
      .finally(() => setLoadingCompanies(false));
  }

  useEffect(() => { loadCompanies(); }, []);

  // Load positions when a company is selected
  useEffect(() => {
    if (!selectedId) {
      setPositions([]);
      return;
    }
    setError('');
    // Match the order the API returns rows in, so the sorted column loads active.
    const multi = selectedId === ALL || selectedId.startsWith(COUNTRY_PREFIX);
    setSort({ key: multi ? 'company' : 'title', dir: 'asc' });

    const cacheKey = `positions:${selectedId}`;
    const cached = readCache<PositionRow[]>(cacheKey);
    if (cached) {
      setPositions(cached);
      setLoadingPositions(false);
      return;
    }

    setLoadingPositions(true);
    let query = '';
    if (selectedId.startsWith(COUNTRY_PREFIX)) {
      query = `?country_id=${encodeURIComponent(selectedId.slice(COUNTRY_PREFIX.length))}`;
    } else if (selectedId !== ALL) {
      query = `?company_id=${encodeURIComponent(selectedId)}`;
    }
    fetch(`/api/admin/positions${query}`)
      .then((r) => r.json())
      .then((rows: PositionRow[]) => {
        setPositions(rows);
        writeCache(cacheKey, rows);
      })
      .catch(() => setError('Could not load positions.'))
      .finally(() => setLoadingPositions(false));
  }, [selectedId, reloadKey]);

  function refresh() {
    invalidateCache('companies');
    invalidateCachePrefix('positions:');
    loadCompanies(true);
    setReloadKey((k) => k + 1);
  }

  const showCompanyColumn = selectedId === ALL || selectedId.startsWith(COUNTRY_PREFIX);
  const totalPositions = companies.reduce((sum, c) => sum + c.total_positions, 0);

  const countryGroups = Array.from(
    companies
      .reduce((map, c) => {
        const g = map.get(c.country_id) ?? { country_id: c.country_id, country_name: c.country_name, total: 0 };
        g.total += c.total_positions;
        return map.set(c.country_id, g);
      }, new Map<string, { country_id: string; country_name: string; total: number }>())
      .values()
  ).sort((a, b) => a.country_name.localeCompare(b.country_name));

  function toggleSort(key: 'company' | 'title') {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );
  }

  const sortedPositions = sort
    ? [...positions].sort((a, b) => {
        const av = sort.key === 'company' ? a.company?.name ?? '' : a.title ?? '';
        const bv = sort.key === 'company' ? b.company?.name ?? '' : b.title ?? '';
        const cmp = av.localeCompare(bv);
        return sort.dir === 'asc' ? cmp : -cmp;
      })
    : positions;

  function setSave(id: string, state: SaveState) {
    setSaveStates((prev) => ({ ...prev, [id]: state }));
  }

  // Optimistic edits also update the cached copy for the current selection.
  function setPositionsAndCache(updater: (prev: PositionRow[]) => PositionRow[]) {
    setPositions((prev) => {
      const next = updater(prev);
      if (selectedId) writeCache(`positions:${selectedId}`, next);
      return next;
    });
  }

  async function patchPosition(id: string, patch: Record<string, unknown>) {
    setSave(id, 'saving');
    try {
      const res = await fetch(`/api/admin/positions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      setSave(id, 'saved');
      setTimeout(() => setSave(id, 'idle'), 2000);
    } catch {
      setSave(id, 'error');
    }
  }

  function handleCategoryChange(pos: PositionRow, newSlug: string) {
    // Optimistic local update
    setPositionsAndCache((prev) =>
      prev.map((p) =>
        p.id === pos.id
          ? { ...p, category: p.category ? { ...p.category, slug: newSlug } : null }
          : p
      )
    );
    patchPosition(pos.id, { category_slug: newSlug });
  }

  function handleLanguageChange(pos: PositionRow, value: boolean) {
    setPositionsAndCache((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, requires_native_language: value } : p))
    );
    patchPosition(pos.id, { requires_native_language: value });
  }

  function handleAdvantageChange(pos: PositionRow, value: boolean) {
    setPositionsAndCache((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, local_language_advantage: value } : p))
    );
    patchPosition(pos.id, { local_language_advantage: value });
  }

  function handleEducationChange(pos: PositionRow, value: string) {
    const education = value === '' ? null : value;
    setPositionsAndCache((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, required_education: education } : p))
    );
    patchPosition(pos.id, { required_education: education });
  }

  // Full category list from the canonical source — not derived from loaded positions,
  // which would omit categories not yet used by this company.
  const knownCategories = CATEGORIES;

  if (loadingCompanies) {
    return <div class="text-sm text-gray-400 py-1.5 border border-transparent">Loading…</div>;
  }

  if (error && companies.length === 0) {
    return (
      <div class="text-sm text-red-600 py-4">
        {error}
      </div>
    );
  }

  return (
    <div class="space-y-4">
      {/* Company selector */}
      <div class="flex items-center gap-3">
        <label class="text-sm font-medium text-gray-700 whitespace-nowrap" for="company-select">
          Company
        </label>
        <select
          id="company-select"
          class="admin-select flex-1 max-w-sm text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B]"
          value={selectedId}
          onChange={(e) => setSelectedId((e.target as HTMLSelectElement).value)}
        >
          <option value="">— select a company —</option>
          {companies.length > 0 && (
            <option value={ALL}>All companies · {totalPositions} positions</option>
          )}
          {countryGroups.map((g) => (
            <option key={g.country_id} value={`${COUNTRY_PREFIX}${g.country_id}`}>
              All {g.country_name} companies · {g.total} positions
            </option>
          ))}
          {companies.length > 0 && <option disabled>────────────────</option>}
          {companies.map((c) => (
            <option key={c.company_id} value={c.company_id}>
              {c.name} ({c.country_name}) · {c.total_positions} positions
            </option>
          ))}
        </select>
        <button
          onClick={refresh}
          class="bg-[#0F7A4F] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0B5E3C] transition-colors whitespace-nowrap"
        >
          Refresh
        </button>
      </div>

      {error && <p class="text-sm text-red-600">{error}</p>}

      {/* Positions table */}
      {selectedId && (
        <div>
          {loadingPositions ? (
            <div class="text-sm text-gray-400 py-4">Loading positions…</div>
          ) : positions.length === 0 ? (
            <div class="text-sm text-gray-400 py-4">
              {showCompanyColumn ? 'No positions found.' : 'No positions found for this company.'}
            </div>
          ) : (
            <div class="overflow-x-auto rounded-xl border border-gray-200">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-left">
                    {showCompanyColumn && (
                      <th class="px-4 py-2.5 font-medium text-gray-600">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                          onClick={() => toggleSort('company')}
                        >
                          Company
                          <SortArrow
                            dir={sort?.key === 'company' ? sort.dir : 'desc'}
                            active={sort?.key === 'company'}
                          />
                        </button>
                      </th>
                    )}
                    <th class="px-4 py-2.5 font-medium text-gray-600 w-1/2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 hover:text-gray-900 cursor-pointer"
                        onClick={() => toggleSort('title')}
                      >
                        Position
                        <SortArrow
                          dir={sort?.key === 'title' ? sort.dir : 'desc'}
                          active={sort?.key === 'title'}
                        />
                      </button>
                    </th>
                    <th class="px-4 py-2.5 font-medium text-gray-600">Category</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600 text-center">Requires local lang.</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600 text-center">Local advantage</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600">Education</th>
                    <th class="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {sortedPositions.map((pos) => {
                    const state = saveStates[pos.id] ?? 'idle';
                    return (
                      <tr key={pos.id} class="bg-white hover:bg-gray-50/50">
                        {/* Company */}
                        {showCompanyColumn && (
                          <td class="px-4 py-2.5 whitespace-nowrap">
                            <span class="font-medium text-gray-800">{pos.company?.name ?? '—'}</span>
                            {pos.company?.country_name && (
                              <span class="text-gray-400"> · {pos.company.country_name}</span>
                            )}
                          </td>
                        )}

                        {/* Title */}
                        <td class="px-4 py-2.5">
                          {pos.url ? (
                            <a
                              href={pos.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-[#0F7A4F] hover:underline font-medium line-clamp-2"
                            >
                              {pos.title}
                            </a>
                          ) : (
                            <span class="font-medium text-gray-800">{pos.title}</span>
                          )}
                        </td>

                        {/* Category */}
                        <td class="px-4 py-2.5">
                          <select
                            class="admin-select text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#12956B] bg-white"
                            value={pos.category?.slug ?? ''}
                            onChange={(e) =>
                              handleCategoryChange(pos, (e.target as HTMLSelectElement).value)
                            }
                          >
                            {knownCategories.map((cat) => (
                              <option key={cat.slug} value={cat.slug}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Requires native language */}
                        <td class="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={pos.requires_native_language}
                            onChange={(e) =>
                              handleLanguageChange(pos, (e.target as HTMLInputElement).checked)
                            }
                          />
                        </td>

                        {/* Local language advantage */}
                        <td class="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={pos.local_language_advantage}
                            onChange={(e) =>
                              handleAdvantageChange(pos, (e.target as HTMLInputElement).checked)
                            }
                          />
                        </td>

                        {/* Education */}
                        <td class="px-4 py-2.5">
                          <select
                            class="admin-select text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#12956B] bg-white"
                            value={pos.required_education ?? ''}
                            onChange={(e) =>
                              handleEducationChange(pos, (e.target as HTMLSelectElement).value)
                            }
                          >
                            {EDUCATION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>

                        {/* Save indicator */}
                        <td class="px-4 py-2.5 text-center">
                          {state === 'saving' && (
                            <span class="text-xs text-gray-400">Saving…</span>
                          )}
                          {state === 'saved' && (
                            <span class="text-xs text-green-600">Saved</span>
                          )}
                          {state === 'error' && (
                            <span class="text-xs text-red-500">Error</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
