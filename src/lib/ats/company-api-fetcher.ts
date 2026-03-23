import type { RawJob } from './types';
import type { CompanyApiConfig } from './company-apis';

const MAX_PAGES = 50;        // safety cap to avoid infinite loops
const DESCRIPTION_BATCH = 5; // concurrent page fetches when enriching descriptions

/** Resolve a dot-path like "response.unifiedStandardTitle" into a nested value. */
function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce((cur: unknown, key) => {
    if (cur !== null && typeof cur === 'object' && key in (cur as object)) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
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
): RawJob | null {
  const title = getString(item, fields.title);
  if (!title) return null;

  let url = urlTemplate
    ? buildUrlFromTemplate(item, urlTemplate)
    : getString(item, fields.url);

  if (url) {
    url = cleanJobUrl(url);
  }

  let descriptionText: string | undefined;
  if (descriptionFields?.length) {
    const parts = descriptionFields
      .map((p) => getString(item, p))
      .filter((v): v is string => !!v);
    if (parts.length) descriptionText = parts.join(' ');
  }

  return {
    title,
    location: getString(item, fields.location),
    url: url || undefined,
    department: getString(item, fields.department),
    sourceId: fields.id ? getString(item, fields.id) : undefined,
    descriptionText,
  };
}

/**
 * If expandSecondaryLocations is configured, returns additional RawJob copies for
 * each secondary country on the item (e.g. Nokia jobs listed in multiple countries).
 * Each copy gets the secondary country as its location and a suffixed sourceId so
 * deduplication treats it as a distinct entry.
 */
function expandJobToSecondaryLocations(
  primaryJob: RawJob,
  item: unknown,
  expand: CompanyApiConfig['expandSecondaryLocations'],
): RawJob[] {
  if (!expand) return [];
  const secondaries = getPath(item, expand.path);
  if (!Array.isArray(secondaries) || secondaries.length === 0) return [];

  const extras: RawJob[] = [];
  for (const sec of secondaries) {
    const countryName = getString(sec, expand.countryName);
    if (!countryName || countryName === primaryJob.location) continue;
    extras.push({
      ...primaryJob,
      location: countryName,
      sourceId: primaryJob.sourceId ? `${primaryJob.sourceId}-${countryName}` : undefined,
    });
  }
  return extras;
}

async function fetchPage(
  url: string,
  method: 'GET' | 'POST',
  body: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers: { Accept: 'application/json', ...headers },
  };
  if (method === 'POST') {
    init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const res = await fetch(url, init);
  // 400 signals "page out of range" on some APIs (e.g. WordPress REST API returns 400
  // with rest_post_invalid_page_number instead of an empty array). Treat as graceful end.
  if (res.status === 400) return null;
  if (!res.ok) throw new Error(`Company API returned ${res.status} for ${url}`);
  return res.json();
}

/** Returns true when the title contains non-ASCII chars typical of non-English languages. */
function titleAppearsNonEnglish(title: string): boolean {
  return /[äöüåéèêëàâîïôùûçñßãõøæœ]/i.test(title);
}

async function fetchPageHtml(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.warn(`[fetchPageHtml] HTTP ${res.status} for ${url}`);
      return undefined;
    }
    return await res.text();
  } catch (err) {
    console.warn(`[fetchPageHtml] fetch failed for ${url}: ${err}`);
    return undefined;
  }
}

/**
 * For each job that needs HTML — either for description classification (English title,
 * no existing HTML) or for location extraction (no location yet) — fetch the job page.
 * Attaches descriptionHtml for English-titled jobs; extracts location via regex if provided.
 */
async function enrichDescriptions(jobs: RawJob[], locationRegex?: RegExp): Promise<void> {
  const targets = jobs.filter((j) => {
    if (!j.url) return false;
    const wantsDescription = !titleAppearsNonEnglish(j.title) && !j.descriptionHtml;
    const wantsLocation = !!locationRegex && !j.location;
    return wantsDescription || wantsLocation;
  });

  const noUrl = jobs.length - targets.length;
  console.log(`[enrichDescriptions] ${targets.length} targets (${noUrl} skipped — no url or already enriched), locationRegex=${locationRegex ?? 'none'}`);

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
        if (!titleAppearsNonEnglish(job.title)) {
          job.descriptionHtml = html;
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
}

/**
 * Fetches full job descriptions from a dedicated JSON API endpoint, one job at a time.
 * Uses sourceId to build the URL from the template. Skips jobs with non-English titles
 * and jobs that already have a description.
 */
async function enrichDescriptionsFromApi(
  jobs: RawJob[],
  urlTemplate: string,
  itemsPath: string,
  fields: string[],
  headers: Record<string, string>,
): Promise<void> {
  const targets = jobs.filter((j) => j.sourceId && !titleAppearsNonEnglish(j.title) && !j.descriptionText && !j.descriptionHtml);
  console.log(`[enrichDescriptionsFromApi] fetching descriptions for ${targets.length} jobs`);
  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        const url = urlTemplate.replace('{sourceId}', encodeURIComponent(job.sourceId!));
        try {
          const data = await fetchPage(url, 'GET', undefined, headers);
          const item = getPath(data, itemsPath);
          const parts = fields
            .map((f) => getString(item, f))
            .filter((v): v is string => !!v);
          if (parts.length) job.descriptionText = parts.join(' ');
        } catch (err) {
          console.warn(`[enrichDescriptionsFromApi] failed for sourceId=${job.sourceId}: ${err}`);
        }
      }),
    );
    await sleep(randomDelay());
  }
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
  headers: Record<string, string>;
  pagination: CompanyApiConfig['pagination'];
  fields: CompanyApiConfig['fields'];
  itemsPath?: string;
  urlTemplate?: string;
  expandSecondaryLocations?: CompanyApiConfig['expandSecondaryLocations'];
  descriptionFields?: string[];
}

