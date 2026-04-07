/**
 * Per-company API configs for career pages that load job data via internal APIs.
 * This is "Layer 1.5" — checked after known ATS platforms (Greenhouse/Lever/Ashby)
 * but before falling back to the Python HTML scraper.
 *
 * HOW TO ADD A NEW COMPANY
 * ────────────────────────
 * 1. Open the company's career page in Chrome DevTools → Network tab → filter XHR/Fetch
 * 2. Reload and find the request that returns a JSON list of jobs
 * 3. Copy the URL and inspect the response shape
 * 4. Add an entry below keyed by the career page hostname (e.g. "op-careers.fi")
 *
 * METHOD
 *   GET (default) — pagination goes in the URL as query params
 *   POST          — set method:"POST" and provide a base body object; pagination
 *                   value is merged into the body automatically via bodyParam
 *
 * PAGINATION
 *   type "page"   — page=0, page=1, … stops when the items array is empty
 *   type "offset" — offset=0, offset=25, … stops when items array is empty
 *   type "none"   — single request, no pagination
 *   param         — query param name (GET) or body key name (POST)
 *   bodyParam     — use this instead of param when the page number goes in the
 *                   POST body rather than the URL (they are the same concept,
 *                   just named explicitly for clarity)
 *
 * FIELD MAPPING  (dot-paths into each item object)
 *   title      — job title string  (required)
 *   location   — free-text location; arrays are handled (first element is used)
 *   url        — link to the job posting (optional)
 *   department — department / team name (optional)
 *
 * ITEMS PATH
 *   Dot-path to the array of job objects in the response.
 *   Omit if the root of the response is the array itself.
 *   Example: "data.jobs" for { data: { jobs: [...] } }
 */

