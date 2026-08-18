import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { detectAts } from '../../../lib/ats/detector';
import {
    fetchGreenhouseJobs,
    fetchGreenhouseCompanyName,
} from '../../../lib/ats/greenhouse';
import { fetchLeverJobs, fetchLeverCompanyName } from '../../../lib/ats/lever';
import { fetchAshbyJobsAndCompanyName } from '../../../lib/ats/ashby';
import {
    fetchWorkableCompanyName,
    fetchWorkableJobs,
    enrichWorkableDescriptions,
} from '../../../lib/ats/workable';
import {
    parseWorkdayUrl,
    fetchWorkdayJobs,
    enrichWorkdayDescriptions,
} from '../../../lib/ats/workday';
import { fetchRecruiteeJobs } from '../../../lib/ats/recruitee';
import {
    lookupCountryFromLocation,
    extractCitiesForCountry,
    extractWorkModelFromLocation,
    getCompanyCountryFallback,
} from '../../../lib/ats/country-lookup';
import { classifyJobVerbose } from '../../../lib/classifier';
import { stripHtml } from '../../../lib/classifiers/language';
import type { SignalEntry } from '../../../lib/classifiers/language';
import {
    logScrapeRun,
    type PositionLogEntry,
} from '../../../lib/scrape-logger';
import type {
    RawJob,
    ScrapeResult,
    ScrapeCountryGroup,
    AtsType,
} from '../../../lib/ats/types';
import {
    COMPANY_APIS,
    CAREER_URL_ALIASES,
    COMPANY_NAME_OVERRIDES,
} from '../../../lib/ats/company-apis';
import {
    fetchCompanyApiJobs,
    enrichDescriptions,
} from '../../../lib/ats/company-api-fetcher';
import { TRACKED_COUNTRY_CODES } from '../../../lib/tracked-countries';
import {
    loadSkills,
    extractSkills,
    extractEducationRequirement,
    type SkillEntry,
} from '../../../lib/ats/skills-extractor';
import {
    load as loadOutcomeCache,
    get as getOutcome,
    set as setOutcome,
    flush as flushOutcomeCache,
    cachedUrls as getOutcomeCachedUrls,
    titleHash,
    CLASSIFIER_VERSION,
} from '../../../lib/outcome-cache';

export const prerender = false;

// Must exceed Python's internal NJOYN_SUBPROCESS_TIMEOUT (3600s) so Python can handle
// its own cleanup and exit cleanly. SIGKILL ensures the process cannot ignore the signal
// (Python's multiprocessing.Queue.get blocks SIGTERM, causing Node to wait indefinitely).
const PYTHON_TIMEOUT_MS = 3_900_000; // 65 min
const OUTCOME_CACHE_PATH = join(process.cwd(), 'cache', 'outcomes.json');

// Batch scraping spawns many Python subprocesses over the lifetime of the server
// process. Each spawn registers internal cleanup listeners on the Node.js process
// object, which triggers the default MaxListeners warning (10) after a handful of
// companies. Raise the limit to avoid the noise; this is not a memory leak.
process.setMaxListeners(50);

