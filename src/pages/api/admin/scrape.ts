import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { detectAts } from '../../../lib/ats/detector';
import { fetchGreenhouseJobs, fetchGreenhouseCompanyName } from '../../../lib/ats/greenhouse';
import { fetchLeverJobs, fetchLeverCompanyName } from '../../../lib/ats/lever';
import { fetchAshbyJobsAndCompanyName } from '../../../lib/ats/ashby';
import { fetchWorkableCompanyName, fetchWorkableJobs, enrichWorkableDescriptions } from '../../../lib/ats/workable';
import { parseWorkdayUrl, fetchWorkdayJobs, enrichWorkdayDescriptions } from '../../../lib/workday';
import { lookupCountryFromLocation, extractCitiesForCountry, extractWorkModelFromLocation, getCompanyCountryFallback } from '../../../lib/ats/country-lookup';
import { classifyJobVerbose } from '../../../lib/classifier';
import { logScrapeRun, type PositionLogEntry } from '../../../lib/scrape-logger';
import type { RawJob, ScrapeResult, ScrapeCountryGroup, AtsType } from '../../../lib/ats/types';
import { COMPANY_APIS } from '../../../lib/ats/company-apis';
import { fetchCompanyApiJobs, enrichDescriptions } from '../../../lib/ats/company-api-fetcher';
import { TRACKED_COUNTRY_CODES } from '../../../lib/tracked-countries';

const PYTHON_TIMEOUT_MS = 600_000; // 10 min — njoyn scrapes 9 countries sequentially

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (typeof body !== 'object' || body === null || !('url' in body) || typeof (body as { url: unknown }).url !== 'string') {
    return json({ error: 'Missing required field: url' }, 400);
  }

  const url = (body as { url: string }).url.trim();
  if (!url) return json({ error: 'url must not be empty' }, 400);

  try {
    const result = await scrape(url);
    return json(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown scrape error';
    logScrapeRun({
      companyName: url,
      careerUrl: url,
      ats: null,
      positions: [],
      skippedUnknownLocation: 0,
      skippedUntrackedCountry: 0,
      error: message,
    });
    return json({ error: message }, 500);
  }
};

