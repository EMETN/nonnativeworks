import { useState, useEffect } from 'preact/hooks';
import { CATEGORIES } from '../../lib/categories';
import { atsLabel } from '../../lib/ats/detector';

// ---------------------------------------------------------------------------
// Types mirroring ScrapeResult from the API
// ---------------------------------------------------------------------------

interface ReviewJob {
  title: string;
  url?: string;
  city?: string[];
  work_model?: 'remote' | 'hybrid' | 'on-site';
  category: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
  requiredLanguages: string[];
  preferredLanguages: string[];
}

interface ReviewCountryGroup {
  country: string;
  country_name: string;
  country_code: string;
  jobs: ReviewJob[];
}

interface ReviewData {
  ats: string | null;
  company_name: string;
  career_page_url: string;
  skipped_unknown_location: number;
  skipped_untracked_country: number;
  is_english_company: boolean;
  countries: ReviewCountryGroup[];
}

interface UploadResult {
  results: { company: string; country: string; positions: number }[];
  errors: { company: string; country: string; error: string }[];
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'scraping' }
  | { kind: 'review'; data: ReviewData }
  | { kind: 'uploading' }
  | { kind: 'done'; uploadResult: UploadResult }
  | { kind: 'error'; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidUrl(value: string): boolean {
  try {
    const p = new URL(value);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

function totalJobs(countries: ReviewCountryGroup[]): number {
  return countries.reduce((sum, g) => sum + g.jobs.length, 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Scraper() {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  // Listen for prefill requests from DataManager's "Update" button
  useEffect(() => {
    // Check sessionStorage first (handles the case where the event fired before mount)
    const stored = sessionStorage.getItem('scraper-prefill-url');
    if (stored) {
      setUrl(stored);
      sessionStorage.removeItem('scraper-prefill-url');
    }

    const handler = (e: Event) => {
      const prefillUrl = (e as CustomEvent<{ url: string }>).detail?.url;
      if (prefillUrl) {
        setUrl(prefillUrl);
        setPhase({ kind: 'idle' });
        setUrlError('');
      }
    };
    window.addEventListener('scraper-prefill', handler);
    return () => window.removeEventListener('scraper-prefill', handler);
  }, []);

  // ---- Scrape ----

  async function handleScrape() {
    let trimmed = url.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      trimmed = `https://${trimmed}`;
      setUrl(trimmed);
    }
    if (!isValidUrl(trimmed)) {
      setUrlError('Please enter a valid URL (e.g. company.com/careers)');
      return;
    }
    setUrlError('');
    setPhase({ kind: 'scraping' });

    try {
      const res = await fetch('/api/admin/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ kind: 'error', message: data.error ?? 'Scrape failed' });
        return;
      }
      setPhase({
        kind: 'review',
        data: {
          ats: data.ats,
          company_name: data.company_name ?? '',
          career_page_url: data.career_page_url ?? trimmed,
          skipped_unknown_location: data.skipped_unknown_location ?? 0,
          skipped_untracked_country: data.skipped_untracked_country ?? 0,
          is_english_company: false,
          countries: data.countries ?? [],
        },
      });
    } catch {
      setPhase({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  // ---- Review edits ----

  function setReviewData(updater: (prev: ReviewData) => ReviewData) {
    setPhase((prev) =>
      prev.kind === 'review' ? { kind: 'review', data: updater(prev.data) } : prev,
    );
  }

  function setCompanyName(name: string) {
    setReviewData((d) => ({ ...d, company_name: name }));
  }

  function setIsEnglishCompany(value: boolean) {
    setReviewData((d) => ({ ...d, is_english_company: value }));
  }

  function setJobField(
    countryCode: string,
    jobIndex: number,
    field: 'category' | 'requires_native_language' | 'local_language_advantage',
    value: string | boolean,
  ) {
    setReviewData((d) => ({
      ...d,
      countries: d.countries.map((g) =>
        g.country_code !== countryCode
          ? g
          : {
              ...g,
              jobs: g.jobs.map((job, i) =>
                i !== jobIndex ? job : { ...job, [field]: value },
              ),
            },
      ),
    }));
  }

  // ---- Upload ----

  async function handleUpload() {
    if (phase.kind !== 'review') return;
    const { data } = phase;

    if (!data.company_name.trim()) {
      alert('Please enter the company name before uploading.');
      return;
    }

    const payload = data.countries.map((group) => ({
      company_name: data.company_name.trim(),
      country: group.country,
      country_name: group.country_name,
      country_code: group.country_code,
      career_page_url: data.career_page_url,
      is_english_company: data.is_english_company,
      positions: group.jobs.map((job) => ({
        country_code: group.country_code,
        title: job.title,
        url: job.url,
        city: job.city,
        work_model: job.work_model,
        requires_native_language: job.requires_native_language,
        local_language_advantage: job.local_language_advantage,
        required_languages: job.requiredLanguages,
        preferred_languages: job.preferredLanguages,
        category: job.category,
      })),
    }));

    setPhase({ kind: 'uploading' });

    try {
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok && res.status !== 207) {
        setPhase({ kind: 'error', message: result.error ?? 'Upload failed' });
      } else {
        setPhase({ kind: 'done', uploadResult: result });
        setUrl('');
      }
    } catch {
      setPhase({ kind: 'error', message: 'Network error during upload.' });
    }
  }

  // ---- Reset ----

  function handleReset() {
    setPhase({ kind: 'idle' });
    setUrlError('');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class="space-y-5">
      {/* URL input — always visible unless uploading */}
      {phase.kind !== 'uploading' && phase.kind !== 'done' && (
        <div>
          <div class="flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              placeholder="company.com/careers"
              value={url}
              onInput={(e) => {
                setUrl((e.target as HTMLInputElement).value);
                if (urlError) setUrlError('');
              }}
              disabled={phase.kind === 'scraping'}
              class={`flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#12956B] disabled:bg-gray-50 ${urlError ? 'border-red-400' : 'border-gray-300'}`}
            />
            <button
              onClick={handleScrape}
              disabled={!url.trim() || phase.kind === 'scraping'}
              class="bg-[#0F7A4F] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0B5E3C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {phase.kind === 'scraping' ? 'Scraping…' : 'Scrape jobs'}
            </button>
          </div>
          {urlError && <p class="text-xs text-red-500 mt-1">{urlError}</p>}
        </div>
      )}

      {/* Scraping spinner */}
      {phase.kind === 'scraping' && (
        <div class="text-sm text-gray-500 flex items-center gap-2">
          <span class="inline-block w-4 h-4 border-2 border-[#12956B] border-t-transparent rounded-full animate-spin" />
          Fetching jobs…
        </div>
      )}

      {/* Error */}
      {phase.kind === 'error' && (
        <div class="space-y-3">
          <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {phase.message}
          </div>
          <button
            onClick={handleReset}
            class="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Review */}
      {phase.kind === 'review' && (
        <ReviewPanel
          data={phase.data}
          onCompanyName={setCompanyName}
          onIsEnglishCompany={setIsEnglishCompany}
          onJobField={setJobField}
          onUpload={handleUpload}
          onReset={handleReset}
        />
      )}

      {/* Uploading */}
      {phase.kind === 'uploading' && (
        <div class="text-sm text-gray-500 flex items-center gap-2">
          <span class="inline-block w-4 h-4 border-2 border-[#12956B] border-t-transparent rounded-full animate-spin" />
          Uploading to Supabase…
        </div>
      )}

      {/* Done */}
      {phase.kind === 'done' && (
        <div class="space-y-3">
          {phase.uploadResult.results.length > 0 && (
            <div class="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <div class="font-semibold mb-1">Uploaded successfully:</div>
              <ul class="space-y-0.5 text-xs">
                {phase.uploadResult.results.map((r, i) => (
                  <li key={i}>
                    <span class="font-medium">{r.company}</span> · {r.country} · {r.positions} positions
                  </li>
                ))}
              </ul>
            </div>
          )}
          {phase.uploadResult.errors.length > 0 && (
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <div class="font-semibold mb-1">Some entries failed:</div>
              <ul class="space-y-0.5 text-xs">
                {phase.uploadResult.errors.map((e, i) => (
                  <li key={i}>
                    <span class="font-medium">{e.company}</span> · {e.country}: {e.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={handleReset}
            class="text-sm text-[#0F7A4F] hover:text-[#084A2F] underline"
          >
            Scrape another company
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review panel
// ---------------------------------------------------------------------------

interface ReviewPanelProps {
  data: ReviewData;
  onCompanyName: (name: string) => void;
  onIsEnglishCompany: (v: boolean) => void;
  onJobField: (
    countryCode: string,
    jobIndex: number,
    field: 'category' | 'requires_native_language' | 'local_language_advantage',
    value: string | boolean,
  ) => void;
  onUpload: () => void;
  onReset: () => void;
}

function ReviewPanel({
  data,
  onCompanyName,
  onIsEnglishCompany,
  onJobField,
  onUpload,
  onReset,
}: ReviewPanelProps) {
  const total = totalJobs(data.countries);
  const hasSkipped = data.skipped_unknown_location > 0;
  const hasUntracked = data.skipped_untracked_country > 0;

  return (
    <div class="space-y-5">
      {/* Summary bar */}
      <div class="flex flex-wrap items-center gap-2 text-sm">
        {data.ats && (
          <span class="bg-green-100 text-[#0B5E3C] rounded-full px-2.5 py-0.5 text-xs font-medium">
            {atsLabel(data.ats)}
          </span>
        )}
        <span class="text-gray-700 font-medium">
          {total} {total === 1 ? 'job' : 'jobs'} across {data.countries.length}{' '}
          {data.countries.length === 1 ? 'country' : 'countries'}
        </span>
        {hasSkipped && (
          <span class="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 text-xs font-medium">
            {data.skipped_unknown_location} skipped (unknown location)
          </span>
        )}
        {hasUntracked && (
          <span class="bg-gray-100 text-gray-600 rounded-full px-2.5 py-0.5 text-xs font-medium">
            {data.skipped_untracked_country} skipped (untracked country)
          </span>
        )}
      </div>

      {/* Company metadata */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Company name</label>
          <input
            type="text"
            value={data.company_name}
            onInput={(e) => onCompanyName((e.target as HTMLInputElement).value)}
            placeholder="Enter company name"
            class={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#12956B] ${!data.company_name.trim() ? 'border-red-300' : 'border-gray-300'}`}
          />
          {!data.company_name.trim() && (
            <p class="text-xs text-red-500 mt-1">Required before uploading</p>
          )}
        </div>
        <div class="flex items-end pb-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={data.is_english_company}
              onChange={(e) => onIsEnglishCompany((e.target as HTMLInputElement).checked)}
            />
            English company (US/UK-headquartered)
          </label>
        </div>
      </div>

      {/* Country groups */}
      {data.countries.map((group) => (
        <CountryGroup
          key={group.country_code}
          group={group}
          onJobField={(jobIndex, field, value) =>
            onJobField(group.country_code, jobIndex, field, value)
          }
        />
      ))}

      {/* Actions */}
      <div class="flex gap-3 pt-1">
        <button
          onClick={onUpload}
          disabled={!data.company_name.trim() || total === 0}
          class="bg-[#0F7A4F] text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-[#0B5E3C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Upload {total} {total === 1 ? 'position' : 'positions'} to Supabase
        </button>
        <button
          onClick={onReset}
          class="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Country group
// ---------------------------------------------------------------------------

interface CountryGroupProps {
  group: ReviewCountryGroup;
  onJobField: (
    jobIndex: number,
    field: 'category' | 'requires_native_language' | 'local_language_advantage',
    value: string | boolean,
  ) => void;
}

function CountryGroup({ group, onJobField }: CountryGroupProps) {
  return (
    <div class="border border-gray-200 rounded-xl overflow-hidden">
      <div class="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <span class="font-medium text-sm text-gray-800">{group.country_name}</span>
        <span class="text-xs text-gray-400">{group.country_code}</span>
        <span class="text-xs text-gray-500 ml-auto">{group.jobs.length} positions</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100 bg-white">
              <th class="text-left px-4 py-2 font-medium text-gray-500 w-1/2">Title</th>
              <th class="text-left px-4 py-2 font-medium text-gray-500">Category</th>
              <th class="text-left px-4 py-2 font-medium text-gray-500 whitespace-nowrap">
                Local language
              </th>
            </tr>
          </thead>
          <tbody>
            {group.jobs.map((job, i) => (
              <JobRow
                key={i}
                job={job}
                onCategory={(v) => onJobField(i, 'category', v)}
                onLanguage={(status) => {
                  onJobField(i, 'requires_native_language', status === 'required');
                  onJobField(i, 'local_language_advantage', status === 'advantage');
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Job row
// ---------------------------------------------------------------------------

type LanguageStatus = 'required' | 'advantage' | 'neither';

interface JobRowProps {
  job: ReviewJob;
  onCategory: (v: string) => void;
  onLanguage: (status: LanguageStatus) => void;
}

function JobRow({ job, onCategory, onLanguage }: JobRowProps) {
  const langStatus: LanguageStatus = job.requires_native_language
    ? 'required'
    : job.local_language_advantage
      ? 'advantage'
      : 'neither';

  return (
    <tr class="border-b border-gray-50 last:border-0 bg-white">
      <td class="px-4 py-2 text-gray-800">
        {job.url ? (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            class="hover:underline text-[#0B5E3C]"
          >
            {job.title}
          </a>
        ) : (
          job.title
        )}
      </td>
      <td class="px-4 py-2">
        <select
          value={job.category}
          onChange={(e) => onCategory((e.target as HTMLSelectElement).value)}
          class="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#12956B]"
        >
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td class="px-4 py-2">
        <div class="flex items-center gap-3">
          {(['required', 'advantage', 'neither'] as LanguageStatus[]).map((status) => (
            <label key={status} class="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                checked={langStatus === status}
                onChange={() => onLanguage(status)}
              />
              <span class="text-gray-600 capitalize">
                {status === 'required' ? 'Required' : status === 'advantage' ? 'Advantage' : 'None'}
              </span>
            </label>
          ))}
        </div>
      </td>
    </tr>
  );
}
