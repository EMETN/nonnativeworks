import type { RawJob } from './types';

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
    throw new Error(`Ashby API returned ${res.status} for company "${slug}"`);
  }
  const data: AshbyResponse = await res.json();
  if (!Array.isArray(data.jobs)) {
    throw new Error(`Ashby API returned unexpected format for company "${slug}"`);
  }
  return {
    // Ashby doesn't return a company name in this endpoint — derive from slug
    companyName: formatSlug(slug),
    jobs: data.jobs.flatMap((posting) => mapAshbyPosting(posting)),
  };
}

function mapAshbyPosting(posting: AshbyJobPosting): RawJob[] {
  const base = {
    title: posting.title,
    descriptionHtml: posting.descriptionHtml,
    url: posting.jobUrl,
    department: posting.department ?? posting.team,
  };

  const secondaries = posting.secondaryLocations ?? [];

  if (secondaries.length === 0) {
    // Single location: use addressCountry for country resolution, location string as city.
    return [{
      ...base,
      location: posting.address?.postalAddress?.addressCountry ?? posting.location,
      city: posting.location ?? posting.address?.postalAddress?.addressLocality,
    }];
  }

  // Multi-location: group secondary locations by country, merging cities within
  // the same country into one RawJob entry. The top-level location/address is
  // a summary and may duplicate a secondary entry — use secondaries only.
  const byCountry = new Map<string, string[]>();
  for (const sec of secondaries) {
    const country = sec.address?.postalAddress?.addressCountry;
    const city = sec.location ?? sec.address?.postalAddress?.addressLocality;
    if (!country) continue;
    if (!byCountry.has(country)) byCountry.set(country, []);
    if (city) byCountry.get(country)!.push(city);
  }

  if (byCountry.size === 0) {
    // Secondary locations had no resolvable country — fall back to primary.
    return [{
      ...base,
      location: posting.address?.postalAddress?.addressCountry ?? posting.location,
      city: posting.location ?? posting.address?.postalAddress?.addressLocality,
    }];
  }

  return Array.from(byCountry.entries()).map(([country, cities]) => ({
    ...base,
    location: country,
    ...(cities.length === 1 ? { city: cities[0] } : cities.length > 1 ? { cities } : {}),
  }));
}

function formatSlug(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
