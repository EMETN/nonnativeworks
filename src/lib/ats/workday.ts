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
 *   https://{host}/{locale}/{site}{externalPath}
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
import { lookupCountryFromLocation, extractCitiesForCountry, isCountryKey } from "./country-lookup";

const DESCRIPTION_BATCH = 10;

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
  return html
    .replace(/<[^>]+>/g, " ")
    // Decode named HTML entities that affect language detection (Nordic + common chars).
    // Workday returns job descriptions as HTML inside JSON; entities are not decoded
    // automatically and would otherwise prevent the native-character frequency check.
    .replace(/&auml;/g, 'ä').replace(/&Auml;/g, 'Ä')
    .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
    .replace(/&aring;/g, 'å').replace(/&Aring;/g, 'Å')
    .replace(/&oslash;/g, 'ø').replace(/&Oslash;/g, 'Ø')
    .replace(/&aelig;/g, 'æ').replace(/&AElig;/g, 'Æ')
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
    .replace(/&szlig;/g, 'ß')
    .replace(/&eacute;/g, 'é').replace(/&Eacute;/g, 'É')
    .replace(/&egrave;/g, 'è').replace(/&Egrave;/g, 'È')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
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
              const info = data.jobPostingInfo ?? data.jobPosting ?? data;
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
  /** Locale segment from the career page URL, e.g. "en-US", "fi-FI". Used when building public job URLs. */
  locale: string;
  /** Facet filters to include in every API request, e.g. { locationCountry: ['abc123', ...] }. */
  appliedFacets?: Record<string, string[]>;
}

/**
 * Parse a Workday career page URL into its component parts.
 * e.g. https://posti.wd3.myworkdayjobs.com/fi-FI/external
 *   → { host: 'posti.wd3.myworkdayjobs.com', company: 'posti', site: 'external' }
 *
 * The locale segment (e.g. fi-FI) is captured and returned so public job URLs
 * preserve the original locale rather than defaulting to en-US.
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
    const LOCALE_RE = /^[a-z]{2}-[A-Z]{2}$/;
    const locale = segments.length >= 2 && LOCALE_RE.test(segments[0]) ? segments[0] : "en-US";
    const site = segments[segments.length - 1];
    if (!company || !site) return null;

    const FACET_PARAMS = [
      "locationCountry",
      "Country",
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
      locale,
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
const EXPAND_BATCH = 10;
const MULTI_LOC_RE = /^\d+ locations?$|^multiple locations?$/i;

/**
 * Some Workday instances (e.g. SOK) use venue/building names as locationsText
 * (e.g. "SOLO SOKOS HOTEL PIER 4") instead of "City, Country". These are
 * recognisable as entirely uppercase strings with no comma. When detected, we
 * fetch the job detail to get the proper location from jobPostingInfo.location.
 */
function looksLikeVenueName(text: string): boolean {
  if (!text || MULTI_LOC_RE.test(text.trim())) return false;
  return text === text.toUpperCase() && !text.includes(',');
}

/**
 * Extract a clean city name from a Workday location string. Handles:
 *   - Venue/ISO-prefix codes: "DKCPH55 - Copenhagen - Esplanaden 50" → "Copenhagen"
 *   - Detail API format:      "Denmark, Copenhagen, 1098"              → "Copenhagen"
 *   - Standard format:        "Copenhagen, Denmark"                    → "Copenhagen"
 */