export const POST: APIRoute = async ({ request }) => {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON body' }, 400);
    }

    if (
        typeof body !== 'object' ||
        body === null ||
        !('url' in body) ||
        typeof (body as { url: unknown }).url !== 'string'
    ) {
        return json({ error: 'Missing required field: url' }, 400);
    }

    const url = (body as { url: string }).url.trim();
    if (!url) return json({ error: 'url must not be empty' }, 400);

    try {
        const result = await scrape(url);
        return json(result, 200);
    } catch (err) {
        const message =
            err instanceof Error ? err.message : 'Unknown scrape error';
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

async function scrape(rawUrl: string): Promise<ScrapeResult> {
    // Load skills taxonomy once for this scrape run — used to extract skills from descriptions.
    const skills: SkillEntry[] = await loadSkills();
    loadOutcomeCache(OUTCOME_CACHE_PATH);
    // Remap friendly branded career URLs (e.g. careers.abb) to the actual ATS URL.
    const urlHostname = (() => {
        try {
            return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
        } catch {
            return '';
        }
    })();
    const careerUrl = CAREER_URL_ALIASES[urlHostname] ?? rawUrl;

    const detection = detectAts(careerUrl);

    let rawJobs: RawJob[] = [];
    let companyName = '';
    let ats: AtsType | null = null;
    let layer1Error: string | null = null;

    // Layer 1.5 hostname — compute early so we can skip probeAts when a company API is configured
    const careerHostname = (() => {
        try {
            return new URL(careerUrl).hostname
                .toLowerCase()
                .replace(/^www\./, '');
        } catch {
            return '';
        }
    })();
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
                    fetchLeverJobs(detection.companySlug, {
                        eu: detection.leverEu,
                    }),
                    fetchLeverCompanyName(detection.companySlug),
                ]);
                ats = 'lever';
            } else if (resolvedAts === 'ashby') {
                ({ jobs: rawJobs, companyName } =
                    await fetchAshbyJobsAndCompanyName(detection.companySlug));
                ats = 'ashby';
            } else if (resolvedAts === 'workday') {
                const parts = parseWorkdayUrl(careerUrl);
                if (!parts) throw new Error('Could not parse Workday URL');
                rawJobs = await fetchWorkdayJobs(parts);
                // Only enrich descriptions for tracked-country jobs — avoids fetching HTML for
                // thousands of untracked jobs when the company has a large global listing (e.g. ABB).
                const workdayTracked = rawJobs.filter((job) => {
                    const loc = job.country_code ?? job.location ?? '';
                    return lookupCountryFromLocation(loc).some((c) =>
                        TRACKED_COUNTRY_CODES.has(c.code),
                    );
                });
                await enrichWorkdayDescriptions(
                    workdayTracked,
                    getOutcomeCachedUrls(),
                );
                companyName =
                    parts.company.charAt(0).toUpperCase() +
                    parts.company.slice(1);
                ats = 'workday';
            } else if (resolvedAts === 'recruitee') {
                ({ jobs: rawJobs, companyName } = await fetchRecruiteeJobs(
                    detection.companySlug,
                ));
                ats = 'recruitee';
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
                    return lookupCountryFromLocation(locationStr).some((c) =>
                        TRACKED_COUNTRY_CODES.has(c.code),
                    );
                });
                await enrichWorkableDescriptions(
                    trackedJobs,
                    detection.companySlug,
                    getOutcomeCachedUrls(),
                );
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
                    (location) =>
                        lookupCountryFromLocation(location).some((c) =>
                            TRACKED_COUNTRY_CODES.has(c.code),
                        ),
                    getOutcomeCachedUrls(),
                );
                if (rawJobs.length > 0) {
                    companyName =
                        companyApiConfig.companyName ?? careerHostname;
                    ats = 'company-api';
                }
            } catch (err) {
                const cause =
                    err instanceof Error &&
                    (err as NodeJS.ErrnoException).cause;
                const causeDetail =
                    cause instanceof AggregateError
                        ? cause.errors.map((e: unknown) => String(e)).join(', ')
                        : cause
                          ? String(cause)
                          : '';
                console.warn(
                    `Layer 1.5 (company API) failed for ${careerHostname}:`,
                    err instanceof Error ? err.message : err,
                    causeDetail ? `(cause: ${causeDetail})` : '',
                );
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
        await enrichDescriptions(
            rawJobs,
            undefined,
            undefined,
            getOutcomeCachedUrls(),
        );
    }

    const goneBefore = rawJobs.length;
    rawJobs = rawJobs.filter((j) => !j._gone);
    if (rawJobs.length < goneBefore) {
        console.log(
            `[scrape] dropped ${goneBefore - rawJobs.length} expired jobs (404/410)`,
        );
    }

    if (rawJobs.length === 0 && layer1Error) {
        // An ATS API that errored is a real failure, not an empty page. Without
        // layer1Error, zero jobs means the layers ran cleanly and found nothing.
        throw new Error(layer1Error);
    }

    // Fall back to a configured display name for known Python-scraped companies,
    // then to the slug extracted from the hostname (e.g. "tieto" → "Tieto").
    // The admin can correct it in the review UI before uploading.
    const lower = careerUrl.toLowerCase();
    const nameOverride = COMPANY_NAME_OVERRIDES.find((e) =>
        lower.includes(e.urlSubstring.toLowerCase()),
    );
    if (nameOverride) {
        companyName = nameOverride.name;
    } else if (!companyName) {
        if (detection.companySlug) {
            companyName =
                detection.companySlug.charAt(0).toUpperCase() +
                detection.companySlug.slice(1);
        }
    }

    return buildScrapeResult(rawJobs, companyName, careerUrl, ats, skills);
}

