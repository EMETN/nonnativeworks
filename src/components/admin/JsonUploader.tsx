import { useState } from 'preact/hooks';
import { UploadSchema, normaliseUpload, extractTotalPositions } from '../../lib/validation';
import type { UploadPayload, CompanyEntry } from '../../lib/validation';

type UploadState = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

interface ValidationError {
  path: string;
  message: string;
}

interface UploadResult {
  results: { company: string; country: string; positions: number }[];
  errors: { company: string; country: string; error: string }[];
}

export default function JsonUploader() {
  const [raw, setRaw] = useState('');
  const [state, setState] = useState<UploadState>('idle');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [previewEntries, setPreviewEntries] = useState<CompanyEntry[] | null>(null);
  const [reportedTotal, setReportedTotal] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRaw((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  }

  function validate(): UploadPayload | null {
    setState('validating');
    setValidationErrors([]);
    setErrorMsg('');
    setPreviewEntries(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setErrorMsg('Invalid JSON — could not parse.');
      setState('error');
      return null;
    }

    const result = UploadSchema.safeParse(parsed);
    if (!result.success) {
      const errs = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      }));
      setValidationErrors(errs);
      setState('error');
      return null;
    }

    setState('idle');
    return result.data;
  }

  async function handleUpload() {
    const payload = validate();
    if (!payload) return;

    setState('uploading');
    setUploadResult(null);
    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        setErrorMsg(data.error ?? 'Upload failed');
        setState('error');
      } else {
        setUploadResult(data);
        setState('success');
        setRaw('');
      }
    } catch {
      setErrorMsg('Network error — please try again.');
      setState('error');
    }
  }

  function handleValidateOnly() {
    const payload = validate();
    if (payload) {
      setPreviewEntries(normaliseUpload(payload));
      setReportedTotal(extractTotalPositions(payload));
    }
  }

  const isLoading = state === 'uploading';

  return (
    <div class="space-y-4">
      {/* File upload */}
      <div class="flex items-center gap-3">
        <label class="text-sm text-gray-600 shrink-0">Load from file:</label>
        <input
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          class="text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:border file:border-gray-300 file:rounded-md file:text-sm file:bg-white hover:file:bg-gray-50"
        />
      </div>

      {/* Textarea */}
      <textarea
        placeholder="Paste LLM JSON output here…"
        value={raw}
        onInput={(e) => {
          setRaw((e.target as HTMLTextAreaElement).value);
          setState('idle');
          setValidationErrors([]);
          setErrorMsg('');
          setUploadResult(null);
          setPreviewEntries(null);
          setReportedTotal(null);
        }}
        rows={12}
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#1A4DB8] resize-y"
      />

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm space-y-1">
          <div class="font-semibold text-red-700 mb-1">Validation errors:</div>
          {validationErrors.map((err, i) => (
            <div key={i} class="text-red-600">
              <span class="font-mono text-xs bg-red-100 px-1 rounded">{err.path}</span>{' '}
              {err.message}
            </div>
          ))}
        </div>
      )}

      {/* Generic error */}
      {state === 'error' && errorMsg && (
        <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Validate-only preview */}
      {previewEntries && (() => {
        const actualTotal = previewEntries.reduce((sum, e) => sum + e.positions.length, 0);
        const mismatch = reportedTotal !== null && reportedTotal !== actualTotal;
        return (
          <div class={`border rounded-lg p-3 text-sm ${mismatch ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-[#E6ECF6] border-[#99B3DB] text-[#001C6A]'}`}>
            <div class="font-semibold mb-1">
              ✓ JSON is valid — {actualTotal} positions across {previewEntries.length} {previewEntries.length === 1 ? 'country entry' : 'country entries'}
              {reportedTotal !== null && (
                <span class={mismatch ? ' text-yellow-700' : ''}>
                  {' '}(reported total: {reportedTotal}{mismatch ? ' — MISMATCH' : ''})
                </span>
              )}
            </div>
            <ul class="space-y-0.5 text-xs">
              {previewEntries.map((e, i) => (
                <li key={i}>
                  <span class="font-medium">{e.company_name}</span> · {e.country} · {e.positions.length} positions
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {/* Upload result */}
      {state === 'success' && uploadResult && (
        <div class="space-y-2">
          {uploadResult.results.length > 0 && (
            <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <div class="font-semibold mb-1">✓ Uploaded successfully:</div>
              <ul class="space-y-0.5 text-xs">
                {uploadResult.results.map((r, i) => (
                  <li key={i}>
                    <span class="font-medium">{r.company}</span> · {r.country} · {r.positions} positions
                  </li>
                ))}
              </ul>
            </div>
          )}
          {uploadResult.errors.length > 0 && (
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <div class="font-semibold mb-1">Some entries failed:</div>
              <ul class="space-y-0.5 text-xs">
                {uploadResult.errors.map((e, i) => (
                  <li key={i}>
                    <span class="font-medium">{e.company}</span> · {e.country}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div class="flex gap-3">
        <button
          onClick={handleValidateOnly}
          disabled={!raw.trim() || isLoading}
          class="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Validate
        </button>
        <button
          onClick={handleUpload}
          disabled={!raw.trim() || isLoading}
          class="bg-[#002EA2] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#002383] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Uploading…' : 'Upload to Supabase'}
        </button>
      </div>
    </div>
  );
}
