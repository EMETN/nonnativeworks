import type { RawJob } from './types';
import type { CompanyApiConfig } from './company-apis';
import { titleAppearsNonEnglish } from './title-language';
import { lookupCountryFromLocation } from './country-lookup';
import { getCached, setCached, flushCache } from './description-cache';

const MAX_PAGES = 50;        // safety cap to avoid infinite loops
const DESCRIPTION_BATCH = 5; // concurrent page fetches when enriching descriptions

/** Decode common HTML entities in a string (e.g. &amp; → &, &lt; → <). */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Resolve a dot-path like "response.unifiedStandardTitle" into a nested value. Empty path returns the root object. */
function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur !== null && typeof cur === 'object' && key in (cur as object)) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/**
 * Extract all string values from a dot-path that points to an array or an object
 * with numeric-string keys (e.g. sfstd_jobLocation_obj: {0: "Helsinki", 1: "Oulu"}).
 * Returns an empty array if the path is missing or has no string values.
 */
function getStringArray(obj: unknown, path: string | undefined): string[] {
  if (!path) return [];
  const val = getPath(obj, path);
  if (typeof val === 'string' && val.trim() !== '') return [val];
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  if (val !== null && typeof val === 'object') {
    return Object.values(val as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  }
  return [];
}

/** Extract a string from a dot-path. Arrays return their first string element. Numbers are coerced to strings. */
function getString(obj: unknown, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const val = getPath(obj, path);
  if (typeof val === 'string') return val || undefined;
  if (typeof val === 'number') return String(val);
  if (Array.isArray(val)) {
    const first = val.find((v) => typeof v === 'string' && v.trim());
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

function extractItems(data: unknown, itemsPath: string | undefined): unknown[] {
  const raw = itemsPath ? getPath(data, itemsPath) : data;
  return Array.isArray(raw) ? raw : [];
}

function buildUrlFromTemplate(item: unknown, template: string): string {
  return template.replace(/\{([^}]+)\}/g, (_, path: string) => {
    const val = getString(item, path);
    return val ?? '';
  });
}

function mapItem(
  item: unknown,
  fields: CompanyApiConfig['fields'],
  urlTemplate?: string,
  descriptionFields?: string[],
  urlPlaceholders?: Record<string, string>,
  keepQueryParams?: boolean,
): RawJob | null {
  const rawTitle = getString(item, fields.title);
  if (!rawTitle) return null;
  const title = decodeHtmlEntities(rawTitle);

  let url = urlTemplate
    ? buildUrlFromTemplate(item, urlTemplate)
    : getString(item, fields.url);

  if (url) {
    if (urlPlaceholders) {
      for (const [from, to] of Object.entries(urlPlaceholders)) {
        url = url.replaceAll(from, to);
      }
    }
    url = cleanJobUrl(url, keepQueryParams);
  }

  let descriptionText: string | undefined;
  if (descriptionFields?.length) {
    const parts = descriptionFields
      .map((p) => getString(item, p))
      .filter((v): v is string => !!v);
    if (parts.length) descriptionText = parts.join(' ');
  }

  const cities = getStringArray(item, fields.cities);

  return {
    title,
    location: getString(item, fields.location),
    cities: cities.length > 0 ? cities : undefined,
    url: url || undefined,
    department: getString(item, fields.department),
    jobFunction: getString(item, fields.jobFunction),
    sourceId: fields.id ? getString(item, fields.id) : undefined,
    descriptionText,
  };
}

/**
 * If expandSecondaryLocations is configured, handles multi-location job postings.
 *
 * Country mode (countryName set): returns additional RawJob copies for each secondary
 * country (e.g. Nokia jobs listed in multiple countries). Each copy gets the secondary
 * country as its location and a suffixed sourceId so deduplication treats it as distinct.
 *
 * City mode (cityField set): collects secondary city names into primaryJob.cities so
 * they appear as one consolidated posting. Returns [] (no duplicate jobs created).
 */
function expandJobToSecondaryLocations(
  primaryJob: RawJob,
  item: unknown,
  expand: CompanyApiConfig['expandSecondaryLocations'],
): RawJob[] {
  if (!expand) return [];
  const secondaries = getPath(item, expand.path);
  if (!Array.isArray(secondaries) || secondaries.length === 0) return [];

  if (expand.parallelCitiesPath) {
    // Parallel mode: flat string array of country names + a comma-separated city string.
    // Don't try to correlate cities to countries by index (ordering is unreliable).
    // Instead, set location = full city string and country_code = country name so that
    // buildScrapeResult can resolve the country from country_code and then call
    // extractCitiesForCountry(location, countryCode) to filter cities correctly per country.
    const countries = secondaries.filter((c): c is string => typeof c === 'string');
    const cityString = getString(item, expand.parallelCitiesPath) ?? '';
    primaryJob.country_code = countries[0];
    // Only override location with cities when non-empty — an empty city string would
    // cause isTrackedLocation("") to fail, filtering the job out of description enrichment.
    // When empty, keep the country name already set by mapItem so lookups still resolve.
    if (cityString) primaryJob.location = cityString;
    primaryJob.cities = undefined;
    primaryJob.city = undefined;
    const extras: RawJob[] = [];
    for (let i = 1; i < countries.length; i++) {
      const country = countries[i];
      if (!country) continue;
      extras.push({
        ...primaryJob,
        country_code: country,
        // Suffix sourceId to survive deduplication as a distinct entry per country,
        // but preserve the original slug in descriptionApiId so the detail API URL
        // uses the unmodified slug (the suffixed ID would 404).
        sourceId: primaryJob.sourceId ? `${primaryJob.sourceId}-${country}` : undefined,
        descriptionApiId: primaryJob.descriptionApiId ?? primaryJob.sourceId,
      });
    }
    return extras;
  }

  if (expand.cityField) {
    const cities: string[] = [];
    for (const sec of secondaries) {
      const city = getString(sec, expand.cityField);
      if (city) cities.push(city);
    }
    if (cities.length > 0) {
      primaryJob.cities = [...(primaryJob.cities ?? []), ...cities];
    }
    return [];
  }

  const extras: RawJob[] = [];
  for (const sec of secondaries) {
    const countryName = getString(sec, expand.countryName!);
    if (!countryName || countryName === primaryJob.location) continue;
    extras.push({
      ...primaryJob,
      location: countryName,
      sourceId: primaryJob.sourceId ? `${primaryJob.sourceId}-${countryName}` : undefined,
    });
  }
  return extras;
}

/** Build a FormData from a body object. Array values produce multiple fields with the same name. */
function buildFormData(body: Record<string, unknown>): FormData {
  const fd = new FormData();
  for (const [key, val] of Object.entries(body)) {
    if (Array.isArray(val)) {
      for (const v of val) fd.append(key, String(v));
    } else {
      fd.append(key, String(val));
    }
  }
  return fd;
}

async function fetchPage(
  url: string,
  method: 'GET' | 'POST',
  body: Record<string, unknown> | undefined,
  headers: Record<string, string>,
  bodyType: 'json' | 'multipart' = 'json',
): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json', ...headers },
  };
  if (method === 'POST') {
    if (bodyType === 'multipart') {
      // Do NOT set Content-Type — fetch sets it automatically with the correct boundary.
      init.body = buildFormData(body ?? {});
    } else {
      init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body ?? {});
    }
  }
  const res = await fetch(url, init);
  // 400 signals "page out of range" on some APIs (e.g. WordPress REST API returns 400
  // with rest_post_invalid_page_number instead of an empty array). Treat as graceful end.
  if (res.status === 400) return null;
  if (!res.ok) throw new Error(`Company API returned ${res.status} for ${url}`);
  return res.json();
}