function buildScrapeResult(
    rawJobs: RawJob[],
    companyName: string,
    careerUrl: string,
    ats: AtsType | null,
    skills: SkillEntry[],
): ScrapeResult {
    const groups = new Map<string, ScrapeCountryGroup>();
    let skipped = 0;
    let skippedUntracked = 0;
    let cacheHits = 0;
    const positionLogs: PositionLogEntry[] = [];
    const skippedUnknownLocationJobs: Array<{
        title: string;
        location: string;
    }> = [];

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

        const trackedCountries = countries.filter((c) =>
            TRACKED_COUNTRY_CODES.has(c.code),
        );

        if (countries.length === 0) {
            skipped++;
            skippedUnknownLocationJobs.push({
                title: job.title,
                location: locationStr,
            });
            continue;
        }
        if (trackedCountries.length === 0) {
            skippedUntracked++;
            continue;
        }

        for (const countryInfo of trackedCountries) {
            const cities =
                job.cities ??
                (job.city
                    ? [job.city]
                    : extractCitiesForCountry(
                          job.location ?? '',
                          countryInfo.code,
                      ));
            const workModel =
                job.work_model ??
                extractWorkModelFromLocation(job.location ?? '');

            if (!groups.has(countryInfo.code)) {
                groups.set(countryInfo.code, {
                    country: countryInfo.slug,
                    country_name: countryInfo.name,
                    country_code: countryInfo.code,
                    jobs: [],
                });
            }

            const tHash = titleHash(job.title);
            const cached = job.url
                ? getOutcome(job.url, countryInfo.code, tHash)
                : null;

            let category: string;
            let categorySignal: string | undefined;
            let categorySource:
                'title' | 'description' | 'jobFunction' | 'default';
            let requires_native_language: boolean;
            let local_language_advantage: boolean;
            let requiredLanguages: string[];
            let preferredLanguages: string[];
            let languageSignals: SignalEntry[];
            let jobSkills: string[];
            let education: string | undefined;

            if (cached) {
                cacheHits++;
                category = cached.category;
                categorySignal = cached.categorySignal;
                categorySource = cached.categorySource;
                requires_native_language = cached.requires_native_language;
                local_language_advantage = cached.local_language_advantage;
                requiredLanguages = cached.requiredLanguages;
                preferredLanguages = cached.preferredLanguages;
                languageSignals = cached.languageSignals;
                jobSkills = cached.skills;
                education = cached.required_education;
            } else {
                const { classified, signals } = classifyJobVerbose(
                    job,
                    countryInfo.code,
                    companyName,
                );
                const plainText =
                    job.descriptionText ??
                    (job.descriptionHtml ? stripHtml(job.descriptionHtml) : '');
                jobSkills = extractSkills(plainText, skills);
                education = extractEducationRequirement(plainText);

                category = classified.category;
                categorySignal = signals.categorySignal;
                categorySource = signals.categorySource;
                requires_native_language = classified.requires_native_language;
                local_language_advantage = classified.local_language_advantage;
                requiredLanguages = classified.requiredLanguages;
                preferredLanguages = classified.preferredLanguages;
                languageSignals = signals.languageSignals;

                if (job.url) {
                    setOutcome(job.url, countryInfo.code, {
                        category,
                        categorySignal,
                        categorySource,
                        requires_native_language,
                        local_language_advantage,
                        requiredLanguages,
                        preferredLanguages,
                        languageSignals,
                        skills: jobSkills,
                        required_education: education,
                        titleHash: tHash,
                        countryCode: countryInfo.code,
                        classifierVersion: CLASSIFIER_VERSION,
                        cachedAt: new Date().toISOString(),
                    });
                }
            }

            // Scraper-provided explicit language data overrides the classifier.
            if (job.requires_native_language !== undefined) {
                requires_native_language = job.requires_native_language;
            }

            positionLogs.push({
                title: job.title,
                category,
                categorySignal,
                categorySource,
                requires_native_language,
                local_language_advantage,
                requiredLanguages,
                preferredLanguages,
                languageSignals,
                countryCode: countryInfo.code,
                countryName: countryInfo.name,
                city: cities.length > 0 ? cities : undefined,
                work_model: workModel ?? undefined,
                skills: jobSkills.length > 0 ? jobSkills : undefined,
                required_education: education,
            });

            groups.get(countryInfo.code)!.jobs.push({
                title: job.title,
                url: job.url,
                category,
                requires_native_language,
                local_language_advantage,
                requiredLanguages,
                preferredLanguages,
                city: cities.length > 0 ? cities : undefined,
                work_model: workModel ?? undefined,
                skills: jobSkills.length > 0 ? jobSkills : undefined,
                required_education: education,
            });
        }
    }

    flushOutcomeCache(OUTCOME_CACHE_PATH);

    logScrapeRun({
        companyName,
        careerUrl,
        ats,
        positions: positionLogs,
        skippedUnknownLocation: skipped,
        skippedUnknownLocationJobs,
        skippedUntrackedCountry: skippedUntracked,
        outcomeCacheHits: cacheHits,
        outcomeCacheTotal: positionLogs.length,
    });

    const countries = Array.from(groups.values());

    let warning: string | undefined;
    if (countries.length === 0) {
        warning =
            rawJobs.length === 0
                ? 'No open positions found. The page has no listings we could detect, or it requires a login.'
                : `Found ${rawJobs.length} position${rawJobs.length === 1 ? '' : 's'}, but none are in a tracked country.`;
    }

    return {
        ats,
        company_name: companyName,
        career_page_url: careerUrl,
        skipped_unknown_location: skipped,
        skipped_untracked_country: skippedUntracked,
        countries,
        warning,
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

        const env: Record<string, string> = {
            ...(process.env as Record<string, string>),
        };
        // import.meta.env is Vite's env store — .env vars land here but may not reach process.env
        const cdpUrl =
            process.env.PLAYWRIGHT_CDP_URL ??
            (import.meta.env.PLAYWRIGHT_CDP_URL as string | undefined);
        if (cdpUrl) {
            env.PLAYWRIGHT_CDP_URL = cdpUrl;
        }

        const py = spawn(pythonBin, [scraperPath, url], {
            timeout: PYTHON_TIMEOUT_MS,
            killSignal: 'SIGKILL',
            env,
        });

        let stdout = '';
        let stderr = '';

        py.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        py.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        py.on('close', (code) => {
            console.log('[python-scraper] exit code:', code);
            console.log('[python-scraper] stderr:', stderr.trim() || '(empty)');
            console.log('[python-scraper] stdout:', stdout.trim() || '(empty)');

            if (code !== 0) {
                reject(
                    new Error(
                        `Python scraper exited with code ${code}. ${stderr.trim()}`,
                    ),
                );
                return;
            }
            try {
                const jobs = JSON.parse(stdout) as RawJob[];
                const result = Array.isArray(jobs) ? jobs : [];
                console.log('[python-scraper] parsed jobs:', result.length);
                resolve(result);
            } catch {
                reject(
                    new Error(
                        `Python scraper returned invalid JSON. ${stderr.trim()}`,
                    ),
                );
            }
        });

        py.on('error', (err) => {
            console.log('[python-scraper] spawn error:', err.message);
            reject(new Error(`Could not start Python scraper: ${err.message}`));
        });
    });
}