export const cleanJobUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';

  let url = rawUrl;

  // 1. Decode common HTML entities.
  // Two passes: first handles single-encoded (&amp; → &),
  // second handles double-encoded (&amp;amp; → &amp; → &).
  url = url.replace(/&amp;/g, '&');
  url = url.replace(/&amp;/g, '&');

  // 2. Remove tracking/query params (keep only base URL)
  url = url.split('?')[0];

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
): RawJob[] {
  const result: RawJob[] = [];
  for (const item of items) {
    const job = mapItem(item, fields, urlTemplate, descriptionFields);
    if (!job) continue;
    result.push(job);
    result.push(...expandJobToSecondaryLocations(job, item, expand));
  }
  return result;
}

/** Fetches all jobs from a single endpoint, handling all pagination types. */
async function fetchAllJobsRaw(spec: FetchSpec, label = 'primary'): Promise<RawJob[]> {
  const { url, method, body, headers, pagination, fields, itemsPath, urlTemplate, expandSecondaryLocations, descriptionFields } = spec;
  const jobs: RawJob[] = [];

  if (pagination.type === 'none') {
    console.log(`[${label}] fetching (no pagination): ${url}`);
    const data = await fetchPage(url, method, body, headers);
    if (!data) {
      console.warn(`[${label}] empty response`, { url });
      return jobs;
    }
    const items = extractItems(data, itemsPath);
    jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields));
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
      const data = await fetchPage(pageUrl, method, pageBody, headers);

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
      for (const job of mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields)) {
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

    for (let i = 0; i < MAX_PAGES; i++, offset += pageSize) {
      const pageUrl = method === 'GET' ? buildGetUrl(url, param, offset) : url;
      const pageBody = method === 'POST' ? { ...body, [param]: offset } : undefined;
      console.log(`[${label}] fetching offset=${offset}${method === 'POST' ? `` : ` url=${pageUrl}`}`);
      const data = await fetchPage(pageUrl, method, pageBody, headers);

      if (!data) {
        console.warn(`[${label}] empty response at offset=${offset}`, { url: pageUrl });
        break;
      }

      const items = extractItems(data, itemsPath);
      const before = jobs.length;
      jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields));
      console.log(`[${label}] offset=${offset} → ${items.length} items, mapped ${jobs.length - before}, cumulative=${jobs.length}`, paginationMeta(data));

      if (items.length === 0) {
        console.log(`[${label}] stopping: empty page at offset=${offset}`);
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
      const data = await fetchPage(pageUrl, method, body, headers);

      if (!data) {
        console.warn(`[${label}] empty response at finder-offset=${offset}`, { url: pageUrl });
        break;
      }

      const items = extractItems(data, itemsPath);
      const before = jobs.length;
      jobs.push(...mapItems(items, fields, urlTemplate, expandSecondaryLocations, descriptionFields));
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
    headers,
    pagination: config.pagination,
    fields: config.fields,
    itemsPath: config.itemsPath,
    urlTemplate: config.urlTemplate,
    expandSecondaryLocations: config.expandSecondaryLocations,
    descriptionFields: config.descriptionFields,
  };

  console.log(`[fetchCompanyApiJobs] starting primary fetch: ${config.url}`);
  const primaryJobsRaw = await fetchAllJobsRaw(primarySpec, 'primary');

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
    ? primaryJobs.filter((j) => !j.location || isTrackedLocation(j.location))
    : primaryJobs;

  if (config.fetchDescription || config.locationFromHtml) {
    const locationRegex = config.locationFromHtml ? new RegExp(config.locationFromHtml) : undefined;
    await enrichDescriptions(enrichmentTargets, locationRegex);
  }

  if (config.descriptionApiUrl && config.descriptionApiFields?.length) {
    const itemsPath = config.descriptionApiItemsPath ?? 'items.0';
    console.log(`[fetchCompanyApiJobs] enriching descriptions via API for ${enrichmentTargets.length} jobs in tracked countries (of ${primaryJobs.length} total)`);
    await enrichDescriptionsFromApi(enrichmentTargets, config.descriptionApiUrl, itemsPath, config.descriptionApiFields, headers);
  }

  // Final safety-net dedup (should be a no-op if pagination dedup above caught everything).
  const deduplicated = deduplicateJobs(primaryJobs, 'final');
  console.log(`[fetchCompanyApiJobs] final job count: ${deduplicated.length}`);
  return deduplicated;
}