async function fetchPageHtml(url: string): Promise<string | undefined> {
  const cached = getCached(url);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.warn(`[fetchPageHtml] HTTP ${res.status} for ${url}`);
      return undefined;
    }
    const html = await res.text();
    setCached(url, html);
    return html;
  } catch (err) {
    console.warn(`[fetchPageHtml] fetch failed for ${url}: ${err}`);
    return undefined;
  }
}

/**
 * For each job that needs HTML — either for description classification (English title,
 * no existing HTML) or for location extraction (no location yet) — fetch the job page.
 * Attaches descriptionHtml for English-titled jobs; extracts location via regex if provided.
 * When descriptionRegex is provided, only the matched HTML fragment is stored as
 * descriptionHtml instead of the full page (avoids native-language nav/chrome false positives).
 */
export async function enrichDescriptions(jobs: RawJob[], locationRegex?: RegExp, descriptionRegex?: RegExp): Promise<void> {
  const targets = jobs.filter((j) => {
    if (!j.url) return false;
    const wantsDescription = !titleAppearsNonEnglish(j.title) && !j.descriptionHtml && !j.descriptionText;
    const wantsLocation = !!locationRegex && !j.location;
    return wantsDescription || wantsLocation;
  });

  const noUrl = jobs.length - targets.length;
  console.log(`[enrichDescriptions] ${targets.length} targets (${noUrl} skipped — no url or already enriched), locationRegex=${locationRegex ?? 'none'}, descriptionRegex=${descriptionRegex ?? 'none'}`);

  let locationsSet = 0;
  let htmlFailed = 0;
  let regexMissed = 0;

  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        const html = await fetchPageHtml(job.url!);
        if (!html) {
          htmlFailed++;
          return;
        }
        if (!titleAppearsNonEnglish(job.title) && !job.descriptionText) {
          if (descriptionRegex) {
            const m = html.match(descriptionRegex);
            job.descriptionHtml = m?.[1] ?? html;
          } else {
            job.descriptionHtml = html;
          }
        }
        if (locationRegex && !job.location) {
          const m = html.match(locationRegex);
          if (m?.[1]) {
            job.location = m[1].trim();
            locationsSet++;
          } else {
            regexMissed++;
            console.warn(`[enrichDescriptions] location regex did not match for: ${job.url}`);
          }
        }
      }),
    );
  }

  if (locationRegex) {
    console.log(`[enrichDescriptions] location extraction: ${locationsSet} set, ${regexMissed} regex misses, ${htmlFailed} fetch failures`);
  }

  flushCache();
}

