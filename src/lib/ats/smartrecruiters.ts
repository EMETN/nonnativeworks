import type { RawJob } from './types';
import { lookupCountryFromLocation } from './country-lookup';
import { TRACKED_COUNTRY_CODES } from '../tracked-countries';
import { titleAppearsNonEnglishExcludingCityNames } from './title-language';
import { isCachedJob, type CachedTitleHashes } from '../outcome-cache';

const API_BASE = 'https://api.smartrecruiters.com/v1/companies';
const PAGE_SIZE = 100;
const DESCRIPTION_CONCURRENCY = 5;

interface SmartRecruitersPosting {
    id: string;
    name: string;
    company?: { identifier?: string; name?: string };
    location?: {
        city?: string;
        country?: string; // ISO alpha-2, lowercase
        remote?: boolean;
        hybrid?: boolean;
        fullLocation?: string;
    };
    function?: { id?: string; label?: string };
}

interface SmartRecruitersListResponse {
    offset: number;
    limit: number;
    totalFound: number;
    content: SmartRecruitersPosting[];
}

interface SmartRecruitersPostingDetail {
    jobAd?: {
        sections?: Record<string, { title?: string; text?: string }>;
    };
}

function postingsUrl(company: string): string {
    return `${API_BASE}/${encodeURIComponent(company)}/postings`;
}

export async function fetchSmartRecruitersJobs(
    company: string,
): Promise<{ jobs: RawJob[]; companyName: string }> {
    const postings: SmartRecruitersPosting[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const res = await fetch(
            `${postingsUrl(company)}?limit=${PAGE_SIZE}&offset=${offset}`,
        );
        if (!res.ok) {
            throw new Error(
                `SmartRecruiters API returned ${res.status} for company "${company}"`,
            );
        }
        const data: SmartRecruitersListResponse = await res.json();
        if (!Array.isArray(data.content)) {
            throw new Error(
                `SmartRecruiters API returned unexpected format for company "${company}"`,
            );
        }
        postings.push(...data.content);
        if (data.content.length === 0 || postings.length >= data.totalFound)
            break;
    }

    const companyName = postings[0]?.company?.name ?? company;

    const jobs: RawJob[] = postings.map((p) => {
        const loc = p.location ?? {};
        return {
            title: p.name,
            location: loc.fullLocation,
            country_code: loc.country?.toUpperCase(),
            city: loc.city || undefined,
            url: `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${p.id}`,
            sourceId: p.id,
            jobFunction: p.function?.label,
            ...(loc.remote
                ? { work_model: 'remote' as const }
                : loc.hybrid
                  ? { work_model: 'hybrid' as const }
                  : {}),
        };
    });

    return { jobs, companyName };
}

export async function enrichSmartRecruitersDescriptions(
    jobs: RawJob[],
    company: string,
    skipUrls?: CachedTitleHashes,
): Promise<void> {
    const targets = jobs.filter(
        (j) =>
            j.sourceId &&
            lookupCountryFromLocation(j.country_code ?? j.location ?? '').some(
                (c) => TRACKED_COUNTRY_CODES.has(c.code),
            ) &&
            !titleAppearsNonEnglishExcludingCityNames(j.title) &&
            !isCachedJob(skipUrls, j.url, j.title),
    );
    console.log(
        `[smartrecruiters] fetching descriptions for ${targets.length} of ${jobs.length} jobs`,
    );

    for (let i = 0; i < targets.length; i += DESCRIPTION_CONCURRENCY) {
        await Promise.all(
            targets.slice(i, i + DESCRIPTION_CONCURRENCY).map(async (job) => {
                try {
                    const res = await fetch(
                        `${postingsUrl(company)}/${encodeURIComponent(job.sourceId!)}`,
                    );
                    if (res.status === 404) {
                        job._gone = true;
                        return;
                    }
                    if (!res.ok) {
                        console.warn(
                            `[smartrecruiters] detail API returned ${res.status} for posting ${job.sourceId}`,
                        );
                        return;
                    }
                    const detail: SmartRecruitersPostingDetail =
                        await res.json();
                    const html = Object.values(detail.jobAd?.sections ?? {})
                        .map((s) => s.text ?? '')
                        .filter(Boolean)
                        .join('\n');
                    if (html) job.descriptionHtml = html;
                } catch (err) {
                    console.warn(
                        `[smartrecruiters] failed to fetch description for posting ${job.sourceId}: ${err}`,
                    );
                }
            }),
        );
    }
}