export interface CompanyApiConfig {
  url: string;
  /** HTTP method. Defaults to GET. */
  method?: 'GET' | 'POST';
  /**
   * Base request body for POST requests.
   * The pagination value is merged in automatically — you do not need to
   * include the page/offset key here; it will be added or overwritten.
   * Array values are only meaningful when bodyType is 'multipart' (each element
   * becomes a separate field with the same name, e.g. multiple jobCountry values).
   */
  body?: Record<string, unknown>;
  /**
   * How to encode the POST body. Defaults to 'json'.
   * 'multipart' builds a multipart/form-data body (the browser sets the boundary
   * automatically — do NOT set Content-Type in headers for multipart requests).
   * Array values in body are appended as multiple fields with the same name.
   */
  bodyType?: 'json' | 'multipart';
  pagination:
    | { type: 'none' }
    | { type: 'page';   param?: string; startPage?: number; totalCountPath?: string }
    | { type: 'offset'; param?: string; pageSize: number }
    /**
     * Oracle HCM finder-string pagination. The offset is injected directly into the
     * finder=... parameter value (e.g. "limit=200,offset=200,sortBy=...") rather than
     * appended as a standalone query param, which is what Oracle HCM expects.
     * pageSize must match the limit=N value already in the URL.
     */
    | { type: 'finder-offset'; pageSize: number };
  /** Dot-paths into each item in the jobs array. Arrays return their first element. */
  fields: {
    title: string;
    location?: string;
    /**
     * Dot-path to an array or object of city name strings (e.g. sfstd_jobLocation_obj).
     * Populates job.cities with all city strings found. Takes priority over location-derived
     * city extraction when present.
     */
    cities?: string;
    /** Use url OR urlTemplate, not both. */
    url?: string;
    department?: string;
    jobFunction?: string;
    /**
     * Stable ID field used to deduplicate jobs when merging a primary and secondary fetch.
     * Required when secondaryUrl is set.
     */
    id?: string;
  };
  /**
   * Template for constructing the job URL from multiple fields.
   * Use {dot.path} placeholders — e.g. "https://example.com/job/{response.urlTitle}/{response.id}"
   * Use url (in fields) for simple single-field cases; use urlTemplate for composite URLs.
   */
  urlTemplate?: string;
  /**
   * String replacements applied to the raw URL field value before any other processing.
   * Useful when the API returns URLs with positional placeholders (e.g. Accenture's {0} locale slot).
   * Example: { '{0}': 'fi-en' } → "https://accenture.com/{0}/careers/..." becomes
   *          "https://accenture.com/fi-en/careers/..."
   */
  urlPlaceholders?: Record<string, string>;
  /**
   * When true, query string parameters are preserved in job URLs instead of being stripped.
   * Set this when the job URL requires query params to identify the posting (e.g. ?id=12345).
   */
  keepQueryParams?: boolean;
  /** Dot-path to the jobs array in the response body. Omit if root is the array. */
  itemsPath?: string;
  /** Optional HTTP headers (e.g. Accept, X-Api-Key). Content-Type is set automatically for POST. */
  headers?: Record<string, string>;
  /** Company display name. Falls back to the hostname if omitted. */
  companyName?: string;
  /**
   * Regex string (one capture group) applied to the fetched job page HTML to extract
   * a raw location string (e.g. a comma-separated city list). The captured text is set
   * as job.location and then resolved to countries via lookupCountryFromLocation.
   * Implicitly enables per-job HTML fetching (like fetchDescription).
   * Only applied to jobs that have no location from the API response.
   */
  locationFromHtml?: string;
  /**
   * Regex string (one capture group) applied to the fetched job page HTML to extract
   * only the description section for language classification. When set, only the
   * matched HTML fragment is stored as descriptionHtml instead of the full page.
   * Use this when the full page contains native-language navigation or chrome that
   * would cause false positives in the character-frequency language classifier.
   */
  descriptionFromHtml?: string;
  /**
   * When true, individually fetch each job's URL to get its description HTML —
   * but only for jobs whose title is in English (non-ASCII titles already signal
   * a local-language requirement so there's nothing to gain from fetching them).
   * Useful when the language requirement is buried in the job description body.
   * Not suitable for SPAs — use descriptionFields instead when the API already
   * returns description text in the job listing response.
   */
  fetchDescription?: boolean;
  /**
   * Dot-paths to fields in each job item whose text should be concatenated into
   * descriptionText. Use this instead of fetchDescription when the API already
   * returns description content in the job listing response.
   * Null/undefined field values are silently skipped.
   */
  descriptionFields?: string[];
  /**
   * URL template for fetching full job descriptions via a separate JSON API call.
   * Use {sourceId} as the placeholder for the job's ID.
   * Use this instead of fetchDescription when the description is in a JSON API
   * rather than a crawlable HTML page (e.g. Oracle HCM's requisition detail endpoint).
   * descriptionApiItemsPath — dot-path to the object containing the fields (default: 'items.0')
   * descriptionApiFields    — fields to concatenate as descriptionText (required)
   */
  descriptionApiUrl?: string;
  descriptionApiItemsPath?: string;
  descriptionApiFields?: string[];
  /**
   * Dot-path to a location field in the per-job detail API response.
   * When set, the fetched value overwrites job.location with a more granular value
   * (e.g. a city name) than the main listing API provides.
   * Uses the same itemsPath root as descriptionApiFields.
   */
  descriptionApiLocationField?: string;
  /**
   * Dot-path to a job function / department field in the per-job detail API response.
   * When set, the fetched value is stored as job.jobFunction and used as the primary
   * category classification signal (ahead of title and description).
   * Use for APIs that expose a structured job function label (e.g. Oracle HCM's JobFunction).
   * Uses the same itemsPath root as descriptionApiFields.
   */
  descriptionApiJobFunctionField?: string;
  /**
   * Dot-path to a workplace type field in the per-job detail API response.
   * The fetched value is normalised to 'remote' | 'hybrid' | 'on-site' and stored as
   * job.work_model, overriding any location-derived value.
   * Unrecognised values are silently ignored.
   * Uses the same itemsPath root as descriptionApiFields.
   */
  descriptionApiWorkModelField?: string;
  /**
   * Secondary API endpoint to fetch the same jobs in a different language (e.g. English locale).
   * Jobs are matched to primary jobs by fields.id and their descriptions take priority for
   * language classification. The primary fetch provides the complete position list for statistics;
   * the secondary fetch provides richer English descriptions for accurate advantage detection.
   * Requires fields.id to be set.
   */
  secondaryUrl?: string;
  /**
   * Body overrides for the secondary request. Merged on top of the primary body, so you only
   * need to specify what differs (e.g. { locale: 'en_EN' }).
   */
  secondaryBody?: Record<string, unknown>;
  /**
   * URL template for constructing individual job page URLs for secondary jobs.
   * Use when the secondary locale has language-specific page URLs (e.g. ending in -en_EN
   * instead of -fi_FI). Falls back to urlTemplate if omitted.
   */
  secondaryUrlTemplate?: string;
  /**
   * When set, each job is duplicated for every additional country found in this
   * nested array. Use when a single job posting covers multiple countries
   * (e.g. Nokia's secondaryLocations). Each duplicate gets the secondary country
   * as its location so the classifier assigns it to the correct country.
   *
   * path      — dot-path from each job item to the secondary locations array
   * countryName — dot-path within each secondary location element to the country name string
   */
  expandSecondaryLocations?: {
    path: string;
    countryName: string;
  };
  /**
   * When set, one full paginated fetch is made per entry, with each entry's fields merged
   * into the base body as overrides. All results are merged and deduplicated.
   * Use when the API requires separate requests per filter value (e.g. Accenture requires
   * one jobCountry + matching countrySite per request).
   */
  repeatFor?: {
    body: Record<string, string>[];
  };
}

