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
): Promise<string[]> {
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
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    const info = data.jobPostingInfo ?? data;
    const primary = typeof info.location === "string" ? info.location : undefined;
    const additional: string[] = Array.isArray(info.additionalLocations)
      ? (info.additionalLocations as unknown[]).filter((l): l is string => typeof l === "string")
      : [];
    const all = [primary, ...additional].filter(
      (l): l is string => l !== undefined && l.length > 0,
    );
    if (all.length === 0) {
      console.log(`[workday] no locations in detail response for ${externalPath} — keys: ${Object.keys(info).join(", ")}`);
    }
    return all;
  } catch (e) {
    console.log(`[workday] detail fetch error for ${externalPath}: ${e}`);
    return [];
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
          const locations = await fetchJobLocations(
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