/**
 * Fetches full job descriptions from a dedicated JSON API endpoint, one job at a time.
 * Uses sourceId to build the URL from the template. Skips jobs with non-English titles
 * and jobs that already have a description.
 */
function normaliseWorkModel(raw: string): RawJob['work_model'] | undefined {
  const v = raw.toLowerCase();
  if (v.includes('remote')) return 'remote';
  if (v.includes('hybrid')) return 'hybrid';
  if (v.includes('office') || v.includes('on-site') || v.includes('onsite') || v.includes('on site')) return 'on-site';
  return undefined;
}

async function enrichDescriptionsFromApi(
  jobs: RawJob[],
  urlTemplate: string,
  itemsPath: string,
  fields: string[],
  headers: Record<string, string>,
  locationField?: string,
  jobFunctionField?: string,
  workModelField?: string,
): Promise<void> {
  const targets = jobs.filter((j) => (j.descriptionApiId ?? j.sourceId) && !titleAppearsNonEnglish(j.title) && !j.descriptionText && !j.descriptionHtml);
  console.log(`[enrichDescriptionsFromApi] fetching descriptions for ${targets.length} jobs`);
  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        const apiId = job.descriptionApiId ?? job.sourceId!;
        const url = urlTemplate.replace('{sourceId}', encodeURIComponent(apiId));
        try {
          const data = await fetchPage(url, 'GET', undefined, headers);
          const item = getPath(data, itemsPath);
          const parts = fields
            .map((f) => getString(item, f))
            .filter((v): v is string => !!v);
          if (parts.length) job.descriptionText = parts.join(' ');
          if (locationField) {
            const city = getString(item, locationField);
            if (city) {
              // City mode: prepend primary city to the existing secondary cities list
              if (job.cities) {
                job.cities = [city, ...job.cities];
              } else {
                job.city = city;
              }
            }
          }
          if (jobFunctionField) {
            const jf = getString(item, jobFunctionField);
            if (jf) job.jobFunction = jf;
          }
          if (workModelField) {
            const wm = getString(item, workModelField);
            if (wm) job.work_model = normaliseWorkModel(wm) ?? job.work_model;
          }
        } catch (err) {
          console.warn(`[enrichDescriptionsFromApi] failed for sourceId=${job.sourceId}: ${err}`);
        }
      }),
    );
    await sleep(randomDelay());
  }
}

