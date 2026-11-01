import { lookupCountryFromLocation } from './country-lookup';
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

/**
 * Some companies' Greenhouse boards serve an apply-only page at absolute_url —
 * no job description, just the application form (e.g. GetYourGuide). They have
 * their own branded career site that renders the description around the same
 * embedded form, at the same job id path. Prefer that URL when known.
 */
const DESCRIPTION_PAGE_DOMAINS: Record<string, string> = {
    getyourguide: 'www.getyourguide.careers',
};

const LANGUAGE_BOARDS: Record<string, string[]> = {
    vinteden: ['vintedfr', 'vintedde', 'vintedes'],
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
    return (await Promise.all(boards.map(fetchBoardJobs))).flat();
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
    const descriptionDomain = DESCRIPTION_PAGE_DOMAINS[slug];
    return (data.jobs ?? []).map((job) => ({
        title: job.title,
        descriptionHtml: job.content,
        location: locationWithOfficeFallback(job),
        url: descriptionDomain
            ? `https://${descriptionDomain}/jobs/${job.id}`
            : job.absolute_url,
        department: job.departments?.[0]?.name,
        jobFunction: job.departments?.[0]?.name,
    }));
}

function locationWithOfficeFallback(job: GreenhouseJob): string | undefined {
    const location = job.location?.name;
    if (lookupCountryFromLocation(location ?? '').length > 0) return location;
    const offices = (job.offices ?? []).map((office) => office.name);
    if (offices.length === 0) return location;
    return [location, ...offices].filter(Boolean).join('; ');
}

function formatSlug(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
