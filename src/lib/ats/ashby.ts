import type { RawJob } from './types';
import { lookupCountryFromLocation } from './country-lookup';

interface AshbyAddress {
    postalAddress?: {
        addressLocality?: string;
        addressRegion?: string;
        addressCountry?: string;
    };
}

interface AshbySecondaryLocation {
    location?: string;
    address?: AshbyAddress;
}

interface AshbyJobPosting {
    id: string;
    title: string;
    team?: string;
    department?: string;
    /** Human-readable location string — typically a city name (e.g. "Helsinki"). */
    location?: string;
    address?: AshbyAddress;
    secondaryLocations?: AshbySecondaryLocation[];
    employmentType?: string;
    workPlaceType?: string;
    jobUrl: string;
    descriptionHtml?: string;
    isRemote?: boolean | null;
    isListed?: boolean;
}

interface AshbyResponse {
    apiVersion?: string;
    jobs: AshbyJobPosting[];
}

// Some Ashby customers host the board only on their own domain and disable the
// jobs.ashbyhq.com page, so posting.jobUrl 404s. Map slug to a builder for the
// working public URL.
const CUSTOM_JOB_URL_BUILDERS: Record<
    string,
    (posting: AshbyJobPosting) => string
> = {
    supercell: (p) =>
        `https://supercell.com/en/careers/${titleSlug(p.title)}/${p.id}/`,
};

function titleSlug(title: string): string {
    // Drop punctuation first so "R.I.S.E" becomes "rise", not "r-i-s-e"; only then
    // turn whitespace runs into hyphens. Matches Ashby's own slug generation.
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export async function fetchAshbyJobsAndCompanyName(
    slug: string,
): Promise<{ jobs: RawJob[]; companyName: string }> {
    const res = await fetch(
        `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    );
    if (!res.ok) {
        throw new Error(
            `Ashby API returned ${res.status} for company "${slug}"`,
        );
    }
    const data: AshbyResponse = await res.json();
    if (!Array.isArray(data.jobs)) {
        throw new Error(
            `Ashby API returned unexpected format for company "${slug}"`,
        );
    }
    const buildUrl = CUSTOM_JOB_URL_BUILDERS[slug.toLowerCase()];
    return {
        // Ashby doesn't return a company name in this endpoint — derive from slug
        companyName: formatSlug(slug),
        // Skip unlisted postings; they 404 on the public board. Keep any that omit
        // the field so a future API change can't silently drop every job.
        jobs: data.jobs
            .filter((posting) => posting.isListed !== false)
            .flatMap((posting) => mapAshbyPosting(posting, buildUrl)),
    };
}

const REGION_LABELS = new Set([
    'emea',
    'apac',
    'americas',
    'latam',
    'mena',
    'global',
    'worldwide',
    'eu',
    'nordics',
    'latin america',
]);

function isRegionLabel(s: string): boolean {
    return REGION_LABELS.has(s.toLowerCase().trim());
}

export function mapAshbyPosting(
    posting: AshbyJobPosting,
    buildUrl?: (posting: AshbyJobPosting) => string,
): RawJob[] {
    const workPlace = posting.workPlaceType?.toLowerCase();
    const workModel: RawJob['work_model'] =
        workPlace === 'remote' || posting.isRemote
            ? 'remote'
            : workPlace === 'hybrid'
              ? 'hybrid'
              : workPlace === 'on-site' || workPlace === 'onsite'
                ? 'on-site'
                : undefined;

    const base = {
        title: posting.title,
        descriptionHtml: posting.descriptionHtml,
        url: buildUrl ? buildUrl(posting) : posting.jobUrl,
        jobFunction: posting.team ?? posting.department,
        work_model: workModel,
    };

    const secondaries = posting.secondaryLocations ?? [];

    if (secondaries.length === 0) {
        return [
            {
                ...base,
                location:
                    posting.address?.postalAddress?.addressCountry ??
                    posting.location,
                city:
                    posting.location ??
                    posting.address?.postalAddress?.addressLocality,
            },
        ];
    }

    // Multi-location: group secondary locations by country, merging cities within
    // the same country into one RawJob entry.
    const byCountry = new Map<string, string[]>();
    const unstructured: string[] = [];

    const addLocation = (
        country: string | undefined,
        locString: string | undefined,
    ) => {
        if (country) {
            if (!byCountry.has(country)) byCountry.set(country, []);
            if (locString) byCountry.get(country)!.push(locString);
        } else if (locString && !isRegionLabel(locString)) {
            unstructured.push(locString);
        }
    };

    for (const sec of secondaries) {
        addLocation(
            sec.address?.postalAddress?.addressCountry,
            sec.location ?? sec.address?.postalAddress?.addressLocality,
        );
    }

    // Ashby's primary is usually a summary duplicating a secondary, but not always
    // (Mapbox lists a distinct country as primary). Add it only when it resolves to a
    // country the secondaries miss — avoids both dropping it and double-counting.
    const primaryCountry = posting.address?.postalAddress?.addressCountry;
    const primaryLoc =
        posting.location ?? posting.address?.postalAddress?.addressLocality;
    const secondaryCodes = new Set(
        [...byCountry.keys(), ...unstructured].flatMap((s) =>
            lookupCountryFromLocation(s).map((c) => c.code),
        ),
    );
    const primaryCodes = lookupCountryFromLocation(
        primaryCountry ?? primaryLoc ?? '',
    ).map((c) => c.code);
    if (primaryCodes.some((code) => !secondaryCodes.has(code))) {
        addLocation(primaryCountry, primaryLoc);
    }

    const jobs: RawJob[] = Array.from(byCountry.entries()).map(
        ([country, cities]) => ({
            ...base,
            location: country,
            ...(cities.length === 1
                ? { city: cities[0] }
                : cities.length > 1
                  ? { cities }
                  : {}),
        }),
    );

    for (const loc of unstructured) {
        jobs.push({ ...base, location: loc });
    }

    if (jobs.length > 0) return jobs;

    // All secondaries were region labels — fall back to primary.
    return [
        {
            ...base,
            location:
                posting.address?.postalAddress?.addressCountry ??
                posting.location,
            city:
                posting.location ??
                posting.address?.postalAddress?.addressLocality,
        },
    ];
}

function formatSlug(slug: string): string {
    return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