/**
 * For each English-titled job, calls the per-job detail API and sets
 * job.requires_native_language from the structured languages array.
 * Only runs when the config provides both a URL template (using {jobPath})
 * and a regex transform to derive the path from job.url.
 *
 * Skips jobs with non-English titles — they're already flagged by Phase 1a.
 * Skips jobs without a URL (can't build the API request).
 * Leaves requires_native_language unset when the languages array is missing/null
 * so the text classifier can still decide.
 */
async function enrichLanguageRequirementFromApi(
  jobs: RawJob[],
  urlTemplate: string,
  jobUrlTransform: { match: string; replace: string },
  itemsPath: string,
  languagesPath: string,
  headers: Record<string, string>,
): Promise<void> {
  const targets = jobs.filter(
    (j) => j.url && !titleAppearsNonEnglish(j.title) && j.requires_native_language === undefined,
  );
  console.log(`[enrichLanguageRequirementFromApi] ${targets.length} targets (${jobs.length - targets.length} skipped)`);
  const transformRe = new RegExp(jobUrlTransform.match);

  let set = 0;
  let missing = 0;
  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        const jobPath = job.url!.replace(transformRe, jobUrlTransform.replace);
        const fetchUrl = urlTemplate.replace('{jobPath}', jobPath);
        try {
          const data = await fetchPage(fetchUrl, 'GET', undefined, headers);
          const item = getPath(data, itemsPath);
          const languages = getPath(item, languagesPath);
          if (Array.isArray(languages)) {
            job.requires_native_language = languages.some(
              (l: unknown) => typeof l === 'string' && l.toLowerCase() !== 'english',
            );
            set++;
          } else {
            missing++;
          }
        } catch (err) {
          console.warn(`[enrichLanguageRequirementFromApi] failed for ${job.url}: ${err}`);
        }
      }),
    );
    await sleep(randomDelay());
  }
  console.log(`[enrichLanguageRequirementFromApi] done — set: ${set}, missing/skipped: ${missing}`);
}

function buildGetUrl(template: string, param: string, value: number): string {
  if (template.includes(`{${param}}`)) {
    return template.replace(`{${param}}`, String(value));
  }
  const sep = template.includes('?') ? '&' : '?';
  return `${template}${sep}${param}=${value}`;
}

/**
 * Oracle HCM finder-string pagination: inject `offset=N` inside the finder=... value
 * rather than appending it as a standalone query param (which Oracle HCM ignores).
 * Replaces an existing offset if present, otherwise inserts after the limit=N token.
 */
function buildFinderOffsetUrl(template: string, offset: number): string {
  if (/,offset=\d+/.test(template)) {
    return template.replace(/,offset=\d+/, `,offset=${offset}`);
  }
  return template.replace(/(finder=[^&]*?limit=\d+)/, `$1,offset=${offset}`);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = 500, max = 1200) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface FetchSpec {
  url: string;
  method: 'GET' | 'POST';
  body?: Record<string, unknown>;
  bodyType?: 'json' | 'multipart';
  headers: Record<string, string>;
  pagination: CompanyApiConfig['pagination'];
  fields: CompanyApiConfig['fields'];
  itemsPath?: string;
  urlTemplate?: string;
  urlPlaceholders?: Record<string, string>;
  keepQueryParams?: boolean;
  expandSecondaryLocations?: CompanyApiConfig['expandSecondaryLocations'];
  descriptionFields?: string[];
}

export const cleanJobUrl = (rawUrl: string, keepQueryParams = false): string => {
  if (!rawUrl) return '';

  let url = rawUrl;

  // 1. Decode common HTML entities.
  // Two passes: first handles single-encoded (&amp; → &),
  // second handles double-encoded (&amp;amp; → &amp; → &).
  url = url.replace(/&amp;/g, '&');
  url = url.replace(/&amp;/g, '&');

  // 2. Remove tracking/query params (keep only base URL) — unless keepQueryParams is set.
  if (!keepQueryParams) url = url.split('?')[0];

  // 3. Normalize slashes (avoid https://domain.com//job)
  url = url.replace(/([^:]\/)\/+/g, '$1');

  // 4. Trim whitespace just in case
  url = url.trim();

  return url;
};

/** Extract non-array top-level scalars from a response for debug logging. */
function paginationMeta(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const meta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
      meta[k] = v;
    }
  }
  return meta;
}

