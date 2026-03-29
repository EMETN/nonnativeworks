import { useState, useEffect } from 'preact/hooks';

interface CompanyRow {
  company_id: string;
  name: string;
  country_name: string;
  total_positions: number;
  updated_at: string;
}

export default function DataManager() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/companies');
      if (!res.ok) throw new Error('Failed to load');
      setCompanies(await res.json());
    } catch {
      setError('Could not load companies.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    setDeleting(id);
    setConfirmId(null);
    try {
      const res = await fetch(`/api/admin/companies?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setCompanies((prev) => prev.filter((c) => c.company_id !== id));
    } catch {
      setError('Delete failed — please try again.');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div class="text-sm text-gray-400 py-4">Loading…</div>;
  }

  if (error) {
    return (
      <div class="text-sm text-red-600 py-4">
        {error}{' '}
        <button onClick={load} class="underline">Retry</button>
      </div>
    );
  }

  if (companies.length === 0) {
    return <div class="text-sm text-gray-400 py-4">No companies yet. Upload some data above.</div>;
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-3">
        <span class="text-sm text-gray-500">{companies.length} companies</span>
        <button
          onClick={load}
          class="text-sm text-[#002EA2] hover:underline"
        >
          Refresh
        </button>
      </div>

      <div class="border border-gray-200 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b border-gray-200">
            <tr>
              <th class="text-left px-4 py-2.5 font-medium text-gray-600">Company</th>
              <th class="text-left px-4 py-2.5 font-medium text-gray-600">Country</th>
              <th class="text-right px-4 py-2.5 font-medium text-gray-600">Positions</th>
              <th class="text-left px-4 py-2.5 font-medium text-gray-600">Updated</th>
              <th class="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {companies.map((co) => (
              <tr key={co.company_id} class="hover:bg-gray-50">
                <td class="px-4 py-2.5 font-medium text-gray-900">{co.name}</td>
                <td class="px-4 py-2.5 text-gray-500">{co.country_name}</td>
                <td class="px-4 py-2.5 text-right text-gray-600">{co.total_positions}</td>
                <td class="px-4 py-2.5 text-gray-400 text-xs">
                  {new Date(co.updated_at).toLocaleDateString()}
                </td>
                <td class="px-4 py-2.5 text-right">
                  {confirmId === co.company_id ? (
                    <span class="flex items-center justify-end gap-2">
                      <span class="text-xs text-gray-500">Sure?</span>
                      <button
                        onClick={() => handleDelete(co.company_id)}
                        disabled={deleting === co.company_id}
                        class="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
                      >
                        {deleting === co.company_id ? 'Deleting…' : 'Yes, delete'}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        class="text-xs text-gray-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmId(co.company_id)}
                      class="text-xs text-red-400 hover:text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
