/**
 * Workday ATS scraper
 *
 * ## How it works
 *
 * Workday career sites are hosted on *.myworkdayjobs.com. They expose an
 * undocumented but stable JSON API that this scraper calls directly — no
 * browser automation required.
 *
 * ### Step 1 — URL parsing (`parseWorkdayUrl`)
 * The career page URL is parsed to extract three components needed for all
 * subsequent API calls:
 *   - `host`    — e.g. "posti.wd3.myworkdayjobs.com"
 *   - `company` — the first subdomain segment, e.g. "posti"
 *   - `site`    — the last URL path segment (locale prefix like "fi-FI" is
 *                 skipped), e.g. "external"
 *
 * Recognised facet query params on the career URL (locationCountry,
 * locationRegionStateProvince, workerSubType, jobFamilyGroup) are captured
 * into `appliedFacets` and forwarded to every API request so the server
 * returns only jobs matching those pre-filters (useful for companies whose
 * Workday instance covers multiple countries but we only want one).
 *
 * ### Step 2 — Paginated job listing (`fetchWorkdayJobs`)
 * Endpoint: POST https://{host}/wday/cxs/{company}/{site}/jobs
 * Request body (JSON):
 *   { appliedFacets, limit: 20, offset: <n>, searchText: "" }
 *
 * The server caps `limit` at 20. Pagination continues until fewer than 20
 * results are returned.
 *
 * Fields extracted from each listing object (`WorkdayJobPosting`):
 *   - `title`         — job title string
 *   - `locationsText` — human-readable location string, e.g. "Helsinki, Finland"
 *                       or "3 locations" for multi-location postings
 *   - `externalPath`  — URL path suffix used to construct the job detail URL
 *                       and to call the detail API for multi-location postings
 *
 * The job's public URL is built as:
 *   https://{host}/en-US/{site}{externalPath}
 *
 * ### Step 3 — Multi-location expansion (`fetchJobLocations`)
 * When `locationsText` matches the pattern "N location(s)" (e.g. "3 locations"),
 * the posting is a multi-location job. Its individual locations are fetched via:
 *   GET https://{host}/wday/cxs/{company}/{site}{externalPath}  (no "/jobs" segment)
 *
 * Fields extracted from the detail response (`jobPostingInfo`):
 *   - `location`            — primary location string
 *   - `additionalLocations` — array of additional location strings
 *
 * Locations are then grouped by country (last comma-separated segment). Cities
 * within the same country are merged into a single `RawJob` with a `cities`
 * array; different countries produce separate `RawJob` entries. This matches
 * the behaviour of the rest of the pipeline where one job can appear in
 * multiple countries.
 *
 * ### Step 4 — Description enrichment (`enrichWorkdayDescriptions`)
 * After jobs are collected, the caller may invoke `enrichWorkdayDescriptions`
 * to attach a description to each job for use in language classification.
 * Only jobs whose titles do not already appear non-English are fetched.
 * Fetches are batched (5 at a time) to avoid overloading the server.
 *
 * For multi-location jobs the detail API was already called in Step 3, so
 * `descriptionText` is already populated — `enrichWorkdayDescriptions` skips
 * those jobs (the filter `!j.descriptionText` excludes them).
 *
 * For single-location jobs two strategies are tried in order:
 *   1. JSON detail API (same endpoint as Step 3) — `jobPostingInfo.jobDescription`
 *      is the full HTML job description; HTML tags are stripped before storing.
 *      This is preferred because it is richer than the og:description snippet.
 *   2. HTML page fallback — if the API returns no `jobDescription`, the public
 *      job page is fetched and the following meta tag is extracted:
 *        <meta name="description"> or <meta property="og:description">
 *
 * The detail API URL is derived from the public job URL by replacing the locale
 * prefix with `/wday/cxs/{company}/`.
 *
 * ### RawJob fields produced
 * | Field           | Source                                                      |
 * |-----------------|-------------------------------------------------------------|
 * | title           | jobPostings[].title (listing API)                           |
 * | location        | jobPostings[].locationsText or detail API location field    |
 * | url             | constructed from host + site + externalPath                 |
 * | cities          | detail API additionalLocations (multi-loc jobs only)        |
 * | descriptionText | detail API jobPostingInfo.jobDescription (HTML, tags stripped), |
 * |                 | or og:description / meta description as fallback            |
 */

import type { RawJob } from "./types";
import { titleAppearsNonEnglish } from "./title-language";

const DESCRIPTION_BATCH = 5;

