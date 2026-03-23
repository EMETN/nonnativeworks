export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'company-api' | 'python';

export interface RawJob {
  title: string;
  descriptionHtml?: string;
  descriptionText?: string;
  location?: string;
  url?: string;
  department?: string;
  /** Stable ID from the source API, used for deduplication when merging primary + secondary fetches. */
  sourceId?: string;
}

export interface AtsDetectionResult {
  ats: Exclude<AtsType, 'python'> | null;
  companySlug: string | null;
}

export interface ClassifiedJob {
  title: string;
  url?: string;
  category: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
}

export interface ScrapeCountryGroup {
  country: string; // slug
  country_name: string;
  country_code: string;
  jobs: ClassifiedJob[];
}

export interface ScrapeResult {
  ats: AtsType | null;
  company_name: string;
  career_page_url: string;
  skipped_unknown_location: number;
  skipped_untracked_country: number;
  countries: ScrapeCountryGroup[];
}
