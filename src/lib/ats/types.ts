export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'workday' | 'company-api' | 'python';

export interface RawJob {
  title: string;
  descriptionHtml?: string;
  descriptionText?: string;
  location?: string;
  url?: string;
  department?: string;
  /** ISO alpha-2 country code set by scrapers that already know the country (e.g. njoyn). */
  country_code?: string;
  /** Stable ID from the source API, used for deduplication when merging primary + secondary fetches. */
  sourceId?: string;
  /** Explicit city name when the scraper can provide it separately from the country-resolution location string. */
  city?: string;
  /**
   * When set by a scraper that has explicit language data (e.g. Barona's languages API field),
   * this overrides the classifier's requires_native_language result.
   * Use only when the source provides a definitive answer — do not set based on inferred signals.
   */
  requires_native_language?: boolean;
}

export interface AtsDetectionResult {
  ats: Exclude<AtsType, 'python'> | null;
  companySlug: string | null;
}

export interface ClassifiedJob {
  title: string;
  url?: string;
  city?: string[];
  category: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
  requiredLanguages: string[];
  preferredLanguages: string[];
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
