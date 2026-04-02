import { useState, useEffect } from 'preact/hooks';

interface CompanyOption {
  company_id: string;
  name: string;
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
  category: CategoryInfo | null;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function PositionEditor() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState('');

  // Load company list once on mount
  useEffect(() => {
    fetch('/api/admin/companies')
      .then((r) => r.json())
      .then((rows: CompanyOption[]) => {
        setCompanies(rows);
      })
      .catch(() => setError('Could not load companies.'))
      .finally(() => setLoadingCompanies(false));
  }, []);

  // Load positions when a company is selected
  useEffect(() => {
    if (!selectedId) {
      setPositions([]);
      return;
    }
    setLoadingPositions(true);
    setError('');
    fetch(`/api/admin/positions?company_id=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((rows: PositionRow[]) => setPositions(rows))
      .catch(() => setError('Could not load positions.'))
      .finally(() => setLoadingPositions(false));
  }, [selectedId]);

  function setSave(id: string, state: SaveState) {
    setSaveStates((prev) => ({ ...prev, [id]: state }));
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
    setPositions((prev) =>
      prev.map((p) =>
        p.id === pos.id
          ? { ...p, category: p.category ? { ...p.category, slug: newSlug } : null }
          : p
      )
    );
    patchPosition(pos.id, { category_slug: newSlug });
  }

  function handleLanguageChange(pos: PositionRow, value: boolean) {
    setPositions((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, requires_native_language: value } : p))
    );
    patchPosition(pos.id, { requires_native_language: value });
  }

  function handleAdvantageChange(pos: PositionRow, value: boolean) {
    setPositions((prev) =>
      prev.map((p) => (p.id === pos.id ? { ...p, local_language_advantage: value } : p))
    );
    patchPosition(pos.id, { local_language_advantage: value });
  }

  // Categories — derived from the loaded positions (no extra fetch needed)
  const knownCategories = Array.from(
    new Map(
      positions
        .filter((p) => p.category)
        .map((p) => [p.category!.slug, p.category!])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (loadingCompanies) {
    return <div class="text-sm text-gray-400 py-4">Loading…</div>;
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
          class="flex-1 max-w-sm text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={selectedId}
          onChange={(e) => setSelectedId((e.target as HTMLSelectElement).value)}
        >
          <option value="">— select a company —</option>
          {companies.map((c) => (
            <option key={c.company_id} value={c.company_id}>
              {c.name} ({c.country_name}) · {c.total_positions} positions
            </option>
          ))}
        </select>
      </div>

      {error && <p class="text-sm text-red-600">{error}</p>}

      {/* Positions table */}
      {selectedId && (
        <div>
          {loadingPositions ? (
            <div class="text-sm text-gray-400 py-4">Loading positions…</div>
          ) : positions.length === 0 ? (
            <div class="text-sm text-gray-400 py-4">No positions found for this company.</div>
          ) : (
            <div class="overflow-x-auto rounded-xl border border-gray-200">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-gray-50 border-b border-gray-200 text-left">
                    <th class="px-4 py-2.5 font-medium text-gray-600 w-1/2">Position</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600">Category</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600 text-center">Requires local lang.</th>
                    <th class="px-4 py-2.5 font-medium text-gray-600 text-center">Local advantage</th>
                    <th class="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  {positions.map((pos) => {
                    const state = saveStates[pos.id] ?? 'idle';
                    return (
                      <tr key={pos.id} class="bg-white hover:bg-gray-50/50">
                        {/* Title */}
                        <td class="px-4 py-2.5">
                          {pos.url ? (
                            <a
                              href={pos.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="text-blue-600 hover:underline font-medium line-clamp-2"
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
                            class="text-xs border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
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
                            class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                            class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={pos.local_language_advantage}
                            onChange={(e) =>
                              handleAdvantageChange(pos, (e.target as HTMLInputElement).checked)
                            }
                          />
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
