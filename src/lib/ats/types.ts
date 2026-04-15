export type AtsType = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'workday' | 'recruitee' | 'company-api' | 'python';

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
  /** Explicit list of city names when the API returns multiple cities for a single posting. Takes priority over city. */
  cities?: string[];
  /** Explicit work model when the scraper knows it ('remote' | 'hybrid' | 'on-site'). Overrides location-derived value. */
  work_model?: 'remote' | 'hybrid' | 'on-site';
  /**
   * Job function / department from the source API when available (e.g. Oracle HCM's JobFunction).
   * Used as the primary category classification signal, ahead of title or description.
   * Only set when the source provides a structured, concise value — not a free-text description.
   */
  jobFunction?: string;
  /**
   * When set, the classifier uses this title instead of `title` for language detection and
   * category classification. `title` is always used for storage and display. Useful when the
   * source appends non-English company names or city suffixes to titles (e.g. Academic Work:
   * "Strategic Purchaser, Wärtsilä" → classifierTitle: "Strategic Purchaser").
   */
  classifierTitle?: string;
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
  work_model?: 'remote' | 'hybrid' | 'on-site';
  category: string;
  requires_native_language: boolean;
  local_language_advantage: boolean;
  requiredLanguages: string[];
  preferredLanguages: string[];
  skills?: string[];
  required_education?: string;
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