function parseCityFromWorkdayLoc(loc: string, countryCode: string): string | undefined {
  // Venue code or ISO prefix: first dash-segment is all uppercase letters+digits → city is second
  const dashParts = loc.split(/\s+-\s+/);
  if (dashParts.length >= 2 && /^[A-Z]{2}[A-Z0-9]*$/.test(dashParts[0].trim())) {
    return dashParts[1].trim() || undefined;
  }
  // Try CITY_MAP lookup first (handles "Copenhagen, Denmark" and "Denmark, Copenhagen, 1098")
  const byMap = extractCitiesForCountry(loc, countryCode);
  if (byMap.length > 0) return byMap[0];
  // Fallback for cities not in CITY_MAP: if first comma segment is a country name use second,
  // otherwise use first (e.g. "Great Britain, Maidenhead, SL6 8AA" → "Maidenhead")
  const commaParts = loc.split(',').map((s) => s.trim()).filter(Boolean);
  if (commaParts.length >= 2 && isCountryKey(commaParts[0])) return commaParts[1];
  return commaParts[0] || undefined;
}

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
): Promise<{ locations: string[]; description?: string; countryDescriptor?: string }> {
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
    const info = data.jobPostingInfo ?? data.jobPosting ?? data;
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
    const countryDescriptor =
      typeof info.country?.descriptor === "string" && info.country.descriptor
        ? info.country.descriptor
        : undefined;
    return { locations, description, countryDescriptor };
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
  let total = Infinity;

  while (offset < total) {
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
    if (total === Infinity && data.total != null) total = data.total;

    offset += PAGE_SIZE;
    if (postings.length < PAGE_SIZE) break;
  }

  // Split into single-location, venue-name, multi-location, and unresolvable postings.
  // Unresolvable: locationsText exists but lookupCountryFromLocation can't identify a country.
  // These go through the detail API to extract jobPostingInfo.country.descriptor.
  const allJobs: RawJob[] = [];
  const multiLocQueue: WorkdayJobPosting[] = [];
  const venueQueue: WorkdayJobPosting[] = [];
  const needsCountryDetail: WorkdayJobPosting[] = [];

  for (const posting of allPostings) {
    const jobUrl = `https://${parts.host}/${parts.locale}/${parts.site}${posting.externalPath}`;
    const locText = posting.locationsText ?? "";
    const resolvedCountries = lookupCountryFromLocation(locText);
    if (MULTI_LOC_RE.test(locText.trim())) {
      multiLocQueue.push(posting);
    } else if (looksLikeVenueName(locText)) {
      venueQueue.push(posting);
    } else if (locText && resolvedCountries.length === 0) {
      needsCountryDetail.push(posting);
    } else {
      const city = resolvedCountries.length > 0
        ? parseCityFromWorkdayLoc(locText, resolvedCountries[0].code)
        : undefined;
      allJobs.push({ title: posting.title, location: posting.locationsText, url: jobUrl, ...(city && { city }) });
    }
  }

  // Resolve venue-name postings by fetching the detail API for the real location.
  if (venueQueue.length > 0) {
    console.log(`[workday] resolving locations for ${venueQueue.length} venue-name postings (of ${allPostings.length} total)`);
    for (let i = 0; i < venueQueue.length; i += EXPAND_BATCH) {
      await Promise.all(
        venueQueue.slice(i, i + EXPAND_BATCH).map(async (posting) => {
          const jobUrl = `https://${parts.host}/${parts.locale}/${parts.site}${posting.externalPath}`;
          const { locations, description } = await fetchJobLocations(
            parts.host, parts.company, parts.site, posting.externalPath,
          );
          // Use the detail location if available; fall back to the original venue string.
          const location = locations[0] ?? posting.locationsText;
          const resolvedForCity = lookupCountryFromLocation(location ?? "");
          const city = resolvedForCity.length > 0
            ? parseCityFromWorkdayLoc(location ?? "", resolvedForCity[0].code)
            : undefined;
          allJobs.push({
            title: posting.title,
            url: jobUrl,
            location,
            ...(city && { city }),
            ...(description && { descriptionText: description }),
          });
        }),
      );
    }
  }

  // Resolve postings whose locationsText couldn't be mapped to a country.
  // The detail API's jobPostingInfo.country.descriptor (e.g. "Denmark") is used as the
  // location fallback, handling cases like "Home office DK" (already caught by the trailing
  // ISO code heuristic) and fully opaque strings like "Distance office".
  if (needsCountryDetail.length > 0) {
    console.log(`[workday] resolving country for ${needsCountryDetail.length} unresolvable-location postings (of ${allPostings.length} total)`);
    for (let i = 0; i < needsCountryDetail.length; i += EXPAND_BATCH) {
      await Promise.all(
        needsCountryDetail.slice(i, i + EXPAND_BATCH).map(async (posting) => {
          const jobUrl = `https://${parts.host}/${parts.locale}/${parts.site}${posting.externalPath}`;
          const { locations, countryDescriptor, description } = await fetchJobLocations(
            parts.host, parts.company, parts.site, posting.externalPath,
          );
          // Prefer countryDescriptor ("Denmark") for country resolution; fall back to
          // locations[0] (venue code like "DKRJZ51 - Tinglev - ...") which resolves via
          // leading-code detection, then to the original locationsText as last resort.
          const location = countryDescriptor ?? locations[0] ?? posting.locationsText;
          const resolvedForCity = lookupCountryFromLocation(location ?? "");
          const city = locations[0] && resolvedForCity.length > 0
            ? parseCityFromWorkdayLoc(locations[0], resolvedForCity[0].code)
            : undefined;
          allJobs.push({
            title: posting.title,
            url: jobUrl,
            location,
            ...(city && { city }),
            ...(description && { descriptionText: description }),
          });
        }),
      );
    }
  }

  // Expand multi-location postings by fetching each job's detail page.
  if (multiLocQueue.length > 0) {
    console.log(`[workday] expanding ${multiLocQueue.length} multi-location postings (of ${allPostings.length} total)`);
    for (let i = 0; i < multiLocQueue.length; i += EXPAND_BATCH) {
      await Promise.all(
        multiLocQueue.slice(i, i + EXPAND_BATCH).map(async (posting) => {
          const jobUrl = `https://${parts.host}/${parts.locale}/${parts.site}${posting.externalPath}`;
          const { locations, description } = await fetchJobLocations(
            parts.host, parts.company, parts.site, posting.externalPath,
          );
          if (locations.length > 0) {
            // Group locations by resolved country code so that multiple cities in
            // the same country become one job entry. Using lookupCountryFromLocation
            // handles bare city names (e.g. "Espoo", "Turku") correctly — they both
            // resolve to "FI" and are merged, rather than being treated as separate
            // groups by the last-comma-segment heuristic.
            const byCountry = new Map<string, string[]>();
            for (const loc of locations) {
              const resolved = lookupCountryFromLocation(loc);
              const groupKey = resolved.length > 0
                ? resolved[0].code
                : (loc.split(",").map((p) => p.trim()).pop() ?? loc);
              if (!byCountry.has(groupKey)) byCountry.set(groupKey, []);
              byCountry.get(groupKey)!.push(loc);
            }
            for (const [countryKey, locs] of byCountry) {
              const citySet = new Set<string>();
              for (const loc of locs) {
                const city = parseCityFromWorkdayLoc(loc, countryKey);
                if (city) citySet.add(city);
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