function extractOgDescription(html: string): string | undefined {
  const m =
    html.match(
      /<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]+)"/i,
    ) ??
    html.match(
      /<meta[^>]+content="([^"]+)"[^>]+(?:name="description"|property="og:description")/i,
    );
  return m?.[1] ? m[1].trim() : undefined;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Convert a Workday public job URL to its detail API URL.
 * e.g. https://abb.wd3.myworkdayjobs.com/en-US/external/job/Foo_R-123
 *   →  https://abb.wd3.myworkdayjobs.com/wday/cxs/abb/external/job/Foo_R-123
 */
function publicUrlToDetailApiUrl(publicUrl: string): string | null {
  try {
    const parsed = new URL(publicUrl);
    if (!parsed.hostname.endsWith(".myworkdayjobs.com")) return null;
    const company = parsed.hostname.split(".")[0];
    // Path: /{locale}/{site}/job/... — drop the locale prefix, keep the rest.
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    const rest = segments.slice(1).join("/");
    return `https://${parsed.hostname}/wday/cxs/${company}/${rest}`;
  } catch {
    return null;
  }
}

export async function enrichWorkdayDescriptions(jobs: RawJob[]): Promise<void> {
  const targets = jobs.filter(
    (j) => j.url && !titleAppearsNonEnglish(j.title) && !j.descriptionText,
  );
  console.log(
    `[workday] enriching descriptions for ${targets.length}/${jobs.length} jobs`,
  );

  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        try {
          // Prefer the JSON detail API — jobPostingInfo.jobDescription is the
          // full rich description, far more useful for language classification
          // than the short og:description meta tag.
          const apiUrl = publicUrlToDetailApiUrl(job.url!);
          if (apiUrl) {
            const origin = new URL(job.url!).origin;
            const apiRes = await fetch(apiUrl, {
              headers: {
                accept: "application/json",
                origin,
                referer: `${origin}/`,
                "user-agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              },
            });
            if (apiRes.ok) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const data: any = await apiRes.json();
              const info = data.jobPostingInfo ?? data;
              if (typeof info.jobDescription === "string" && info.jobDescription) {
                job.descriptionText = stripHtml(info.jobDescription);
                return;
              }
            }
          }
          // Fall back to scraping og:description from the HTML page.
          const res = await fetch(job.url!, {
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          if (!res.ok) return;
          const html = await res.text();
          const desc = extractOgDescription(html);
          if (desc) job.descriptionText = desc;
        } catch {
          // skip — classification falls back to title only
        }
      }),
    );
  }
}

export interface WorkdayUrlParts {
  host: string;
  company: string;
  site: string;
  /** Facet filters to include in every API request, e.g. { locationCountry: ['abc123', ...] }. */
  appliedFacets?: Record<string, string[]>;
}

/**
 * Parse a Workday career page URL into its component parts.
 * e.g. https://posti.wd3.myworkdayjobs.com/fi-FI/external
 *   → { host: 'posti.wd3.myworkdayjobs.com', company: 'posti', site: 'external' }
 *
 * The locale segment (e.g. fi-FI) is skipped — the API path uses only the
 * site name (last path segment).
 *
 * Any recognised facet query params (locationCountry, workerSubType, etc.) are captured
 * into appliedFacets and forwarded to every paginated API request, so the server only
 * returns jobs matching those filters (e.g. specific countries).
 */
export function parseWorkdayUrl(url: string): WorkdayUrlParts | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".myworkdayjobs.com")) return null;
    const company = parsed.hostname.split(".")[0];
    const segments = parsed.pathname.split("/").filter(Boolean);
    const site = segments[segments.length - 1];
    if (!company || !site) return null;

    const FACET_PARAMS = [
      "locationCountry",
      "locationRegionStateProvince",
      "workerSubType",
      "jobFamilyGroup",
    ];
    const appliedFacets: Record<string, string[]> = {};
    for (const param of FACET_PARAMS) {
      const values = parsed.searchParams.getAll(param);
      if (values.length > 0) appliedFacets[param] = values;
    }

    return {
      host: parsed.hostname,
      company,
      site,
      ...(Object.keys(appliedFacets).length > 0 && { appliedFacets }),
    };
  } catch {
    return null;
  }
}

interface WorkdayJobPosting {
  title: string;
  locationsText?: string;
  externalPath: string;
}

interface WorkdayResponse {
  total?: number;
  jobPostings?: WorkdayJobPosting[];
}


const PAGE_SIZE = 20; // Workday rejects limit > 20
const EXPAND_BATCH = 5;
const MULTI_LOC_RE = /^\d+ locations?$/i;

/**
 * Fetches the job detail API for a multi-location posting and returns all
 * location strings: the primary `location` plus any `additionalLocations`.
 * Endpoint: GET /wday/cxs/{company}/{site}{externalPath} (no "/jobs" segment).
 */