/** Maps raw items to RawJob[], including secondary-location duplicates if configured. */
function mapItems(
  items: unknown[],
  fields: CompanyApiConfig['fields'],
  urlTemplate: string | undefined,
  expand: CompanyApiConfig['expandSecondaryLocations'],
  descriptionFields?: string[],
  urlPlaceholders?: Record<string, string>,
  keepQueryParams?: boolean,
): RawJob[] {
  const result: RawJob[] = [];
  for (const item of items) {
    const job = mapItem(item, fields, urlTemplate, descriptionFields, urlPlaceholders, keepQueryParams);
    if (!job) continue;
    result.push(job);
    result.push(...expandJobToSecondaryLocations(job, item, expand));
  }
  return result;
}

/** Fetches all jobs from a single endpoint, handling all pagination types. */
async function fetchAllJobsRaw(spec: FetchSpec, label = 'primary'): Promise<RawJob[]> {
  const { url, method, body, bodyType, headers, pagination, fields, itemsPath, urlTemplate, urlPlaceholders, keepQueryParams, expandSecondaryLocations, descriptionFields } = spec;
  const jobs: RawJob[] = [];

  if (pagination.type === 'none') {
    console.log(`[${label}] fetching (no pagination): ${url}`);
    const data = await fetchPage(url, method, body, headers, bodyType);
    if (!data) {
      console.warn(`[${label}] empty response`, { url });
      return jobs;
    }
    const items = extractItems(data, itemsPath);
    jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields, urlPlaceholders, keepQueryParams));
    console.log(`[${label}] fetched ${jobs.length} jobs (single request)`, paginationMeta(data));
  } else if (pagination.type === 'page') {
    const param = pagination.param ?? 'page';
    let page = pagination.startPage ?? 0;
    let totalCount: number | undefined;
    // Track unique jobs for the stop condition — cross-page duplicates must not
    // count toward the total, otherwise we stop early and miss real jobs.
    const uniqueKeys = new Set<string>();

    for (let i = 0; i < MAX_PAGES; i++, page++) {
      const pageUrl = method === 'GET' ? buildGetUrl(url, param, page) : url;
      const pageBody = method === 'POST' ? { ...body, [param]: page } : undefined;
      console.log(`[${label}] fetching page=${page}${method === 'POST' ? ` body.${param}=${page}` : ` url=${pageUrl}`}`);
      const data = await fetchPage(pageUrl, method, pageBody, headers, bodyType);

      if (!data) {
        console.log(`[${label}] stopping: null response at page=${page} (400 = page out of range)`);
        break;
      }

      // Extract total count from first page if a path is configured
      if (totalCount === undefined && pagination.totalCountPath) {
        const raw = getPath(data, pagination.totalCountPath);
        if (typeof raw === 'number') {
          totalCount = raw;
          console.log(`[${label}] total count from API: ${totalCount} (via ${pagination.totalCountPath})`);
        }
      }

      const items = extractItems(data, itemsPath);
      const before = jobs.length;
      for (const job of mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields, urlPlaceholders, keepQueryParams)) {
        jobs.push(job);
        uniqueKeys.add(job.sourceId ?? `${job.title}|${job.location ?? ''}`);
      }
      console.log(`[${label}] page=${page} → ${items.length} items, mapped ${jobs.length - before}, cumulative=${jobs.length}`, paginationMeta(data));

      if (items.length === 0) {
        console.log(`[${label}] stopping: empty page at page=${page}`);
        break;
      }

      if (totalCount !== undefined && uniqueKeys.size >= totalCount) {
        console.log(`[${label}] stopping: ${uniqueKeys.size} unique jobs fetched of ${totalCount}`);
        break;
      }

      await sleep(randomDelay());
    }
  } else if (pagination.type === 'offset') {
    const param = pagination.param ?? 'offset';
    const pageSize = pagination.pageSize;
    let offset = 0;
    let totalCount: number | undefined;

    for (let i = 0; i < MAX_PAGES; i++, offset += pageSize) {
      const pageUrl = method === 'GET' ? buildGetUrl(url, param, offset) : url;
      const pageBody = method === 'POST' ? { ...body, [param]: offset } : undefined;
      console.log(`[${label}] fetching offset=${offset}${method === 'POST' ? `` : ` url=${pageUrl}`}`);
      const data = await fetchPage(pageUrl, method, pageBody, headers, bodyType);

      if (!data) {
        console.warn(`[${label}] empty response at offset=${offset}`, { url: pageUrl });
        break;
      }

      if (totalCount === undefined && pagination.totalCountPath) {
        const raw = getPath(data, pagination.totalCountPath);
        if (typeof raw === 'number') {
          totalCount = raw;
          console.log(`[${label}] total count from API: ${totalCount} (via ${pagination.totalCountPath})`);
        }
      }

      const items = extractItems(data, itemsPath);
      const before = jobs.length;
      jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields, urlPlaceholders, keepQueryParams));
      console.log(`[${label}] offset=${offset} → ${items.length} items, mapped ${jobs.length - before}, cumulative=${jobs.length}`, paginationMeta(data));

      if (items.length === 0) {
        console.log(`[${label}] stopping: empty page at offset=${offset}`);
        break;
      }
      if (totalCount !== undefined && jobs.length >= totalCount) {
        console.log(`[${label}] stopping: ${jobs.length} jobs fetched of ${totalCount}`);
        break;
      }
      if (items.length < pageSize) {
        console.log(`[${label}] stopping: partial page (${items.length} < ${pageSize}) at offset=${offset}`);
        break;
      }

      await sleep(randomDelay());
    }
  } else if (pagination.type === 'finder-offset') {
    const pageSize = pagination.pageSize;
    let offset = 0;

    for (let i = 0; i < MAX_PAGES; i++, offset += pageSize) {
      const pageUrl = buildFinderOffsetUrl(url, offset);
      console.log(`[${label}] fetching finder-offset=${offset} url=${pageUrl}`);
      const data = await fetchPage(pageUrl, method, body, headers, bodyType);

      if (!data) {
        console.warn(`[${label}] empty response at finder-offset=${offset}`, { url: pageUrl });
        break;
      }

      const items = extractItems(data, itemsPath);
      const before = jobs.length;
      jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields, urlPlaceholders, keepQueryParams));
      console.log(`[${label}] finder-offset=${offset} → ${items.length} items, mapped ${jobs.length - before}, cumulative=${jobs.length}`, paginationMeta(data));

      if (items.length === 0) {
        console.log(`[${label}] stopping: empty page at finder-offset=${offset}`);
        break;
      }
      if (items.length < pageSize) {
        console.log(`[${label}] stopping: partial page (${items.length} < ${pageSize}) at finder-offset=${offset}`);
        break;
      }

      await sleep(randomDelay());
    }
  }

  console.log(`[${label}] done — total mapped: ${jobs.length}`);
  return jobs;
}

