export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'company-api' | 'python';

export interface RawJob {
  title: string;
  descriptionHtml?: string;
  descriptionText?: string;
  location?: string;
  url?: string;
  department?: string;
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
  confidence: 'high' | 'low';
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
  low_confidence_count: number;
  skipped_unknown_location: number;
  skipped_untracked_country: number;
  countries: ScrapeCountryGroup[];
}
