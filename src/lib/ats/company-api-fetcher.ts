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

/** Extract a string from a dot-path. Arrays return their first string element. */
function getString(obj: unknown, path: string | undefined): string | undefined {
  if (!path) return undefined;
  const val = getPath(obj, path);
  if (typeof val === 'string') return val || undefined;
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
 * For each job whose title is in English and has a URL, fetch the job page and
 * attach its HTML as descriptionHtml. Jobs with non-English titles are skipped
 * because the title alone is already a high-confidence signal.
 */
async function enrichDescriptions(jobs: RawJob[]): Promise<void> {
  const targets = jobs.filter((j) => j.url && !titleAppearsNonEnglish(j.title));
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

export async function fetchCompanyApiJobs(config: CompanyApiConfig): Promise<RawJob[]> {
  const method = config.method ?? 'GET';
  const headers = config.headers ?? {};
  const jobs: RawJob[] = [];

  if (config.pagination.type === 'none') {
    const data = await fetchPage(config.url, method, config.body, headers);
    for (const item of extractItems(data, config.itemsPath)) {
      const job = mapItem(item, config.fields);
      if (job) jobs.push(job);
    }
  } else if (config.pagination.type === 'page') {
    const param = config.pagination.param ?? 'page';
    let page = config.pagination.startPage ?? 1;

    for (let i = 0; i < MAX_PAGES; i++, page++) {
      const url = method === 'GET' ? buildGetUrl(config.url, param, page) : config.url;
      const body = method === 'POST' ? { ...config.body, [param]: page } : undefined;
      const data = await fetchPage(url, method, body, headers);
      const items = extractItems(data, config.itemsPath);
      if (items.length === 0) break;
      for (const item of items) {
        const job = mapItem(item, config.fields, config.urlTemplate);
        if (job) jobs.push(job);
      }
    }
  } else if (config.pagination.type === 'offset') {
    const param = config.pagination.param ?? 'offset';
    const pageSize = config.pagination.pageSize;
    let offset = 0;

    for (let i = 0; i < MAX_PAGES; i++, offset += pageSize) {
      const url = method === 'GET' ? buildGetUrl(config.url, param, offset) : config.url;
      const body = method === 'POST' ? { ...config.body, [param]: offset } : undefined;
      const data = await fetchPage(url, method, body, headers);
      const items = extractItems(data, config.itemsPath);
      if (items.length === 0) break;
      for (const item of items) {
        const job = mapItem(item, config.fields, config.urlTemplate);
        if (job) jobs.push(job);
      }
      if (items.length < pageSize) break;
    }
  }

  if (config.fetchDescription) await enrichDescriptions(jobs);
  return jobs;
}