async function scrape(careerUrl: string): Promise<ScrapeResult> {
  const detection = detectAts(careerUrl);

  let rawJobs: RawJob[] = [];
  let companyName = '';
  let ats: AtsType | null = null;
  let layer1Error: string | null = null;

  // Layer 1.5 hostname — compute early so we can skip probeAts when a company API is configured
  const careerHostname = (() => { try { return new URL(careerUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } })();
  const hasCompanyApiConfig = careerHostname in COMPANY_APIS;

  // Resolve ATS: use detected ATS or probe known APIs when only a slug was found.
  // Skip probing if we already have a dedicated company API config for this hostname.
  let resolvedAts = detection.ats;
  if (!resolvedAts && detection.companySlug && !hasCompanyApiConfig) {
    resolvedAts = await probeAts(detection.companySlug);
  }

  // Layer 1: ATS API
  if (resolvedAts && detection.companySlug) {
    try {
      if (resolvedAts === 'greenhouse') {
        [rawJobs, companyName] = await Promise.all([
          fetchGreenhouseJobs(detection.companySlug),
          fetchGreenhouseCompanyName(detection.companySlug),
        ]);
        ats = 'greenhouse';

      } else if (resolvedAts === 'lever') {
        [rawJobs, companyName] = await Promise.all([
          fetchLeverJobs(detection.companySlug),
          fetchLeverCompanyName(detection.companySlug),
        ]);
        ats = 'lever';

      } else if (resolvedAts === 'ashby') {
        ({ jobs: rawJobs, companyName } = await fetchAshbyJobsAndCompanyName(detection.companySlug));
        ats = 'ashby';

      } else if (resolvedAts === 'workday') {
        const parts = parseWorkdayUrl(careerUrl);
        if (!parts) throw new Error('Could not parse Workday URL');
        rawJobs = await fetchWorkdayJobs(parts);
        await enrichWorkdayDescriptions(rawJobs);
        companyName = parts.company.charAt(0).toUpperCase() + parts.company.slice(1);
        ats = 'workday';

      } else if (resolvedAts === 'workable') {
        const [jobs, name] = await Promise.all([
          fetchWorkableJobs(detection.companySlug),
          fetchWorkableCompanyName(detection.companySlug),
        ]);

        if (!jobs.length) {
          throw new Error('Workable returned no jobs');
        }
        const trackedJobs = jobs.filter((job) => {
          const locationStr = job.country_code ?? job.location ?? '';
          return lookupCountryFromLocation(locationStr).some((c) => TRACKED_COUNTRY_CODES.has(c.code));
        });
        await enrichWorkableDescriptions(trackedJobs, detection.companySlug);
        rawJobs = jobs;
        companyName = name;
        ats = 'workable';
      }
    } catch (err) {
      layer1Error = err instanceof Error ? err.message : String(err);
      console.warn(`Layer 1 (${resolvedAts}) failed: ${layer1Error}`);
      rawJobs = [];
    }
  }

  // Layer 1.5: per-company API config (fallback if Layer 1 yielded nothing)
  if (rawJobs.length === 0) {
    const companyApiConfig = COMPANY_APIS[careerHostname];
    if (companyApiConfig) {
      try {
        rawJobs = await fetchCompanyApiJobs(
          companyApiConfig,
          (location) => lookupCountryFromLocation(location).some((c) => TRACKED_COUNTRY_CODES.has(c.code)),
        );
        if (rawJobs.length > 0) {
          companyName = companyApiConfig.companyName ?? careerHostname;
          ats = 'company-api';
        }
      } catch (err) {
        const cause = err instanceof Error && (err as NodeJS.ErrnoException).cause;
        const causeDetail = cause instanceof AggregateError
          ? cause.errors.map((e: unknown) => String(e)).join(', ')
          : cause ? String(cause) : '';
        console.warn(`Layer 1.5 (company API) failed for ${careerHostname}:`, err instanceof Error ? err.message : err, causeDetail ? `(cause: ${causeDetail})` : '');
      }
    }
  }

  // Layer 2: Python scraper (fallback if Layer 1 and 1.5 yielded nothing)
  if (rawJobs.length === 0) {
    const scraperPath = join(process.cwd(), 'scraper', 'main.py');
    if (!existsSync(scraperPath)) {
      const reason = layer1Error
        ? `ATS API failed: ${layer1Error}`
        : detection.ats
        ? `${detection.ats} API returned no jobs`
        : 'No supported ATS detected';
      throw new Error(
        `${reason}. Python scraper not found at scraper/main.py — set it up to enable page scraping.`,
      );
    }
    rawJobs = await runPythonScraper(scraperPath, careerUrl);
    ats = 'python';
    await enrichDescriptions(rawJobs);
  }

  if (rawJobs.length === 0) {
    throw new Error('No job listings found. The page may require a login or have no open positions.');
  }

  // Fall back to the slug extracted from the hostname (e.g. "tieto" → "Tieto").
  // The admin can correct it in the review UI before uploading.
  if (!companyName && detection.companySlug) {
    companyName = detection.companySlug.charAt(0).toUpperCase() + detection.companySlug.slice(1);
  }

  return buildScrapeResult(rawJobs, companyName, careerUrl, ats);
}

function buildScrapeResult(
  rawJobs: RawJob[],
  companyName: string,
  careerUrl: string,
  ats: AtsType | null,
): ScrapeResult {
  const groups = new Map<string, ScrapeCountryGroup>();
  let skipped = 0;
  let skippedUntracked = 0;
  const positionLogs: PositionLogEntry[] = [];

  const companyFallbackCountry = getCompanyCountryFallback(careerUrl);

  for (const job of rawJobs) {
    // Use country_code when the scraper already resolved it (e.g. njoyn country filter),
    // otherwise fall back to free-text location lookup.
    const locationStr = job.country_code ?? job.location ?? '';
    let countries = lookupCountryFromLocation(locationStr);

    // If location lookup failed, use the company-level country fallback (e.g. Posti = Finland).
    if (countries.length === 0 && companyFallbackCountry) {
      countries = [companyFallbackCountry];
    }

    const trackedCountries = countries.filter((c) => TRACKED_COUNTRY_CODES.has(c.code));

    if (countries.length === 0) {
      skipped++;
      continue;
    }
    if (trackedCountries.length === 0) {
      skippedUntracked++;
      continue;
    }

    for (const countryInfo of trackedCountries) {
      const { classified, signals } = classifyJobVerbose(job, countryInfo.code);
      // Scraper-provided explicit language data overrides the classifier.
      if (job.requires_native_language !== undefined) {
        classified.requires_native_language = job.requires_native_language;
      }

      const cities = job.cities
        ?? (job.city ? [job.city] : extractCitiesForCountry(job.location ?? '', countryInfo.code));
      const workModel = job.work_model ?? extractWorkModelFromLocation(job.location ?? '');

      positionLogs.push({
        title: classified.title,
        category: classified.category,
        categorySignal: signals.categorySignal,
        categorySource: signals.categorySource,
        requires_native_language: classified.requires_native_language,
        local_language_advantage: classified.local_language_advantage,
        requiredLanguages: classified.requiredLanguages,
        preferredLanguages: classified.preferredLanguages,
        languageSignals: signals.languageSignals,
        countryCode: countryInfo.code,
        countryName: countryInfo.name,
        city: cities.length > 0 ? cities : undefined,
        work_model: workModel ?? undefined,
      });

      if (!groups.has(countryInfo.code)) {
        groups.set(countryInfo.code, {
          country: countryInfo.slug,
          country_name: countryInfo.name,
          country_code: countryInfo.code,
          jobs: [],
        });
      }
      groups.get(countryInfo.code)!.jobs.push({
        ...classified,
        city: cities.length > 0 ? cities : undefined,
        work_model: workModel ?? undefined,
      });
    }
  }

  logScrapeRun({
    companyName,
    careerUrl,
    ats,
    positions: positionLogs,
    skippedUnknownLocation: skipped,
    skippedUntrackedCountry: skippedUntracked,
  });

  return {
    ats,
    company_name: companyName,
    career_page_url: careerUrl,
    skipped_unknown_location: skipped,
    skipped_untracked_country: skippedUntracked,
    countries: Array.from(groups.values()),
  };
}

// ─── Render migration path ────────────────────────────────────────────────────
// Currently this function spawns a local Python subprocess (devcontainer dev).
//
// To move the Python scraper to a Render-hosted service instead:
//
// 1. Deploy scraper/app.py to Render (see that file for full instructions).
//
// 2. Set SCRAPER_SERVICE_URL in your Vercel environment variables
//    (e.g. https://your-scraper.onrender.com).
//
// 3. Replace the function body below with an HTTP call:
//
//    const scraperServiceUrl = import.meta.env.SCRAPER_SERVICE_URL as string | undefined;
//    if (!scraperServiceUrl) throw new Error('SCRAPER_SERVICE_URL is not set');
//    const res = await fetch(`${scraperServiceUrl}/scrape`, {
//      method: 'POST',
//      headers: {
//        'Content-Type': 'application/json',
//        'x-scraper-secret': import.meta.env.SCRAPER_SECRET ?? '',
//      },
//      body: JSON.stringify({ url }),
//      signal: AbortSignal.timeout(PYTHON_TIMEOUT_MS),
//    });
//    if (!res.ok) throw new Error(await res.text());
//    return res.json() as Promise<RawJob[]>;
//
// 4. Keep the subprocess fallback for local dev by checking:
//    if (scraperServiceUrl) { /* HTTP call */ } else { /* spawn below */ }
//
// ─────────────────────────────────────────────────────────────────────────────
function runPythonScraper(scraperPath: string, url: string): Promise<RawJob[]> {
  return new Promise((resolve, reject) => {
    // Check venv locations in order: system-installed (Docker), local dev fallback
    const venvCandidates = [
      '/opt/scraper-venv/bin/python3',
      join(process.cwd(), 'scraper', '.venv', 'bin', 'python3'),
    ];
    const pythonBin = venvCandidates.find(existsSync) ?? 'python3';

    console.log('[python-scraper] command:', pythonBin, scraperPath, url);

    const env: Record<string, string> = { ...process.env as Record<string, string> };
    // import.meta.env is Vite's env store — .env vars land here but may not reach process.env
    const cdpUrl = process.env.PLAYWRIGHT_CDP_URL ?? (import.meta.env.PLAYWRIGHT_CDP_URL as string | undefined);
    if (cdpUrl) {
      env.PLAYWRIGHT_CDP_URL = cdpUrl;
    }

    const py = spawn(pythonBin, [scraperPath, url], {
      timeout: PYTHON_TIMEOUT_MS,
      env,
    });

    let stdout = '';
    let stderr = '';

    py.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    py.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    py.on('close', (code) => {
      console.log('[python-scraper] exit code:', code);
      console.log('[python-scraper] stderr:', stderr.trim() || '(empty)');
      console.log('[python-scraper] stdout:', stdout.trim() || '(empty)');

      if (code !== 0) {
        reject(new Error(`Python scraper exited with code ${code}. ${stderr.trim()}`));
        return;
      }
      try {
        const jobs = JSON.parse(stdout) as RawJob[];
        const result = Array.isArray(jobs) ? jobs : [];
        console.log('[python-scraper] parsed jobs:', result.length);
        resolve(result);
      } catch {
        reject(new Error(`Python scraper returned invalid JSON. ${stderr.trim()}`));
      }
    });

    py.on('error', (err) => {
      console.log('[python-scraper] spawn error:', err.message);
      reject(new Error(`Could not start Python scraper: ${err.message}`));
    });
  });
}

/** Try Greenhouse, Lever, and Ashby APIs to see which one recognises the slug. */
async function probeAts(slug: string): Promise<'greenhouse' | 'lever' | 'ashby' | 'workable' | null> {
  const [ghRes, lvRes, ashbyRes, workableRes] = await Promise.allSettled([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`, { method: 'HEAD' }),
    fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?limit=1`, { method: 'HEAD' }),
    fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`, { method: 'GET' }),
    fetch(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`, { method: 'GET' }),
  ]);
  if (ghRes.status === 'fulfilled' && ghRes.value.ok) return 'greenhouse';
  if (lvRes.status === 'fulfilled' && lvRes.value.ok) return 'lever';
  // Ashby returns 200 with {"jobs":[],"apiVersion":"1"} for unknown slugs — only match if jobs are present
  if (ashbyRes.status === 'fulfilled' && ashbyRes.value.ok) {
    try {
      const data = await ashbyRes.value.json() as { jobs?: unknown[] };
      if (Array.isArray(data.jobs) && data.jobs.length > 0) return 'ashby';
    } catch { /* ignore */ }
  }
  // Workable returns 200 with {"jobs":[]} for accounts with no open positions — only match if jobs are present
  if (workableRes.status === 'fulfilled' && workableRes.value.ok) {
    try {
      const data = await workableRes.value.json() as { jobs?: unknown[] };
      if (Array.isArray(data.jobs) && data.jobs.length > 0) return 'workable';
    } catch { /* ignore */ }
  }
  return null;
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
