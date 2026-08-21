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
}

interface AshbyResponse {
    apiVersion?: string;
    jobs: AshbyJobPosting[];
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
    return {
        // Ashby doesn't return a company name in this endpoint — derive from slug
        companyName: formatSlug(slug),
        jobs: data.jobs.flatMap((posting) => mapAshbyPosting(posting)),
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

export function mapAshbyPosting(posting: AshbyJobPosting): RawJob[] {
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
        url: posting.jobUrl,
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
