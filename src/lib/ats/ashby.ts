import type { RawJob } from './types';

interface AshbyAddress {
  postalAddress?: {
    addressLocality?: string;
    addressRegion?: string;
    addressCountry?: string;
  };
}

interface AshbyJobPosting {
  id: string;
  title: string;
  team?: string;
  department?: string;
  location?: string;
  address?: AshbyAddress;
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
    jobs: data.jobs.map((posting) => ({
      title: posting.title,
      descriptionHtml: posting.descriptionHtml,
      // Prefer the structured country from address, fall back to location string
      location: posting.address?.postalAddress?.addressCountry ?? posting.location,
      url: posting.jobUrl,
      department: posting.department ?? posting.team,
    })),
  };
}

function formatSlug(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
