import type { RawJob } from './types';

interface LeverPosting {
  id: string;
  text: string; // title
  categories: {
    department?: string;
    location?: string;
    team?: string;
    commitment?: string;
  };
  description: string; // HTML
  descriptionPlain: string;
  hostedUrl: string;
}

export async function fetchLeverCompanyName(slug: string): Promise<string> {
  // Lever's public API doesn't expose a company name endpoint.
  // Derive from the slug.
  return formatSlug(slug);
}

export async function fetchLeverJobs(slug: string): Promise<RawJob[]> {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  );
  if (!res.ok) {
    throw new Error(`Lever API returned ${res.status} for company "${slug}"`);
  }
  const data: LeverPosting[] = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Lever API returned unexpected format for company "${slug}"`);
  }
  return data.map((posting) => ({
    title: posting.text,
    descriptionHtml: posting.description,
    descriptionText: posting.descriptionPlain,
    location: posting.categories?.location,
    url: posting.hostedUrl,
    department: posting.categories?.department,
  }));
}

function formatSlug(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
