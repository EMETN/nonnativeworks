import { stripHtml } from '../classifiers/language';
import { enrichDescriptions } from './company-api-fetcher';
import type { RawJob } from './types';

const SITE_URL = 'https://jobs.picnic.app';
const GREENHOUSE_TEMPLATE = 'auto';
const ENGLISH_ALLOWED_RE = /\b(?:Dutch|German|French) or English\b/i;

interface SiteListing {
    name: string;
    template: string;
    url: string;
    data: {
        location: { city?: string; country?: string };
        teams?: string;
    };
}

export async function fetchPicnicSiteJobs(): Promise<RawJob[]> {
    try {
        const res = await fetch(`${SITE_URL}/en/jobs`, {
            headers: { RSC: '1' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const listings = parseListings(await res.text());
        if (listings.length === 0) throw new Error('no job list in the page');
        const jobs = listings
            .filter((listing) => listing.template !== GREENHOUSE_TEMPLATE)
            .map(toRawJob);
        await enrichDescriptions(jobs);
        for (const job of jobs) {
            if (allowsEnglish(job)) job.requires_native_language = false;
        }
        return jobs;
    } catch (err) {
        // Rethrowing would fail the whole Greenhouse board.
        console.warn(`[picnic] site listings skipped: ${err}`);
        return [];
    }
}

// The pages' street addresses (Straße, Mülheim) read as German to the classifier.
function allowsEnglish(job: RawJob): boolean {
    return ENGLISH_ALLOWED_RE.test(stripHtml(job.descriptionHtml ?? ''));
}

function parseListings(rscPayload: string): SiteListing[] {
    for (const row of rscPayload.split('\n')) {
        if (!row.includes('"jobs":[')) continue;
        let listings: SiteListing[] = [];
        JSON.parse(row.slice(row.indexOf(':') + 1), (key, value) => {
            if (key === 'jobs' && Array.isArray(value)) listings = value;
            return value;
        });
        if (listings.length > 0) return listings;
    }
    return [];
}

function toRawJob({ name, url, data }: SiteListing): RawJob {
    const { city, country } = data.location;
    const cityWithoutDistrict = city?.split(' - ')[0];
    return {
        title: name.trim(),
        location: [cityWithoutDistrict, country].filter(Boolean).join(', '),
        url: `${SITE_URL}${url}`,
        department: data.teams,
        jobFunction: data.teams,
    };
}
