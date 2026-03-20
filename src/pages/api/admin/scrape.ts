import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { detectAts } from '../../../lib/ats/detector';
import { fetchGreenhouseJobs, fetchGreenhouseCompanyName } from '../../../lib/ats/greenhouse';
import { fetchLeverJobs, fetchLeverCompanyName } from '../../../lib/ats/lever';
import { fetchAshbyJobsAndCompanyName } from '../../../lib/ats/ashby';
import { lookupCountryFromLocation } from '../../../lib/ats/country-lookup';
import { classifyJob } from '../../../lib/classifier';
import type { RawJob, ScrapeResult, ScrapeCountryGroup, AtsType } from '../../../lib/ats/types';
import { COMPANY_APIS } from '../../../lib/ats/company-apis';
import { fetchCompanyApiJobs } from '../../../lib/ats/company-api-fetcher';
import { TRACKED_COUNTRY_CODES } from '../../../lib/tracked-countries';

const PYTHON_TIMEOUT_MS = 60_000;

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
    return json({ error: message }, 500);
  }
};

async function scrape(careerUrl: string): Promise<ScrapeResult> {
  const detection = detectAts(careerUrl);

  let rawJobs: RawJob[] = [];
  let companyName = '';
  let ats: AtsType | null = null;
  let layer1Error: string | null = null;

  // Resolve ATS: use detected ATS or probe known APIs when only a slug was found
  let resolvedAts = detection.ats;
  if (!resolvedAts && detection.companySlug) {
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
      }
    } catch (err) {
      layer1Error = err instanceof Error ? err.message : String(err);
      console.warn(`Layer 1 (${resolvedAts}) failed: ${layer1Error}`);
      rawJobs = [];
    }
  }

  // Layer 1.5: per-company API config (fallback if Layer 1 yielded nothing)
  if (rawJobs.length === 0) {
    const hostname = (() => { try { return new URL(careerUrl).hostname.toLowerCase(); } catch { return ''; } })();
    const companyApiConfig = COMPANY_APIS[hostname];
    if (companyApiConfig) {
      try {
        rawJobs = await fetchCompanyApiJobs(companyApiConfig);
        if (rawJobs.length > 0) {
          companyName = companyApiConfig.companyName ?? hostname;
          ats = 'company-api';
        }
      } catch (err) {
        console.warn(`Layer 1.5 (company API) failed for ${hostname}:`, err instanceof Error ? err.message : err);
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
  }

  if (rawJobs.length === 0) {
    throw new Error('No job listings found. The page may require a login or have no open positions.');
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
  let lowConfidenceCount = 0;

  for (const job of rawJobs) {
    const countryInfo = lookupCountryFromLocation(job.location ?? '');
    if (!countryInfo) {
      skipped++;
      continue;
    }

    if (!TRACKED_COUNTRY_CODES.has(countryInfo.code)) {
      skippedUntracked++;
      continue;
    }

    const classified = classifyJob(job, countryInfo.code);
    if (classified.confidence === 'low') lowConfidenceCount++;

    if (!groups.has(countryInfo.code)) {
      groups.set(countryInfo.code, {
        country: countryInfo.slug,
        country_name: countryInfo.name,
        country_code: countryInfo.code,
        jobs: [],
      });
    }
    groups.get(countryInfo.code)!.jobs.push(classified);
  }

  return {
    ats,
    company_name: companyName,
    career_page_url: careerUrl,
    low_confidence_count: lowConfidenceCount,
    skipped_unknown_location: skipped,
    skipped_untracked_country: skippedUntracked,
    countries: Array.from(groups.values()),
  };
}

function runPythonScraper(scraperPath: string, url: string): Promise<RawJob[]> {
  return new Promise((resolve, reject) => {
    const venvPython = join(process.cwd(), 'scraper', '.venv', 'bin', 'python3');
    const pythonBin = existsSync(venvPython) ? venvPython : 'python3';

    console.log('[python-scraper] command:', pythonBin, scraperPath, url);

    const py = spawn(pythonBin, [scraperPath, url], {
      timeout: PYTHON_TIMEOUT_MS,
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
async function probeAts(slug: string): Promise<'greenhouse' | 'lever' | 'ashby' | null> {
  const [ghRes, lvRes, ashbyRes] = await Promise.allSettled([
    fetch(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`, { method: 'HEAD' }),
    fetch(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?limit=1`, { method: 'HEAD' }),
    fetch(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`, { method: 'GET' }),
  ]);
  if (ghRes.status === 'fulfilled' && ghRes.value.ok) return 'greenhouse';
  if (lvRes.status === 'fulfilled' && lvRes.value.ok) return 'lever';
  if (ashbyRes.status === 'fulfilled' && ashbyRes.value.ok) return 'ashby';
  return null;
}

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
