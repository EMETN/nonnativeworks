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

function mapItem(item: unknown, fields: CompanyApiConfig['fields'], urlTemplate?: string): RawJob | null {
  const title = getString(item, fields.title);
  if (!title) return null;
  const url = urlTemplate
    ? buildUrlFromTemplate(item, urlTemplate)
    : getString(item, fields.url);
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)' },
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

  const jobs = await fetchAllJobsRaw(primarySpec);

  if (config.secondaryUrl && config.fields.id) {
    const secondarySpec: FetchSpec = {
      url: config.secondaryUrl,
      method,
      body: { ...config.body, ...config.secondaryBody },
      headers,
      pagination: config.pagination,
      fields: config.fields,
      itemsPath: config.itemsPath,
      urlTemplate: config.secondaryUrlTemplate ?? config.urlTemplate,
    };

    const secondaryJobs = await fetchAllJobsRaw(secondarySpec);

    if (config.fetchDescription) {
      await enrichDescriptions(secondaryJobs);
    }

    // Index primary jobs by sourceId for O(1) lookup
    const primaryById = new Map<string, RawJob>();
    for (const job of jobs) {
      if (job.sourceId) primaryById.set(job.sourceId, job);
    }

    for (const secondary of secondaryJobs) {
      if (!secondary.sourceId) continue;
      const primary = primaryById.get(secondary.sourceId);
      if (primary) {
        // Matched: inject English description and URL into the primary job
        primary.descriptionHtml = secondary.descriptionHtml;
        primary.descriptionText = secondary.descriptionText;
        if (secondary.url) primary.url = secondary.url;
      } else {
        // No match in primary: add as a new job
        jobs.push(secondary);
        primaryById.set(secondary.sourceId, secondary);
      }
    }
  }

  // Enrich descriptions for any remaining jobs without one
  // (English-titled jobs not covered by secondary, or when secondaryUrl is not configured).
  // Already-enriched jobs are skipped automatically.
  if (config.fetchDescription) {
    await enrichDescriptions(jobs);
  }

  // Final deduplication. Uses sourceId when available, falls back to title+location
  // for any jobs the API returned without an ID (e.g. pagination overlap on the last page).
  const seen = new Set<string>();
  return jobs.filter((job) => {
    const key = job.sourceId ?? `${job.title}|${job.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