/** Deduplicate by sourceId (primary key) or title+location fallback. Logs if any removed. */
function deduplicateJobs(jobs: RawJob[], label: string): RawJob[] {
  const seen = new Set<string>();
  const result = jobs.filter((job) => {
    const key = job.sourceId ?? `title:${job.title}|loc:${job.location ?? ''}`;
    if (seen.has(key)) {
      console.log(`[${label}] duplicate removed — sourceId: ${job.sourceId ?? '(none)'}, title: "${job.title}", location: ${job.location ?? '(none)'}`);
      return false;
    }
    seen.add(key);
    return true;
  });
  const removed = jobs.length - result.length;
  if (removed > 0) {
    console.log(`[${label}] removed ${removed} duplicate(s) (${jobs.length} → ${result.length})`);
  }
  return result;
}

export async function fetchCompanyApiJobs(
  config: CompanyApiConfig,
  /** When provided, description enrichment is skipped for jobs not in a tracked country. */
  isTrackedLocation?: (location: string) => boolean,
): Promise<RawJob[]> {
  const method = config.method ?? 'GET';
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    ...config.headers,
  };

  const primarySpec: FetchSpec = {
    url: config.url,
    method,
    body: config.body,
    bodyType: config.bodyType,
    headers,
    pagination: config.pagination,
    fields: config.fields,
    itemsPath: config.itemsPath,
    urlTemplate: config.urlTemplate,
    urlPlaceholders: config.urlPlaceholders,
    keepQueryParams: config.keepQueryParams,
    expandSecondaryLocations: config.expandSecondaryLocations,
    descriptionFields: config.descriptionFields,
  };

  let primaryJobsRaw: RawJob[];
  if (config.repeatFor) {
    // Fetch once per override entry (e.g. one country at a time) and merge results.
    // GET requests: override keys are appended as URL query params.
    // POST requests: override keys are merged into the request body.
    const { body: overrides } = config.repeatFor;
    console.log(`[fetchCompanyApiJobs] repeatFor: ${overrides.length} entries → fetching sequentially`);
    const allRaw: RawJob[] = [];
    for (const override of overrides) {
      const label = Object.values(override).join('/');
      let spec: FetchSpec;
      if (method === 'GET') {
        const params = new URLSearchParams(override).toString();
        const sep = primarySpec.url.includes('?') ? '&' : '?';
        spec = { ...primarySpec, url: `${primarySpec.url}${sep}${params}` };
      } else {
        spec = { ...primarySpec, body: { ...primarySpec.body, ...override } };
      }
      const jobs = await fetchAllJobsRaw(spec, label);
      if (method === 'GET') {
        // Tag each job with the filter country so the same job appearing in
        // multiple country queries survives as a separate entry per country.
        // Without this, dedup by sourceId would collapse them into one, and
        // that one might have an untracked country as its primary location.
        for (const job of jobs) {
          if (job.sourceId) {
            job.descriptionApiId = job.sourceId;
            job.sourceId = `${job.sourceId}-${label}`;
          }
          // Use country_code (checked first in buildScrapeResult) for country
          // resolution so the original location string is preserved for city extraction.
          job.country_code = label;
          // Filter the cities array to only entries matching this country, then
          // extract the city name from each "City,State,Country" string.
          if (job.cities) {
            const matched = job.cities
              .filter((c) => c.toLowerCase().includes(label.toLowerCase()))
              .map((c) => c.split(',')[0].trim())
              .filter(Boolean);
            job.cities = matched.length > 0 ? matched : undefined;
          }
        }
      } else if (config.repeatForCountryField) {
        // POST repeatFor: filter cities to only those belonging to the queried country.
        // Uses CITY_MAP lookup — cities not recognised by CITY_MAP are kept (unknown city
        // in the current country) while cities that resolve to a different country are removed.
        const countryName = override[config.repeatForCountryField];
        if (typeof countryName === 'string') {
          const targetCode = lookupCountryFromLocation(countryName)[0]?.code;
          for (const job of jobs) {
            job.country_code = countryName;
            if (job.cities && targetCode) {
              const filtered = job.cities.filter((city) => {
                const resolved = lookupCountryFromLocation(city);
                return resolved.length === 0 || resolved.some((i) => i.code === targetCode);
              });
              job.cities = filtered.length > 0 ? filtered : undefined;
            }
          }
        }
      }
      allRaw.push(...jobs);
    }
    primaryJobsRaw = allRaw;
  } else {
    console.log(`[fetchCompanyApiJobs] starting primary fetch: ${config.url}`);
    primaryJobsRaw = await fetchAllJobsRaw(primarySpec, 'primary');
  }

  // Deduplicate primary results immediately — some APIs return the same job on
  // multiple pages (e.g. when total count isn't a multiple of the page size).
  const primaryJobs = deduplicateJobs(primaryJobsRaw, 'primary');

  // ── Dual-site merge ────────────────────────────────────────────────────────
  // Some companies run parallel career sites: one in the local language
  // (complete job list) and one in English (richer descriptions, same jobs).
  // Strategy:
  //   1. Primary (native-language) site is the source of truth for the job list.
  //   2. English site is fetched; matching jobs (by sourceId) are fully replaced
  //      with the English version — title, description, URL and all other fields.
  //      This gives the language classifier English content and avoids Finnish
  //      titles showing up as requiring native language when they don't.
  //   3. English-only jobs (no match in primary) are added as new entries.
  // Requires `fields.id` to be set so jobs can be matched across sites.
  if (config.secondaryUrl && config.fields.id) {
    const englishSpec: FetchSpec = {
      url: config.secondaryUrl,
      method,
      body: { ...config.body, ...config.secondaryBody },
      headers,
      pagination: config.pagination,
      fields: config.fields,
      itemsPath: config.itemsPath,
      urlTemplate: config.secondaryUrlTemplate ?? config.urlTemplate,
    };

    console.log(`[fetchCompanyApiJobs] starting secondary (English) fetch: ${config.secondaryUrl}`);
    const englishJobsRaw = await fetchAllJobsRaw(englishSpec, 'secondary');
    const englishJobs = deduplicateJobs(englishJobsRaw, 'secondary');

    if (config.fetchDescription) {
      console.log(`[fetchCompanyApiJobs] enriching descriptions for ${englishJobs.length} English jobs`);
      await enrichDescriptions(englishJobs);
    }

    // Index primary jobs by sourceId for O(1) lookup
    const primaryById = new Map<string, RawJob>();
    for (const job of primaryJobs) {
      if (job.sourceId) primaryById.set(job.sourceId, job);
    }

    let matched = 0;
    let englishOnly = 0;
    for (const englishJob of englishJobs) {
      if (!englishJob.sourceId) continue;
      const primaryJob = primaryById.get(englishJob.sourceId);
      if (primaryJob) {
        // Matched: fully replace the native-language job with the English version.
        // Keep sourceId and fall back to primary location if the English entry lacks one.
        const savedId = primaryJob.sourceId;
        const savedLocation = primaryJob.location;
        Object.assign(primaryJob, englishJob);
        primaryJob.sourceId = savedId;
        if (!primaryJob.location) primaryJob.location = savedLocation;
        matched++;
      } else {
        // No match: this job only exists on the English site — add it.
        primaryJobs.push(englishJob);
        primaryById.set(englishJob.sourceId, englishJob);
        englishOnly++;
      }
    }
    const finnishOnly = primaryJobs.length - matched - englishOnly;
    console.log(`[fetchCompanyApiJobs] merge — replaced with English: ${matched}, English-only additions: ${englishOnly}, Finnish-only: ${finnishOnly}`);
  }

  // Enrich descriptions only for jobs in tracked countries (when a filter is provided).
  // This avoids fetching descriptions for thousands of irrelevant global positions.
  const enrichmentTargets = isTrackedLocation
    ? primaryJobs.filter((j) => {
        // Prefer country_code for the tracked-country check — it's always a resolvable
        // country name/code. Falling back to location can fail when location is a city
        // string not present in the CITY_MAP (e.g. Telia's parallel-expansion jobs).
        const loc = j.country_code ?? j.location;
        return !loc || isTrackedLocation(loc);
      })
    : primaryJobs;

  if (config.fetchDescription || config.locationFromHtml) {
    const locationRegex = config.locationFromHtml ? new RegExp(config.locationFromHtml) : undefined;
    const descriptionRegex = config.descriptionFromHtml ? new RegExp(config.descriptionFromHtml, 's') : undefined;
    await enrichDescriptions(enrichmentTargets, locationRegex, descriptionRegex);
  }

  if (config.descriptionApiUrl && config.descriptionApiFields?.length) {
    const itemsPath = config.descriptionApiItemsPath ?? 'items.0';
    console.log(`[fetchCompanyApiJobs] enriching descriptions via API for ${enrichmentTargets.length} jobs in tracked countries (of ${primaryJobs.length} total)`);
    await enrichDescriptionsFromApi(enrichmentTargets, config.descriptionApiUrl, itemsPath, config.descriptionApiFields, headers, config.descriptionApiLocationField, config.descriptionApiJobFunctionField, config.descriptionApiWorkModelField);
  }

  if (config.descriptionApiUrl && config.descriptionApiUrlFromJobUrl && config.descriptionApiLanguagesPath) {
    const itemsPath = config.descriptionApiItemsPath ?? 'items.0';
    console.log(`[fetchCompanyApiJobs] enriching language requirements via API for ${enrichmentTargets.length} jobs in tracked countries (of ${primaryJobs.length} total)`);
    await enrichLanguageRequirementFromApi(enrichmentTargets, config.descriptionApiUrl, config.descriptionApiUrlFromJobUrl, itemsPath, config.descriptionApiLanguagesPath, headers);
  }

  // Final safety-net dedup (should be a no-op if pagination dedup above caught everything).
  const deduplicated = deduplicateJobs(primaryJobs, 'final');
  console.log(`[fetchCompanyApiJobs] final job count: ${deduplicated.length}`);
  return deduplicated;
}
