import type { RawJob } from './types';
import { stripBilingualSuffix } from './title-language';

interface LeverPosting {
    id: string;
    text: string; // title
    categories: {
        department?: string;
        location?: string;
        team?: string;
        commitment?: string;
    };
    country?: string;
    workplaceType?: string;
    description: string; // HTML
    descriptionPlain: string;
    lists?: { text: string; content: string }[];
    hostedUrl: string;
}

export async function fetchLeverCompanyName(slug: string): Promise<string> {
    // Lever's public API doesn't expose a company name endpoint.
    // Derive from the slug.
    return formatSlug(slug);
}

export async function fetchLeverJobs(
    slug: string,
    opts?: { eu?: boolean },
): Promise<RawJob[]> {
    const apiHost = opts?.eu ? 'api.eu.lever.co' : 'api.lever.co';
    const res = await fetch(
        `https://${apiHost}/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    );
    if (!res.ok) {
        throw new Error(
            `Lever API returned ${res.status} for company "${slug}"`,
        );
    }
    const data: LeverPosting[] = await res.json();
    if (!Array.isArray(data)) {
        throw new Error(
            `Lever API returned unexpected format for company "${slug}"`,
        );
    }
    return data.map((posting) => {
        let html = posting.description;
        let plain = posting.descriptionPlain;
        if (posting.lists?.length) {
            const listsHtml = posting.lists.map((l) => l.content).join('\n');
            const listsPlain = listsHtml
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            html = html + '\n' + listsHtml;
            plain = plain + '\n' + listsPlain;
        }
        return {
            title: stripBilingualSuffix(posting.text),
            descriptionHtml: html,
            descriptionText: plain,
            location: posting.categories?.location,
            url: posting.hostedUrl,
            department: posting.categories?.department,
            ...(posting.country && {
                country_code: posting.country.toUpperCase(),
            }),
            ...(posting.workplaceType && {
                work_model: mapWorkplaceType(posting.workplaceType),
            }),
        };
    });
}

function mapWorkplaceType(
    wt: string,
): 'remote' | 'hybrid' | 'on-site' | undefined {
    const lower = wt.toLowerCase();
    if (lower === 'remote') return 'remote';
    if (lower === 'hybrid') return 'hybrid';
    if (lower === 'onsite' || lower === 'on-site') return 'on-site';
    return undefined;
}

function formatSlug(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
