import { useState, useEffect } from 'preact/hooks';
import {
    readCache,
    writeCache,
    invalidateCachePrefix,
} from '../../lib/admin-cache';
import {
    AdminCompanyListSchema,
    type AdminCompany as CompanyRow,
} from '../../lib/admin-schemas';

interface CompanyGroup {
    name: string;
    career_page_url: string | null;
    total_positions: number;
    updated_at: string;
    countries: CompanyRow[];
}

function groupByName(rows: CompanyRow[]): CompanyGroup[] {
    const map = new Map<string, CompanyGroup>();
    for (const row of rows) {
        const g = map.get(row.name);
        if (!g) {
            map.set(row.name, {
                name: row.name,
                career_page_url: row.career_page_url,
                total_positions: row.total_positions,
                updated_at: row.updated_at,
                countries: [row],
            });
        } else {
            g.total_positions += row.total_positions;
            if (row.updated_at > g.updated_at) g.updated_at = row.updated_at;
            if (!g.career_page_url && row.career_page_url)
                g.career_page_url = row.career_page_url;
            g.countries.push(row);
        }
    }
    return Array.from(map.values());
}

function fmt(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function DataManager() {
    const [companies, setCompanies] = useState<CompanyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState<string | null>(null);
    const [confirmName, setConfirmName] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    async function load(force = false) {
        if (!force) {
            const cached = readCache<CompanyRow[]>('companies');
            if (cached) {
                setCompanies(cached);
                setLoading(false);
                return;
            }
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/admin/companies');
            if (!res.ok) throw new Error('Failed to load');
            const data = AdminCompanyListSchema.parse(await res.json());
            setCompanies(data);
            writeCache('companies', data);
        } catch {
            setError('Could not load companies.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    function toggleExpanded(name: string) {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }

    async function handleDeleteAll(name: string) {
        setDeleting(name);
        setConfirmName(null);
        try {
            const res = await fetch(
                `/api/admin/companies?name=${encodeURIComponent(name)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) throw new Error('Delete failed');
            setCompanies((prev) => {
                const next = prev.filter((c) => c.name !== name);
                writeCache('companies', next);
                return next;
            });
            invalidateCachePrefix('positions:');
        } catch {
            setError('Delete failed — please try again.');
        } finally {
            setDeleting(null);
        }
    }

    function handleUpdate(careerUrl: string) {
        sessionStorage.setItem('scraper-prefill-url', careerUrl);
        window.location.href = '/admin/scrape';
    }

    if (loading) return <div class="text-sm text-gray-500 py-4">Loading…</div>;

    if (error) {
        return (
            <div class="text-sm text-red-600 py-4">
                {error}{' '}
                <button onClick={() => load(true)} class="underline">
                    Retry
                </button>
            </div>
        );
    }

    const groups = groupByName(companies);

    if (groups.length === 0) {
        return (
            <div class="text-sm text-gray-500 py-4">
                No companies yet. Upload some data above.
            </div>
        );
    }

    return (
        <div>
            <div class="flex items-center justify-between mb-3">
                <span class="text-sm text-gray-500">
                    {groups.length} companies
                </span>
                <button
                    onClick={() => load(true)}
                    class="bg-[#0F7A4F] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0B5E3C] transition-colors whitespace-nowrap"
                >
                    Refresh
                </button>
            </div>

            <div class="space-y-2">
                {groups.map((group) => {
                    const isExpanded = expanded.has(group.name);
                    const isDeleting = deleting === group.name;
                    const isConfirming = confirmName === group.name;
                    const multi = group.countries.length > 1;

                    return (
                        <div
                            key={group.name}
                            class="border border-gray-200 rounded-xl overflow-hidden"
                        >
                            {/* ── Company header row ── */}
                            <div class="flex items-center gap-3 px-4 py-3 bg-white">
                                {/* Expand chevron (multi-country only) */}
                                <button
                                    onClick={
                                        multi
                                            ? () => toggleExpanded(group.name)
                                            : undefined
                                    }
                                    class={`w-4 h-4 flex-shrink-0 transition-transform ${multi ? 'text-gray-500 hover:text-gray-600 cursor-pointer' : 'cursor-default text-transparent pointer-events-none'}`}
                                    tabIndex={multi ? 0 : -1}
                                    aria-label={
                                        isExpanded
                                            ? 'Collapse countries'
                                            : 'Expand countries'
                                    }
                                >
                                    <svg
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        class={`w-4 h-4 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M9 5l7 7-7 7"
                                        />
                                    </svg>
                                </button>

                                {/* Name + country hint */}
                                <div class="flex-1 min-w-0">
                                    <span class="font-medium text-gray-900 text-sm">
                                        {group.name}
                                    </span>
                                    <span class="ml-2 text-xs text-gray-500">
                                        {multi
                                            ? `${group.countries.length} countries`
                                            : group.countries[0].country_name}
                                    </span>
                                </div>

                                {/* Position count */}
                                <span class="text-sm text-gray-500 tabular-nums whitespace-nowrap">
                                    {group.total_positions}{' '}
                                    {group.total_positions === 1
                                        ? 'position'
                                        : 'positions'}
                                </span>

                                {/* Updated date */}
                                <span class="text-xs text-gray-500 whitespace-nowrap hidden sm:block">
                                    {fmt(group.updated_at)}
                                </span>

                                {/* Actions */}
                                <div class="flex items-center gap-1.5 pl-3 border-l border-gray-100 flex-shrink-0">
                                    {group.career_page_url ? (
                                        <button
                                            onClick={() =>
                                                handleUpdate(
                                                    group.career_page_url!,
                                                )
                                            }
                                            class="text-xs text-[#0F7A4F] hover:text-[#084A2F] font-medium px-2 py-1 rounded hover:bg-green-50 transition-colors"
                                        >
                                            Update
                                        </button>
                                    ) : null}

                                    {isConfirming ? (
                                        <span class="flex items-center gap-1.5">
                                            <span class="text-xs text-gray-500">
                                                Sure?
                                            </span>
                                            <button
                                                onClick={() =>
                                                    handleDeleteAll(group.name)
                                                }
                                                disabled={isDeleting}
                                                class="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
                                            >
                                                {isDeleting
                                                    ? 'Deleting…'
                                                    : 'Yes'}
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setConfirmName(null)
                                                }
                                                class="text-xs text-gray-500 hover:underline"
                                            >
                                                Cancel
                                            </button>
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() =>
                                                setConfirmName(group.name)
                                            }
                                            disabled={isDeleting}
                                            class="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                                        >
                                            {isDeleting
                                                ? 'Deleting…'
                                                : 'Delete'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── Country breakdown (only for multi-country, when expanded) ── */}
                            {multi && isExpanded && (
                                <div class="border-t border-gray-100 divide-y divide-gray-100 bg-gray-50">
                                    {group.countries.map((row) => (
                                        <div
                                            key={row.company_id}
                                            class="flex items-center gap-3 px-4 py-2 pl-10"
                                        >
                                            <span class="flex-1 text-sm text-gray-700">
                                                {row.country_name}
                                            </span>
                                            <span class="text-xs text-gray-500 tabular-nums whitespace-nowrap">
                                                {row.total_positions}{' '}
                                                {row.total_positions === 1
                                                    ? 'position'
                                                    : 'positions'}
                                            </span>
                                            <span class="text-xs text-gray-500 whitespace-nowrap hidden sm:block w-[7.5rem] text-right">
                                                {fmt(row.updated_at)}
                                            </span>
                                            {/* Spacer aligns with the action column above */}
                                            <div class="flex-shrink-0 pl-3 border-l border-transparent w-24" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
