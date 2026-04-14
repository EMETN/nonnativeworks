import type { RawJob } from './types';

interface RecruiteeOffer {
  id: number;
  title: string;
  description: string; // HTML
  careers_url: string;
  company_name: string;
  country: string;
  country_code: string; // ISO alpha-2
  city: string | null;
  remote: boolean;
  hybrid: boolean;
  on_site: boolean;
  department: string | null;
  employment_type_code: string | null;
}

interface RecruiteeResponse {
  offers: RecruiteeOffer[];
}

export async function fetchRecruiteeJobs(slug: string): Promise<{ jobs: RawJob[]; companyName: string }> {
  const res = await fetch(`https://${encodeURIComponent(slug)}.recruitee.com/api/offers/`);
  if (!res.ok) {
    throw new Error(`Recruitee API returned ${res.status} for company "${slug}"`);
  }
  const data: RecruiteeResponse = await res.json();
  if (!Array.isArray(data.offers)) {
    throw new Error(`Recruitee API returned unexpected format for company "${slug}"`);
  }

  const companyName = data.offers[0]?.company_name ?? formatSlug(slug);

  const jobs: RawJob[] = data.offers.map((offer) => ({
    title: offer.title,
    descriptionHtml: offer.description,
    url: offer.careers_url,
    country_code: offer.country_code || undefined,
    city: offer.city ?? undefined,
    work_model: resolveWorkModel(offer),
    department: offer.department ?? undefined,
  }));

  return { jobs, companyName };
}

function resolveWorkModel(offer: RecruiteeOffer): 'remote' | 'hybrid' | 'on-site' | undefined {
  if (offer.hybrid) return 'hybrid';
  if (offer.remote) return 'remote';
  if (offer.on_site) return 'on-site';
  return undefined;
}

function formatSlug(slug: string): string {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
