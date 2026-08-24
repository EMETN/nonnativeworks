import type { RawJob } from './types';

interface GreenhouseJob {
    id: number;
    title: string;
    location: { name: string };
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
        location: job.location?.name,
        url: descriptionDomain
            ? `https://${descriptionDomain}/jobs/${job.id}`
            : job.absolute_url,
        department: job.departments?.[0]?.name,
        jobFunction: job.departments?.[0]?.name,
    }));
}

function formatSlug(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