/** Try Greenhouse, Lever, and Ashby APIs to see which one recognises the slug. */
async function probeAts(
    slug: string,
): Promise<'greenhouse' | 'lever' | 'ashby' | 'workable' | null> {
    const [ghRes, lvRes, ashbyRes, workableRes] = await Promise.allSettled([
        fetch(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`,
            { method: 'HEAD' },
        ),
        fetch(
            `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?limit=1`,
            { method: 'HEAD' },
        ),
        fetch(
            `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
            { method: 'GET' },
        ),
        fetch(
            `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}`,
            { method: 'GET' },
        ),
    ]);
    if (ghRes.status === 'fulfilled' && ghRes.value.ok) return 'greenhouse';
    if (lvRes.status === 'fulfilled' && lvRes.value.ok) return 'lever';
    // Ashby returns 200 with {"jobs":[],"apiVersion":"1"} for unknown slugs — only match if jobs are present
    if (ashbyRes.status === 'fulfilled' && ashbyRes.value.ok) {
        try {
            const data = (await ashbyRes.value.json()) as { jobs?: unknown[] };
            if (Array.isArray(data.jobs) && data.jobs.length > 0)
                return 'ashby';
        } catch {
            /* ignore */
        }
    }
    // Workable returns 200 with {"jobs":[]} for accounts with no open positions — only match if jobs are present
    if (workableRes.status === 'fulfilled' && workableRes.value.ok) {
        try {
            const data = (await workableRes.value.json()) as {
                jobs?: unknown[];
            };
            if (Array.isArray(data.jobs) && data.jobs.length > 0)
                return 'workable';
        } catch {
            /* ignore */
        }
    }
    return null;
}

function json(data: unknown, status: number) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}