// ─── Company registry ────────────────────────────────────────────────────────
// Key: lowercase hostname of the career page URL (e.g. "op-careers.fi")

export const COMPANY_APIS: Record<string, CompanyApiConfig> = {
    'op-careers.fi': {
    url: 'https://op-careers.fi/services/recruiting/v1/jobs',
    method: 'POST',

    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Origin': 'https://op-careers.fi',
      'Referer': 'https://op-careers.fi/search',
    },
    
    body: {
      locale: 'fi_FI',
      sortBy: 'date',
      keywords: '',
      location: '',
      facetFilters: {},
      brand: '',
      skills: [],
      categoryId: 0,
      alertId: '',
      rcmCandidateId: '',
    },
    // pageNumber goes into the POST body, starting from 0
    pagination: { type: 'page', param: 'pageNumber', startPage: 0 },
    itemsPath: 'jobSearchResult',
    fields: {
      title: 'response.unifiedStandardTitle',
      // jobLocationShort is an array like ["FIN"]; first element is used
      location: 'response.jobLocationShort',
      // sfstd_jobLocation_obj is an object/array of city name strings, e.g. {0: "Helsinki", 1: "Oulu"}
      cities: 'response.sfstd_jobLocation_obj',
      // id is the stable job ID used to deduplicate across primary and secondary fetches
      id: 'response.id',
    },
    // URL pattern: /job/{urlTitle}/{id}-fi_FI
    urlTemplate: 'https://op-careers.fi/job/{response.urlTitle}/{response.id}-fi_FI',
    companyName: 'OP Financial Group',
    fetchDescription: true,
    // Secondary fetch: same API endpoint with English locale — returns a subset of jobs
    // whose descriptions mention things like "Finnish is a plus". Jobs are matched by ID
    // and their English descriptions replace the Finnish ones before language classification.
    secondaryUrl: 'https://op-careers.fi/services/recruiting/v1/jobs',
    secondaryBody: { locale: 'en_GB' },
    secondaryUrlTemplate: 'https://op-careers.fi/job/{response.urlTitle}/{response.id}-en_GB',
  },

  'jobs.nokia.com': {
    // Oracle HCM Recruiting Cloud endpoint (Nokia's career site is jobs.nokia.com)
    // The outer `items` array is a facet wrapper — actual jobs live in items[0].requisitionList.
    // Oracle HCM pagination uses offset inside the finder string, not as a standalone query param,
    // so we set a high limit and use type:none to fetch everything in one request.
    url: 'https://fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=findReqs;siteNumber=CX_1,facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=200,sortBy=POSTING_DATES_DESC',
    method: 'GET',
    headers: {
      'accept': '*/*',
      'accept-language': 'en',
      'content-type': 'application/vnd.oracle.adf.resourceitem+json;charset=utf-8',
      'ora-irc-language': 'en',
      'origin': 'https://jobs.nokia.com',
      'referer': 'https://jobs.nokia.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    // pageSize must match limit=N in the finder string above
    pagination: { type: 'finder-offset', pageSize: 200 },
    // Jobs are nested inside the first facet wrapper item
    itemsPath: 'items.0.requisitionList',
    fields: {
      title: 'Title',
      location: 'PrimaryLocation',
      id: 'Id',
    },
    urlTemplate: 'https://jobs.nokia.com/en/sites/CX_1/job/{Id}',
    companyName: 'Nokia',
    // Nokia's job pages are SPA-rendered so fetchDescription won't work.
    // Fetch full descriptions via Oracle HCM's per-requisition detail endpoint instead.
    descriptionApiUrl: 'https://fa-evmr-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22{sourceId}%22,siteNumber=CX_1',
    descriptionApiFields: ['ExternalQualificationsStr', 'ExternalResponsibilitiesStr'],
    descriptionApiLocationField: 'workLocation.0.TownOrCity',
    descriptionApiJobFunctionField: 'JobFunction',
    descriptionApiWorkModelField: 'WorkplaceType',
    expandSecondaryLocations: {
      path: 'secondaryLocations',
      countryName: 'Name',
    },
  },

  'gofore.com': {
    // WordPress REST API with Polylang (lang=en returns English-language postings).
    // No location field in the API response — city names are extracted from the HTML
    // of each job page and resolved to countries via the city-to-country map.
    url: 'https://gofore.com/wp-json/wp/v2/job?per_page=100&lang=en',
    method: 'GET',
    headers: {
      'accept': '*/*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,fi;q=0.7',
      'referer': 'https://gofore.com/en/careers/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    // WordPress page numbers start at 1; stops when the response array is empty
    pagination: { type: 'page', param: 'page', startPage: 1 },
    fields: {
      title: 'title.rendered',
      url: 'link',
      id: 'id',
    },
    companyName: 'Gofore',
    // content.rendered is the full English post body — use it directly for language
    // classification instead of fetching individual job pages.
    descriptionFields: ['content.rendered'],
    // No location field in the API response — city names are extracted from the HTML
    // of each job page and resolved to countries via the city-to-country map.
    // Location lives in: <div class="locations"><h3>…</h3><p>City1, City2</p></div>
    locationFromHtml: 'class="locations"[\\s\\S]*?<p>(.*?)<\\/p>',
  },

  'accenture.com': {
    // Accenture's internal Elasticsearch job search endpoint.
    // Uses multipart/form-data POST. The API only accepts one jobCountry per request,
    // so repeatFor iterates over tracked countries and merges the results.
    // jobLanguage:'en' filters to English postings at the source.
    // startIndex is the offset; maxResultSize is the page size.
    url: 'https://www.accenture.com/api/accenture/elastic/findjobs',
    method: 'POST',
    bodyType: 'multipart',
    body: {
      maxResultSize: '50',
      jobLanguage: 'en',
      sortBy: '2',
      jobFilters: '[]',
    },
    repeatFor: {
      body: [
        { jobCountry: 'Finland',     countrySite: 'fi-en' },
        { jobCountry: 'Sweden',      countrySite: 'se-en' },
        { jobCountry: 'Norway',      countrySite: 'no-en' },
        { jobCountry: 'Denmark',     countrySite: 'dk-en' },
        { jobCountry: 'Netherlands', countrySite: 'nl-en' },
        { jobCountry: 'Germany',     countrySite: 'de-de' },
        { jobCountry: 'Latvia',      countrySite: 'lv-en' },
      ],
    },
    pagination: { type: 'offset', param: 'startIndex', pageSize: 50 },
    itemsPath: 'data',
    fields: {
      title: 'title',
      location: 'country',
      cities: 'location',  // array of city strings e.g. ["Helsinki"]
      url: 'jobDetailUrl',
      id: 'requisitionId',
      department: 'jobFamilyGroup',
      jobFunction: 'jobFamilyGroup',  // array — first element is used automatically
    },
    // jobDetailUrl contains "{0}" as a locale placeholder (e.g. "fi-en")
    urlPlaceholders: { '{0}': 'fi-en' },
    // The job URL requires ?id=... to identify the posting — don't strip query params
    keepQueryParams: true,
    companyName: 'Accenture',
    // Description fields visible in the response — adjust once full item shape is confirmed
    descriptionFields: ['jobDescriptionClean', 'qualificationClean'],
  },

 
  'nordea.com': {
    url: 'https://www.nordea.com/en/api/jobs-list?_format=json&items_per_page=200&page=0&search=',
    method: 'GET',

    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://www.nordea.com/en/careers/open-jobs',
    },

    pagination: { type: 'none' },

    itemsPath: 'results',

    fields: {
      title: 'title',
      location: 'location_name',
      id: 'nid',
      url: 'field_ad_url',
    },

    urlTemplate: '{field_ad_url}',

    companyName: 'Nordea',
    fetchDescription: true,
  },
};

// ─── Career URL aliases ───────────────────────────────────────────────────────
// Maps a company's public-facing career page hostname to the canonical scrape URL.
// Checked before ATS detection, so operators can paste the friendly URL into the
// admin page and get the same result as pasting the ATS URL directly.
// Key: lowercase hostname (no www) of the public career page.
// Value: the URL actually passed to the scraper (may include ATS hostname + facet params).

export const CAREER_URL_ALIASES: Record<string, string> = {
  // careers.abb is ABB's branded career site; the actual jobs live on Workday.
  // The locationCountry params pre-filter to tracked countries only.
  'careers.abb': 'https://abb.wd3.myworkdayjobs.com/External_Career_Page?locationCountry=49ab063f422741e2aef271de00efeac8&locationCountry=dcc5b7608d8644b3a93716604e78e995&locationCountry=6a800a4736884df5826858d435650f45&locationCountry=d07f8ca8625e4345b98a91d0558b872a&locationCountry=9696868b09c64d52a62ee13b052383cc&locationCountry=8a0328effd25491fb8e6a08801f08e94&locationCountry=038b0482bfea403abb61c9bcc3d7eb60&locationCountry=0afb2fa656da42e8bfb6d47bd24a26fa',
};