async function fetchJobLocations(
  host: string,
  company: string,
  site: string,
  externalPath: string,
): Promise<{ locations: string[]; description?: string }> {
  const origin = `https://${host}`;
  const url = `${origin}/wday/cxs/${company}/${site}${externalPath}`;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/json",
        origin,
        referer: `${origin}/`,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.log(`[workday] detail fetch ${res.status} for ${externalPath}`);
      return { locations: [] };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const info = data.jobPostingInfo ?? data;
    const primary = typeof info.location === "string" ? info.location : undefined;
    const additional: string[] = Array.isArray(info.additionalLocations)
      ? (info.additionalLocations as unknown[]).filter((l): l is string => typeof l === "string")
      : [];
    const locations = [primary, ...additional].filter(
      (l): l is string => l !== undefined && l.length > 0,
    );
    if (locations.length === 0) {
      console.log(`[workday] no locations in detail response for ${externalPath} — keys: ${Object.keys(info).join(", ")}`);
    }
    const description =
      typeof info.jobDescription === "string" && info.jobDescription
        ? stripHtml(info.jobDescription)
        : undefined;
    return { locations, description };
  } catch (e) {
    console.log(`[workday] detail fetch error for ${externalPath}: ${e}`);
    return { locations: [] };
  }
}

export async function fetchWorkdayJobs(
  parts: WorkdayUrlParts,
): Promise<RawJob[]> {
  const endpoint = `https://${parts.host}/wday/cxs/${parts.company}/${parts.site}/jobs`;
  const allPostings: WorkdayJobPosting[] = [];
  let offset = 0;

  while (true) {
    const origin = `https://${parts.host}`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin: origin,
        referer: `${origin}/`,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        appliedFacets: parts.appliedFacets ?? {},
        limit: PAGE_SIZE,
        offset,
        searchText: "",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Workday API returned ${res.status} for "${parts.company}/${parts.site}": ${body}`,
      );
    }

    const data: WorkdayResponse = await res.json();
    const postings = data.jobPostings ?? [];
    allPostings.push(...postings);

    offset += PAGE_SIZE;
    if (postings.length < PAGE_SIZE) break;
  }

  // Split into single-location and multi-location postings.
  const allJobs: RawJob[] = [];
  const multiLocQueue: WorkdayJobPosting[] = [];

  for (const posting of allPostings) {
    const jobUrl = `https://${parts.host}/en-US/${parts.site}${posting.externalPath}`;
    if (MULTI_LOC_RE.test((posting.locationsText ?? "").trim())) {
      multiLocQueue.push(posting);
    } else {
      allJobs.push({ title: posting.title, location: posting.locationsText, url: jobUrl });
    }
  }

  // Expand multi-location postings by fetching each job's detail page.
  if (multiLocQueue.length > 0) {
    console.log(`[workday] expanding ${multiLocQueue.length} multi-location postings (of ${allPostings.length} total)`);
    for (let i = 0; i < multiLocQueue.length; i += EXPAND_BATCH) {
      await Promise.all(
        multiLocQueue.slice(i, i + EXPAND_BATCH).map(async (posting) => {
          const jobUrl = `https://${parts.host}/en-US/${parts.site}${posting.externalPath}`;
          const { locations, description } = await fetchJobLocations(
            parts.host, parts.company, parts.site, posting.externalPath,
          );
          if (locations.length > 0) {
            // Group by country (last comma-separated segment) so that multiple
            // cities in the same country become one job entry with a cities array,
            // matching the general pipeline behaviour.
            const byCountry = new Map<string, string[]>();
            for (const loc of locations) {
              const parts = loc.split(",").map((p) => p.trim());
              const country = parts[parts.length - 1] || loc;
              if (!byCountry.has(country)) byCountry.set(country, []);
              byCountry.get(country)!.push(loc);
            }
            for (const [, locs] of byCountry) {
              const citySet = new Set<string>();
              for (const loc of locs) {
                const comma = loc.indexOf(",");
                if (comma > 0) citySet.add(loc.slice(0, comma).trim());
              }
              allJobs.push({
                title: posting.title,
                url: jobUrl,
                location: locs[0], // first full string drives country resolution
                ...(citySet.size > 0 && { cities: [...citySet] }),
                ...(description && { descriptionText: description }),
              });
            }
          } else {
            // Detail fetch failed — keep the original ambiguous locationsText as fallback.
            allJobs.push({ title: posting.title, location: posting.locationsText, url: jobUrl });
          }
        }),
      );
    }
  }

  return allJobs;
}
