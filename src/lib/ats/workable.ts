import type { RawJob } from './types';
import { titleAppearsNonEnglishExcludingCityNames } from './title-language';

const DESCRIPTION_BATCH = 1;

interface WorkableLocation {
  country: string;
  countryCode: string;
  city: string;
  region: string;
  hidden: boolean;
}

interface WorkableJob {
  title: string;
  shortcode: string;
  url: string;
  department?: string;
  country?: string;
  city?: string;
  locations?: WorkableLocation[];
}

interface WorkableResponse {
  name: string;
  jobs: WorkableJob[];
}

interface WorkableJobDetail {
  description?: string; // HTML
}

export async function fetchWorkableCompanyName(
  account: string,
): Promise<string> {
  try {
    const res = await fetch(
      `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}`,
    );

    if (!res.ok) return formatSlug(account);

    const data: WorkableResponse = await res.json();
    return data.name ?? formatSlug(account);
  } catch {
    return formatSlug(account);
  }
}

export async function fetchWorkableJobs(
  account: string,
): Promise<RawJob[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Workable API returned ${res.status} for account "${account}"`,
    );
  }

  const data: WorkableResponse = await res.json();

  return (data.jobs ?? []).map((job) => {
    const primaryLocation = job.locations?.[0];
    return {
      title: job.title,
      location: job.city && job.country ? `${job.city}, ${job.country}` : (job.country ?? primaryLocation?.country),
      country_code: primaryLocation?.countryCode,
      url: job.url,
      department: job.department,
      sourceId: job.shortcode,
    };
  });
}

export async function enrichWorkableDescriptions(jobs: RawJob[], account: string, skipUrls?: Set<string>): Promise<void> {
  const targets = jobs.filter((j) => j.sourceId && !titleAppearsNonEnglishExcludingCityNames(j.title) && !(j.url && skipUrls?.has(j.url)));
  console.log(`[workable] fetching descriptions for ${targets.length} of ${jobs.length} jobs`);

  for (let i = 0; i < targets.length; i += DESCRIPTION_BATCH) {
    if (i > 0) await sleep(2000);
    await Promise.all(
      targets.slice(i, i + DESCRIPTION_BATCH).map(async (job) => {
        try {
          const res = await fetch(
            `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(account)}/jobs/${encodeURIComponent(job.sourceId!)}`,
            {
              headers: {
                'accept': 'application/json, text/plain, */*',
                'accept-language': 'en',
                'referer': `https://apply.workable.com/${encodeURIComponent(account)}/j/${job.sourceId}/`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              },
            },
          );
          if (!res.ok) {
            console.warn(`[workable] v2 API returned ${res.status} for job ${job.sourceId}`);
            return;
          }
          const detail: WorkableJobDetail = await res.json();
          if (detail.description) job.descriptionHtml = detail.description;
        } catch (err) {
          console.warn(`[workable] failed to fetch description for job ${job.sourceId}: ${err}`);
        }
      }),
    );
  }
}


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSlug(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
