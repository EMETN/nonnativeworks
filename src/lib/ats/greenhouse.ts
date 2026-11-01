import { lookupCountryFromLocation } from './country-lookup';
import { fetchPicnicSiteJobs } from './picnic';
import { withRelexSiteLocations } from './relex';
import type { RawJob } from './types';

interface GreenhouseJob {
    id: number;
    title: string;
    location: { name: string };
    offices?: { name: string }[];
    content: string; // HTML
    departments: { name: string }[];
    absolute_url: string;
}

interface GreenhouseBoard {
    name: string;
}

// absolute_url has no description here: GetYourGuide's is apply-only, Nebius's the job list.
const DESCRIPTION_PAGE_URLS: Record<string, (jobId: number) => string> = {
    getyourguide: (jobId) => `https://www.getyourguide.careers/jobs/${jobId}`,
    nebius: (jobId) => `https://careers.nebius.com/job?gh_jid=${jobId}`,
};

const LANGUAGE_BOARDS: Record<string, string[]> = {
    vinteden: ['vintedfr', 'vintedde', 'vintedes'],
};

const OFF_BOARD_JOBS: Record<string, () => Promise<RawJob[]>> = {
    teampicnic: fetchPicnicSiteJobs,
};

const LOCATION_ENRICHERS: Record<
    string,
    (jobs: RawJob[]) => Promise<RawJob[]>
> = {
    relex: withRelexSiteLocations,
};

export async function fetchGreenhouseCompanyName(
    slug: string,
): Promise<string> {
    try {
        const res = await fetch(
            `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`,
        );
        if (!res.ok) return formatSlug(slug);
        const data: GreenhouseBoard = await res.json();
        const name = data.name ?? formatSlug(slug);
        return name.replace(/\s*-\s*English$/i, '').trim();
    } catch {
        return formatSlug(slug);
    }
}

export async function fetchGreenhouseJobs(slug: string): Promise<RawJob[]> {
    const boards = [slug, ...(LANGUAGE_BOARDS[slug] ?? [])];
    const [boardJobs, offBoardJobs] = await Promise.all([
        Promise.all(boards.map(fetchBoardJobs)),
        OFF_BOARD_JOBS[slug]?.() ?? [],
    ]);
    const jobs = [...boardJobs.flat(), ...offBoardJobs];
    return LOCATION_ENRICHERS[slug]?.(jobs) ?? jobs;
}

async function fetchBoardJobs(slug: string): Promise<RawJob[]> {
    const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    );
    if (!res.ok) {
        throw new Error(
            `Greenhouse API returned ${res.status} for board "${slug}"`,
        );
    }
    const data: { jobs: GreenhouseJob[] } = await res.json();
    const descriptionPageUrl = DESCRIPTION_PAGE_URLS[slug];
    return (data.jobs ?? []).map((job) => ({
        title: job.title,
        descriptionHtml: job.content,
        location: locationWithOfficeFallback(job),
        url: descriptionPageUrl?.(job.id) ?? job.absolute_url,
        department: job.departments?.[0]?.name,
        jobFunction: job.departments?.[0]?.name,
    }));
}

const REGION_LOCATION_RE =
    /^(remote\s*[-–]\s*)?(europe|emea|apac|latam|americas)$/i;

function locationWithOfficeFallback(job: GreenhouseJob): string | undefined {
    const location = job.location?.name;
    if (lookupCountryFromLocation(location ?? '').length > 0) return location;
    if (REGION_LOCATION_RE.test(location?.trim() ?? '')) return location;
    const offices = (job.offices ?? []).map((office) => office.name);
    if (offices.length === 0) return location;
    return [location, ...offices].filter(Boolean).join('; ');
}

function formatSlug(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
