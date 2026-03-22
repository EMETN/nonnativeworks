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
  urlTemplate?: string
): RawJob | null {
  const title = getString(item, fields.title);
  if (!title) return null;
  
  let url = urlTemplate
    ? buildUrlFromTemplate(item, urlTemplate)
    : getString(item, fields.url);
  
  if (url) {
    url = cleanJobUrl(url);
  }

  return {
    title,
    location: getString(item, fields.location),
    url: url || undefined,
    department: getString(item, fields.department),
    sourceId: fields.id ? getString(item, fields.id) : undefined,
  };
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
    return res.ok ? await res.text() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * For each job whose title is in English, has a URL, and does not already have a description
 * (e.g. from a secondary merge), fetch the job page and attach its HTML as descriptionHtml.
 * Jobs with non-English titles are skipped — the title alone is already a high-confidence signal.
 */
async function enrichDescriptions(jobs: RawJob[]): Promise<void> {
  const targets = jobs.filter((j) => j.url && !titleAppearsNonEnglish(j.title) && !j.descriptionHtml);
  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        job.descriptionHtml = await fetchPageHtml(job.url!);
      }),
    );
  }
}

function buildGetUrl(template: string, param: string, value: number): string {
  if (template.includes(`{${param}}`)) {
    return template.replace(`{${param}}`, String(value));
  }
  const sep = template.includes('?') ? '&' : '?';
  return `${template}${sep}${param}=${value}`;
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

/** Fetches all jobs from a single endpoint, handling all pagination types. */
async function fetchAllJobsRaw(spec: FetchSpec): Promise<RawJob[]> {
  const { url, method, body, headers, pagination, fields, itemsPath, urlTemplate } = spec;
  const jobs: RawJob[] = [];

  if (pagination.type === 'none') {
    const data = await fetchPage(url, method, body, headers);
    if (!data) {
      console.warn('Empty response (no pagination)', { url });
      return jobs;
    }
    for (const item of extractItems(data, itemsPath)) {
      const job = mapItem(item, fields, urlTemplate);
      if (job) jobs.push(job);
    }
  } else if (pagination.type === 'page') {
    const param = pagination.param ?? 'page';
    let page = pagination.startPage ?? 0;

    for (let i = 0; i < MAX_PAGES; i++, page++) {
      const pageUrl = method === 'GET' ? buildGetUrl(url, param, page) : url;
      const pageBody = method === 'POST' ? { ...body, [param]: page } : undefined;
      const data = await fetchPage(pageUrl, method, pageBody, headers);

      if (!data) {
        console.warn('Empty response (page)', { url: pageUrl, page });
        break;
      }

      const items = extractItems(data, itemsPath);
      if (items.length === 0) break;
      for (const item of items) {
        const job = mapItem(item, fields, urlTemplate);
        if (job) jobs.push(job);
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
      const data = await fetchPage(pageUrl, method, pageBody, headers);

      if (!data) {
        console.warn('Empty response (offset)', { url: pageUrl, offset });
        break;
      }

      const items = extractItems(data, itemsPath);
      if (items.length === 0) break;
      for (const item of items) {
        const job = mapItem(item, fields, urlTemplate);
        if (job) jobs.push(job);
      }
      if (items.length < pageSize) break;

      await sleep(randomDelay());
    }
  }

  return jobs;
}

export async function fetchCompanyApiJobs(config: CompanyApiConfig): Promise<RawJob[]> {
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
  };

  const primaryJobs = await fetchAllJobsRaw(primarySpec);

  // ── Dual-site merge ────────────────────────────────────────────────────────
  // Some companies run parallel career sites: one in the local language
  // (complete job list) and one in English (richer descriptions, same jobs).
  // Strategy:
  //   1. Primary (native-language) site is the source of truth for the job list.
  //   2. English site is fetched and its descriptions are injected into the
  //      matching primary jobs by sourceId, giving the language classifier
  //      English-language content to analyse.
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

    const englishJobs = await fetchAllJobsRaw(englishSpec);

    if (config.fetchDescription) {
      await enrichDescriptions(englishJobs);
    }

    // Index primary jobs by sourceId for O(1) lookup
    const primaryById = new Map<string, RawJob>();
    for (const job of primaryJobs) {
      if (job.sourceId) primaryById.set(job.sourceId, job);
    }

    for (const englishJob of englishJobs) {
      if (!englishJob.sourceId) continue;
      const primaryJob = primaryById.get(englishJob.sourceId);
      if (primaryJob) {
        // Matched: replace native-language description with the English one
        // so the language classifier receives English content to analyse.
        primaryJob.descriptionHtml = englishJob.descriptionHtml;
        primaryJob.descriptionText = englishJob.descriptionText;
        if (englishJob.url) primaryJob.url = englishJob.url;
      } else {
        // No match: this job only exists on the English site — add it.
        primaryJobs.push(englishJob);
        primaryById.set(englishJob.sourceId, englishJob);
      }
    }
  }

  // Enrich descriptions for any remaining jobs without one
  // (English-titled jobs not covered by the English site, or when secondaryUrl
  // is not configured). Already-enriched jobs are skipped automatically.
  if (config.fetchDescription) {
    await enrichDescriptions(primaryJobs);
  }

  // Final deduplication by sourceId, falling back to title+location for jobs
  // returned without a stable ID (e.g. pagination overlap on the last page).
  const seen = new Set<string>();
  return primaryJobs.filter((job) => {
    const key = job.sourceId ?? `${job.title}|${job.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
