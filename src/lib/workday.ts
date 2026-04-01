import type { RawJob } from './ats/types';
import { titleAppearsNonEnglish } from './ats/title-language';

const DESCRIPTION_BATCH = 5;

function extractOgDescription(html: string): string | undefined {
  const m = html.match(/<meta[^>]+(?:name="description"|property="og:description")[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:name="description"|property="og:description")/i);
  return m?.[1] ? m[1].trim() : undefined;
}

export async function enrichWorkdayDescriptions(jobs: RawJob[]): Promise<void> {
  const targets = jobs.filter((j) => j.url && !titleAppearsNonEnglish(j.title) && !j.descriptionText);
  console.log(`[workday] enriching descriptions for ${targets.length}/${jobs.length} jobs`);

  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        try {
          const res = await fetch(job.url!, { headers: { 'User-Agent': 'Mozilla/5.0' } });
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
}

/**
 * Parse a Workday career page URL into its component parts.
 * e.g. https://posti.wd3.myworkdayjobs.com/fi-FI/external
 *   → { host: 'posti.wd3.myworkdayjobs.com', company: 'posti', site: 'external' }
 *
 * The locale segment (e.g. fi-FI) is skipped — the API path uses only the
 * site name (last path segment).
 */
export function parseWorkdayUrl(url: string): WorkdayUrlParts | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('.myworkdayjobs.com')) return null;
    const company = parsed.hostname.split('.')[0];
    const segments = parsed.pathname.split('/').filter(Boolean);
    const site = segments[segments.length - 1];
    if (!company || !site) return null;
    return { host: parsed.hostname, company, site };
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

export async function fetchWorkdayJobs(parts: WorkdayUrlParts): Promise<RawJob[]> {
  const endpoint = `https://${parts.host}/wday/cxs/${parts.company}/${parts.site}/jobs`;
  const allJobs: RawJob[] = [];
  let offset = 0;

  while (true) {
    const origin = `https://${parts.host}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'origin': origin,
        'referer': `${origin}/`,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ appliedFacets: {}, limit: PAGE_SIZE, offset, searchText: '' }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Workday API returned ${res.status} for "${parts.company}/${parts.site}": ${body}`);
    }

    const data: WorkdayResponse = await res.json();
    const postings = data.jobPostings ?? [];

    for (const job of postings) {
      allJobs.push({
        title: job.title,
        location: job.locationsText,
        url: `https://${parts.host}/en-US/${parts.site}${job.externalPath}`,
      });
    }

    offset += PAGE_SIZE;
    if (postings.length < PAGE_SIZE) break;
  }

  return allJobs;
}
