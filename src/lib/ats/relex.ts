import type { RawJob } from './types';

const API_URL = 'https://www.relexsolutions.com/wp-json/wp/v2';

interface SiteJob {
    title: { rendered: string };
    location: number[];
}

interface SiteLocation {
    id: number;
    name: string;
}

// Greenhouse can list fewer cities than RELEX's own job page.
export async function withRelexSiteLocations(
    jobs: RawJob[],
): Promise<RawJob[]> {
    try {
        const [siteJobs, siteLocations] = await Promise.all([
            fetchJson<SiteJob[]>(
                `${API_URL}/job?per_page=100&_fields=title,location`,
            ),
            fetchJson<SiteLocation[]>(
                `${API_URL}/location?per_page=100&_fields=id,name`,
            ),
        ]);
        const names = new Map(siteLocations.map((l) => [l.id, l.name]));
        const postings = siteJobs.map((job) => ({
            title: titleKey(job.title.rendered),
            cities: job.location.flatMap((id) => names.get(id) ?? []),
        }));
        return jobs.map((job) => {
            const boardCities = job.location?.split(';').map((c) => c.trim());
            const posting = postings.find(
                ({ title, cities }) =>
                    title === titleKey(job.title) &&
                    boardCities?.every((city) => cities.includes(city)),
            );
            return posting
                ? { ...job, location: posting.cities.join('; ') }
                : job;
        });
    } catch (err) {
        // Rethrowing would fail the whole Greenhouse board.
        console.warn(`[relex] site locations skipped: ${err}`);
        return jobs;
    }
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

function titleKey(title: string): string {
    return title
        .replace(/&[#\w]+;/g, ' ')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLowerCase();
}
