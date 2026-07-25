import { useState } from 'preact/hooks';

interface Skill {
  id: string;
  canonical_name: string;
  category: string;
  aliases: string[];
  is_legacy: boolean;
}

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'language',    label: 'Language' },
  { value: 'framework',   label: 'Framework' },
  { value: 'database',    label: 'Database' },
  { value: 'cloud',       label: 'Cloud' },
  { value: 'tool',        label: 'Tool' },
  { value: 'methodology', label: 'Methodology' },
  { value: 'api_style',     label: 'API Style' },
  { value: 'certification', label: 'Certification' },
  { value: 'platform',      label: 'Platform' },
];

const EMPTY_DRAFT = { canonical_name: '', category: 'language', aliases: '', is_legacy: false };

export default function SkillsManager() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState({ ...EMPTY_DRAFT });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ ...EMPTY_DRAFT, is_legacy: false });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadCategory(cat: string) {
    setSelectedCategory(cat);
    setLoading(true);
    setError('');
    setShowAddForm(false);
    setEditingId(null);
    try {
      const res = await fetch(`/api/admin/skills?category=${encodeURIComponent(cat)}`);
      if (!res.ok) throw new Error('Failed to load');
      setSkills(await res.json());
    } catch {
      setError('Could not load skills.');
    } finally {
      setLoading(false);
    }
  }

  function parseAliases(raw: string): string[] {
    return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  }

  async function handleAddSubmit(e: Event) {
    e.preventDefault();
    setAddError('');
    setAddSaving(true);
    try {
      const res = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: addDraft.canonical_name.trim(),
          category: addDraft.category,
          aliases: parseAliases(addDraft.aliases),
          is_legacy: addDraft.is_legacy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? 'Failed to create skill');
        return;
      }
      // Append to list only if it matches the selected category
      if (data.category === selectedCategory) {
        setSkills((prev) => [...prev, data].sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)));
      }
      setAddDraft({ ...EMPTY_DRAFT, category: addDraft.category });
      setShowAddForm(false);
    } catch {
      setAddError('Request failed — please try again.');
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(skill: Skill) {
    setEditingId(skill.id);
    setEditDraft({
      canonical_name: skill.canonical_name,
      category: skill.category,
      aliases: skill.aliases.join(', '),
      is_legacy: skill.is_legacy,
    });
    setEditError('');
    setShowAddForm(false);
  }

  async function handleEditSubmit(e: Event, id: string) {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/skills/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_name: editDraft.canonical_name.trim(),
          category: editDraft.category,
          aliases: parseAliases(editDraft.aliases),
          is_legacy: editDraft.is_legacy,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? 'Failed to update skill');
        return;
      }
      // If category changed away from current filter, remove from list; otherwise update in place
      if (data.category !== selectedCategory) {
        setSkills((prev) => prev.filter((s) => s.id !== id));
      } else {
        setSkills((prev) =>
          prev
            .map((s) => (s.id === id ? data : s))
            .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
        );
      }
      setEditingId(null);
    } catch {
      setEditError('Request failed — please try again.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/admin/skills/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Delete failed');
        return;
      }
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Delete failed — please try again.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div class="space-y-5">
      {/* Category filter bar + Add button */}
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => loadCategory(cat.value)}
              class={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                selectedCategory === cat.value
                  ? 'bg-[#0F7A4F] border-[#0F7A4F] text-white'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowAddForm((v) => !v); setEditingId(null); setAddError(''); }}
          class="px-3 py-1.5 text-sm font-medium rounded-lg border border-green-200 text-[#0F7A4F] hover:bg-green-50 transition-colors whitespace-nowrap"
        >
          {showAddForm ? 'Cancel' : '+ Add skill'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
          <h3 class="text-sm font-semibold text-gray-800">Add new skill</h3>
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Canonical name</label>
              <input
                type="text"
                required
                placeholder="e.g. Node.js"
                value={addDraft.canonical_name}
                onInput={(e) => setAddDraft((d) => ({ ...d, canonical_name: (e.target as HTMLInputElement).value }))}
                class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B]"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Aliases <span class="font-normal text-gray-400">(comma-separated, lowercase)</span></label>
              <input
                type="text"
                placeholder="e.g. node, nodejs, node.js"
                value={addDraft.aliases}
                onInput={(e) => setAddDraft((d) => ({ ...d, aliases: (e.target as HTMLInputElement).value }))}
                class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B]"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Category</label>
              <select
                value={addDraft.category}
                onChange={(e) => setAddDraft((d) => ({ ...d, category: (e.target as HTMLSelectElement).value }))}
                class="admin-select w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B] bg-white"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={addDraft.is_legacy}
              onChange={(e) => setAddDraft((d) => ({ ...d, is_legacy: (e.target as HTMLInputElement).checked }))}
            />
            Legacy technology
          </label>
          {addError && <p class="text-xs text-red-600">{addError}</p>}
          <div class="flex gap-2">
            <button
              type="submit"
              disabled={addSaving}
              class="px-3 py-1.5 text-sm font-medium bg-[#0F7A4F] text-white rounded-lg hover:bg-[#0B5E3C] disabled:opacity-50 transition-colors"
            >
              {addSaving ? 'Saving…' : 'Save skill'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {!selectedCategory && !showAddForm && (
        <p class="text-sm text-gray-400 py-6 text-center">
          Select a category above to view and manage skills.
        </p>
      )}

      {/* Error */}
      {error && (
        <p class="text-sm text-red-600">{error}</p>
      )}

      {/* Loading */}
      {loading && (
        <p class="text-sm text-gray-400 py-4">Loading…</p>
      )}

      {/* Skills table */}
      {selectedCategory && !loading && skills.length === 0 && !error && (
        <p class="text-sm text-gray-400 py-4">
          No skills in this category yet.{' '}
          <button onClick={() => setShowAddForm(true)} class="text-[#0F7A4F] hover:underline">Add one.</button>
        </p>
      )}

      {selectedCategory && !loading && skills.length > 0 && (
        <div class="overflow-x-auto md:overflow-visible rounded-xl border border-gray-200">
          <table class="sticky-head w-full text-sm">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200 text-left">
                <th class="px-4 py-2.5 font-medium text-gray-600 w-1/4">Canonical name</th>
                <th class="px-4 py-2.5 font-medium text-gray-600 w-1/2">Aliases</th>
                <th class="px-4 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {skills.map((skill) => {
                const isEditing = editingId === skill.id;
                const isDeleting = deleting === skill.id;
                const isConfirming = confirmDeleteId === skill.id;

                return (
                  <tr key={skill.id} class="bg-white hover:bg-gray-50/50">
                    {isEditing ? (
                      /* ── Edit row ── */
                      <td colSpan={3} class="px-4 py-3">
                        <form onSubmit={(e) => handleEditSubmit(e, skill.id)} class="space-y-2">
                          <div class="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-2">
                            <div>
                              <label class="block text-xs font-medium text-gray-600 mb-1">Canonical name</label>
                              <input
                                type="text"
                                required
                                value={editDraft.canonical_name}
                                onInput={(e) => setEditDraft((d) => ({ ...d, canonical_name: (e.target as HTMLInputElement).value }))}
                                class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B]"
                              />
                            </div>
                            <div>
                              <label class="block text-xs font-medium text-gray-600 mb-1">Aliases <span class="font-normal text-gray-400">(comma-separated, lowercase)</span></label>
                              <input
                                type="text"
                                placeholder="e.g. node, nodejs, node.js"
                                value={editDraft.aliases}
                                onInput={(e) => setEditDraft((d) => ({ ...d, aliases: (e.target as HTMLInputElement).value }))}
                                class="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B]"
                              />
                            </div>
                            <div>
                              <label class="block text-xs font-medium text-gray-600 mb-1">Category</label>
                              <select
                                value={editDraft.category}
                                onChange={(e) => setEditDraft((d) => ({ ...d, category: (e.target as HTMLSelectElement).value }))}
                                class="admin-select w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#12956B] bg-white"
                              >
                                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer w-fit">
                            <input
                              type="checkbox"
                              checked={editDraft.is_legacy}
                              onChange={(e) => setEditDraft((d) => ({ ...d, is_legacy: (e.target as HTMLInputElement).checked }))}
                            />
                            Legacy technology
                          </label>
                          {editError && <p class="text-xs text-red-600">{editError}</p>}
                          <div class="flex gap-2">
                            <button
                              type="submit"
                              disabled={editSaving}
                              class="px-3 py-1 text-xs font-medium bg-[#0F7A4F] text-white rounded-lg hover:bg-[#0B5E3C] disabled:opacity-50"
                            >
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              class="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      /* ── Normal row ── */
                      <>
                        <td class="px-4 py-2.5 font-medium text-gray-900">
                          {skill.canonical_name}
                          {skill.is_legacy && (
                            <span class="ml-2 px-1.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded">legacy</span>
                          )}
                        </td>
                        <td class="px-4 py-2.5 text-gray-500 text-xs">
                          {skill.aliases.length > 0
                            ? skill.aliases.join(', ')
                            : <span class="text-gray-300 italic">none</span>}
                        </td>
                        <td class="px-4 py-2.5">
                          <div class="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => startEdit(skill)}
                              class="text-xs text-[#0F7A4F] hover:text-[#084A2F] px-2 py-1 rounded hover:bg-green-50 transition-colors"
                            >
                              Edit
                            </button>
                            {isConfirming ? (
                              <span class="flex items-center gap-1.5">
                                <span class="text-xs text-gray-500">Sure?</span>
                                <button
                                  onClick={() => handleDelete(skill.id)}
                                  disabled={isDeleting}
                                  class="text-xs text-red-600 font-medium hover:underline disabled:opacity-50"
                                >
                                  {isDeleting ? 'Deleting…' : 'Yes'}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  class="text-xs text-gray-400 hover:underline"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(skill.id)}
                                disabled={isDeleting}
                                class="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
