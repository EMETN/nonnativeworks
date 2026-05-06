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
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PROMPT TEMPLATE — paste this when asking Claude to add a new company
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Career page URL (what you paste into the admin scraper tab):
 *   https://...
 *
 * API request (DevTools → Network tab → filter XHR/Fetch → reload → find the jobs request):
 *
 *   Method: GET / POST
 *
 *   URL:
 *     https://...
 *
 *   Request headers (non-standard ones only — skip Accept/Content-Type/User-Agent
 *   unless they look unusual):
 *     ...
 *
 *   Request body (if POST — paste the full JSON or form data):
 *     ...
 *
 * JSON response (paste the full response, or the first 2–3 items in the jobs
 * array plus any top-level metadata like total count — this is the most
 * important part, everything else can be derived from it):
 *   ...
 *
 * Pagination (describe what changes in the request when you click "Next page"):
 *   e.g. "body param pageNumber goes from 0 to 1"
 *   e.g. "query param offset goes from 0 to 25"
 *   e.g. "single request, no pagination"
 *
 * One example job detail page URL:
 *   https://...
 * ────────────────────────────────────────────────────────────────────────────
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
    | { type: 'offset'; param?: string; pageSize: number; totalCountPath?: string }
    /**
     * Oracle HCM finder-string pagination. The offset is injected directly into the
     * finder=... parameter value (e.g. "limit=200,offset=200,sortBy=...") rather than
     * appended as a standalone query param, which is what Oracle HCM expects.
     * pageSize must match the limit=N value already in the URL.
     */
    | { type: 'finder-offset'; pageSize: number }
    /**
     * Cursor pagination: the response body contains a next-page URL at nextPagePath.
     * All requests use the same method and body as the initial request.
     * Stops when the path is null/empty or items is empty.
     * rebaseToOrigin: when true, query params from next_page are applied to the original
     * base URL instead of following the next_page URL directly. Use when next_page points
     * to an internal host unreachable from outside (e.g. Telekom's backend proxy).
     * Example: { type: 'cursor', nextPagePath: 'pagination_info.next_page', rebaseToOrigin: true }
     */
    | { type: 'cursor'; nextPagePath: string; rebaseToOrigin?: boolean };
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
   * When set, the language-requirement API URL is built from job.url rather than job.sourceId.
   * The regex (one or more capture groups) is applied to job.url; the replacement string forms
   * the value substituted for {jobPath} in descriptionApiUrl.
   * Unlike {sourceId}, {jobPath} is NOT URL-encoded — slashes are preserved.
   * Example (Barona): match "https://www\.baronacareers\.com(/\w+)/\w+(/jobs/.+)", replace "$1/en$2"
   * transforms "https://www.baronacareers.com/fi/fi/jobs/slug" → "/fi/en/jobs/slug".
   */
  descriptionApiUrlFromJobUrl?: { match: string; replace: string };
  /**
   * Dot-path (relative to descriptionApiItemsPath) to a languages array in the per-job
   * detail API response (e.g. Barona's page_info.job.requirements.languages → ["Finnish","English"]).
   * When set, job.requires_native_language is set directly from this array — any language other
   * than English means the job requires a native language. This overrides the text classifier.
   * Only processed for jobs whose title appears to be in English (non-English titles are already
   * flagged by Phase 1a of the classifier and don't need the extra API call).
   * If the array is missing or null, the field is left unset (classifier decides instead).
   */
  descriptionApiLanguagesPath?: string;
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
   * When set, handles multi-location job postings. Three modes:
   *
   * Country mode (countryName set): each job is duplicated for every additional
   * country found in the nested array. Use when a single posting covers multiple
   * countries (e.g. Nokia). Each duplicate gets the secondary country as its
   * location so the classifier assigns it to the correct country.
   *
   * City mode (cityField set): secondary entries are treated as additional cities
   * within the same country. Their names are collected into job.cities alongside
   * the primary city — no duplicate jobs are created.
   *
   * Parallel mode (parallelCitiesPath set): path points to a flat string array of
   * country names; parallelCitiesPath points to a comma-separated city string whose
   * entries are positionally aligned with the countries array (country[i] → city[i]).
   * Each country becomes a separate job entry with its corresponding city.
   * Use when the API returns parallel country and city arrays (e.g. Telia).
   *
   * path               — dot-path from each job item to the countries array
   * countryName        — dot-path within each element to the country name string (country mode)
   * cityField          — dot-path within each element to the city name string (city mode)
   * parallelCitiesPath — dot-path to a comma-separated city string (parallel mode)
   */
  expandSecondaryLocations?: {
    path: string;
    countryName?: string;
    cityField?: string;
    parallelCitiesPath?: string;
  };
  /**
   * When set, one full paginated fetch is made per entry. All results are merged and deduplicated.
   * POST requests: entry fields are merged into the request body.
   * GET requests: entry fields are appended as URL query params.
   * Use when the API requires separate requests per filter value (e.g. one country per request).
   */
  repeatFor?: {
    body: Record<string, string>[];
  };
  /**
   * For POST repeatFor requests: the key within each body override entry that holds the
   * country name (e.g. 'jobCountry'). When set, jobs returned for each iteration have
   * their cities array filtered to only cities that belong to that country (via CITY_MAP
   * lookup), removing cities from untracked or other countries. Unknown cities (not in
   * CITY_MAP) are kept. Analogous to the country-based city filtering that GET repeatFor
   * does automatically via string inclusion.
   */
  repeatForCountryField?: string;
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

  'careers.orkla.com': {
    url: 'https://careers.orkla.com/services/recruiting/v1/jobs',
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json',
      'Origin': 'https://careers.orkla.com',
    },
    body: {
      locale: 'en_GB',
      sortBy: '',
      keywords: '',
      location: '',
      facetFilters: { mfield2: ['Sweden', 'Denmark', 'Norway', 'Finland', 'Latvia', 'Netherlands'] },
      brand: '',
      skills: [],
      categoryId: 9516901,
      alertId: '',
      rcmCandidateId: '',
    },
    pagination: { type: 'page', param: 'pageNumber', startPage: 0, totalCountPath: 'totalJobs' },
    itemsPath: 'jobSearchResult',
    fields: {
      title: 'response.unifiedStandardTitle',
      location: 'response.jobLocationShort',
      id: 'response.id',
    },
    // URL: https://careers.orkla.com/{brandUrl}/job/{urlTitle}/{id}-en_GB
    urlTemplate: 'https://careers.orkla.com/{response.brandUrl}/job/{response.urlTitle}/{response.id}-en_GB',
    companyName: 'Orkla',
    fetchDescription: true,
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

  'fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com': {
    // Oracle HCM Recruiting Cloud endpoint for Nets/Nexi (Nordic payments).
    // Site number CX_1. Location filters restrict to Nordic countries and Germany.
    url: 'https://fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=findReqs;siteNumber=CX_1,facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=200,sortBy=POSTING_DATES_DESC,selectedLocationsFacet=300000000459853%3B300000000459886%3B300000000462267%3B300000000459847%3B300000000462177',
    method: 'GET',
    headers: {
      'accept': '*/*',
      'accept-language': 'en',
      'content-type': 'application/vnd.oracle.adf.resourceitem+json;charset=utf-8',
      'ora-irc-language': 'en',
      'origin': 'https://fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com',
      'referer': 'https://fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    pagination: { type: 'finder-offset', pageSize: 200 },
    itemsPath: 'items.0.requisitionList',
    fields: {
      title: 'Title',
      location: 'PrimaryLocation',
      id: 'Id',
    },
    urlTemplate: 'https://fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/{Id}',
    companyName: 'Nets/Nexi',
    descriptionApiUrl: 'https://fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22{sourceId}%22,siteNumber=CX_1',
    descriptionApiFields: ['ExternalDescriptionStr'],
    descriptionApiLocationField: 'workLocation.0.TownOrCity',
    descriptionApiJobFunctionField: 'JobFunction',
    descriptionApiWorkModelField: 'WorkplaceType',
    expandSecondaryLocations: {
      path: 'secondaryLocations',
      countryName: 'Name',
    },
  },

  'fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com': {
    // Oracle HCM Recruiting Cloud endpoint for Orion (Finnish pharma).
    // Same structure as Nokia — site number is OrionCareers.
    url: 'https://fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.workLocation,requisitionList.otherWorkLocations,requisitionList.secondaryLocations,flexFieldsFacet.values,requisitionList.requisitionFlexFields&finder=findReqs;siteNumber=OrionCareers,facetsList=LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS,limit=200,sortBy=POSTING_DATES_DESC',
    method: 'GET',
    headers: {
      'accept': '*/*',
      'accept-language': 'en',
      'content-type': 'application/vnd.oracle.adf.resourceitem+json;charset=utf-8',
      'ora-irc-language': 'en',
      'origin': 'https://fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com',
      'referer': 'https://fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/OrionCareers',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    },
    pagination: { type: 'finder-offset', pageSize: 200 },
    itemsPath: 'items.0.requisitionList',
    fields: {
      title: 'Title',
      location: 'PrimaryLocation',
      id: 'Id',
    },
    urlTemplate: 'https://fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/OrionCareers/job/{Id}',
    companyName: 'Orion',
    descriptionApiUrl: 'https://fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&finder=ById;Id=%22{sourceId}%22,siteNumber=OrionCareers',
    descriptionApiFields: ['ExternalDescriptionStr'],
    descriptionApiLocationField: 'workLocation.0.TownOrCity',
    descriptionApiJobFunctionField: 'JobFunction',
    descriptionApiWorkModelField: 'WorkplaceType',
    expandSecondaryLocations: {
      path: 'secondaryLocations',
      cityField: 'Name',
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
    // 'jobCountry' in the body override contains the country name (e.g. "Finland")
    // used to filter the cities array to only cities in the queried country.
    repeatForCountryField: 'jobCountry',
  },
 
   'jobs.ericsson.com': {
    url: 'https://jobs.ericsson.com/api/pcsx/search?domain=ericsson.com&query=&sort_by=hot',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://jobs.ericsson.com/careers',
    },
    repeatFor: {
      body: [
        { location: 'Finland' },
        { location: 'Sweden' },
        { location: 'Norway' },
        { location: 'Denmark' },
        { location: 'Netherlands' },
        { location: 'Germany' },
        { location: 'Estonia' },
        { location: 'Latvia' },
        { location: 'Lithuania' },
        { location: 'Iceland' },
      ],
    },
    pagination: { type: 'offset', param: 'start', pageSize: 10, totalCountPath: 'data.count' },
    itemsPath: 'data.positions',
    fields: {
      title: 'name',
      location: 'locations',
      cities: 'locations',
      id: 'id',
      department: 'department',
      jobFunction: 'efcustomTextJobfuntionAdvancefilterpcs',
    },
    urlTemplate: 'https://jobs.ericsson.com{positionUrl}',
    companyName: 'Ericsson',
    descriptionApiUrl: 'https://jobs.ericsson.com/api/pcsx/position_details?position_id={sourceId}&domain=ericsson.com&hl=en',
    descriptionApiItemsPath: 'data',
    descriptionApiFields: ['jobDescription'],
    descriptionApiWorkModelField: 'workLocationOption',
  },

 'teliacompany.com': {
    url: 'https://www.teliacompany.com/api/job',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
      'Accept': '*/*',
      'Referer': 'https://www.teliacompany.com/en/careers/open-positions',
    },
    pagination: { type: 'none' },
    // Root of the response is the jobs array directly
    fields: {
      title: 'position',
      location: 'country',  // array like ["SWEDEN", "LITHUANIA"] — first element used as primary location
      department: 'jobCategory',
      jobFunction: 'subCategory',
      id: 'slug',           // slug is the key used by the per-job detail API
    },
    // country is a flat string array; city is a comma-separated string aligned by index.
    // Parallel mode splits the city string and assigns city[i] to country[i] per duplicate job.
    expandSecondaryLocations: {
      path: 'country',
      parallelCitiesPath: 'city',
    },
    urlTemplate: 'https://www.teliacompany.com/en/careers/open-positions/{slug}',
    companyName: 'Telia',
    // Per-job detail API returns description HTML and a more specific jobFamily field.
    // Response root is the item itself (no wrapper), so itemsPath is empty string.
    descriptionApiUrl: 'https://www.teliacompany.com/api/job?id={sourceId}',
    descriptionApiItemsPath: '',
    descriptionApiFields: ['jobDescription'],
    descriptionApiJobFunctionField: 'jobFamily',
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

  'careers.capgemini.com': {
    // Capgemini's internal job-stream API. country_code is a comma-separated list of
    // locale/ISO codes covering all tracked countries. location is a comma-separated
    // city string (e.g. "Stockholm, Malmö, Göteborg") — lookupCountryFromLocation splits
    // it and resolves via CITY_MAP. description_stripped contains the full job description
    // as plain text (no HTML, actual Unicode characters) — sufficient for language classification.
    url: 'https://cg-jobstream-api.azurewebsites.net/api/job-search?country_code=en-dk%2Cdk-en%2CDK%2CFI%2Cen-fi%2Cde-de%2CDE%2Cno-no%2Cno-en%2Cen-no%2CNO%2Cse-en%2Cen-se%2CSE%2Cnl-nl%2CNL&size=200',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.capgemini.com/',
      'Origin': 'https://www.capgemini.com',
    },
    pagination: { type: 'page', param: 'page', startPage: 1, totalCountPath: 'count' },
    itemsPath: 'data',
    fields: {
      title: 'title',
      location: 'location',
      url: 'apply_job_url',
      id: 'id',
    },
    descriptionFields: ['description_stripped'],
    companyName: 'Capgemini',
  },

  'careers.telekom.com': {
    url: 'https://careers.telekom.com/api/jobs-proxy/search',
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://careers.telekom.com/en/jobs',
      'Origin': 'https://careers.telekom.com',
    },
    body: {
      user_query: '',
      locale: 'en',
    },
    pagination: { type: 'cursor', nextPagePath: 'pagination_info.next_page', rebaseToOrigin: true },
    itemsPath: 'data',
    fields: {
      title: 'title',
      location: 'country',
      cities: 'city',
      jobFunction: 'category',
      id: 'requisition_id',
    },
    urlTemplate: 'https://careers.telekom.com/en/jobs/{title|slug}-{requisition_id}',
    companyName: 'Deutsche Telekom',
    descriptionFields: ['requirement_description_md'],
  },

  'jobs.booking.com': {
    url: 'https://jobs.booking.com/api/jobs?limit=100',
    method: 'GET',

    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
      'Accept': 'application/json',
      'Referer': 'https://jobs.booking.com/booking/jobs',
    },

    pagination: { type: 'page', param: 'page', startPage: 1 },

    itemsPath: 'jobs',

    fields: {
      title: 'data.title',
      location: 'data.country',
      cities: 'data.city',
      jobFunction: 'data.category',
      id: 'data.req_id',
      url: 'data.meta_data.canonical_url',
    },

    companyName: 'Booking.com',
    descriptionFields: ['data.description'],
  },

  'careers.publicisgroupe.com': {
    url: 'https://careers.publicisgroupe.com/api/jobs?limit=100',
    method: 'GET',
    headers: {
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Accept': 'application/json, text/plain, */*',
      'Referer': 'https://careers.publicisgroupe.com/jobs',
    },
    pagination: { type: 'page', param: 'page', startPage: 1 },
    itemsPath: 'jobs',
    fields: {
      title: 'data.title',
      location: 'data.country',
      cities: 'data.city',
      jobFunction: 'data.tags',
      id: 'data.req_id',
      url: 'data.meta_data.canonical_url',
    },
    companyName: 'Publicis Groupe',
    descriptionFields: ['data.description', 'data.qualifications']
  },

  'novonordisk.com': {
    url: 'https://www.novonordisk.com/bin/nncorp/careersearch?keyword=&country=&category=&locale=en',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Accept': 'application/json',
      'Referer': 'https://www.novonordisk.com/careers/find-a-job/career-search-results.html',
    },
    pagination: { type: 'none' },
    itemsPath: 'data.jobs',
    fields: {
      title: 'jobTitle',
      location: 'jobLocationLabel',
      department: 'jobSubCategory.label',
    },
    urlTemplate: 'https://www.novonordisk.com/careers/find-a-job/job-ad.{jobId}.html',
    companyName: 'Novo Nordisk',
    fetchDescription: true,
  },

  'randstad.com': {
    url: 'https://www.randstad.com/api/search/search-results',
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Referer': 'https://www.randstad.com/jobs/careers-at-randstad/',
      'Origin': 'https://www.randstad.com',
    },
    body: {
      data: {
        currentRoute: {
          path: '/jobs/careers-at-randstad/:searchParams*',
          url: '/jobs/careers-at-randstad/the-netherlands/',
          isExact: true,
          params: { searchParams: 'the-netherlands' },
          routeName: 'internal-search',
        },
        currentLanguage: 'en',
        searchParams: {
          country: 'the-netherlands',
          isInternal: true,
          locationData: {},
          specialism: null,
          subSpecialism: null,
          jobCategory: null,
        },
      },
    },
    repeatFor: {
      body: [
        { data: { currentRoute: { path: '/jobs/careers-at-randstad/:searchParams*', url: '/jobs/careers-at-randstad/the-netherlands/', isExact: true, params: { searchParams: 'the-netherlands' }, routeName: 'internal-search' }, currentLanguage: 'en', searchParams: { country: 'the-netherlands', isInternal: true, locationData: {}, specialism: null, subSpecialism: null, jobCategory: null } } },
        { data: { currentRoute: { path: '/jobs/careers-at-randstad/:searchParams*', url: '/jobs/careers-at-randstad/germany/', isExact: true, params: { searchParams: 'germany' }, routeName: 'internal-search' }, currentLanguage: 'en', searchParams: { country: 'germany', isInternal: true, locationData: {}, specialism: null, subSpecialism: null, jobCategory: null } } },
      ],
    },
    pagination: { type: 'page', param: 'data.searchParams.page', startPage: 1, totalCountPath: 'searchResults.hits.total' },
    itemsPath: 'searchResults.hits.hits',
    fields: {
      title: '_source.JobInformation.Title',
      location: '_source.JobLocation.City',
      jobFunction: '_source.BlueXJobData.Specialism',
      id: '_source.BlueXJobData.JobId',
    },
    urlTemplate: 'https://www.randstad.com/jobs/careers-at-randstad/{_source.BlueXSanitized.Title}_{_source.BlueXSanitized.City}_{_source.BlueXJobData.JobId}/',
    companyName: 'Randstad',
    descriptionFields: ['_source.JobInformation.Description'],
  },

  'werkenbijabnamro.nl': {
    url: 'https://www.werkenbijabnamro.nl/en/api/vacancy/?filters[Country][]=Netherlands&sort=created&sortDir=DESC',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
      'Accept': 'application/json',
      'Referer': 'https://www.werkenbijabnamro.nl/en/vacancies/country/netherlands',
    },
    pagination: { type: 'page', param: 'pageNumber', startPage: 1, totalCountPath: 'meta.num_total_hits' },
    itemsPath: 'vacancies',
    fields: {
      title: 'title',
      location: 'city',
      jobFunction: 'option_values.value',
      id: 'id',
    },
    urlTemplate: 'https://www.werkenbijabnamro.nl/en/vacancy/{id}/{slug}',
    companyName: 'ABN AMRO',
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
  // maersk.com is Maersk's branded career site; jobs live on Workday.
  'maersk.com': 'https://maersk.wd3.myworkdayjobs.com/Maersk_Careers',
  // capgemini.com is the main site; job detail pages live on careers.capgemini.com.
  'capgemini.com': 'https://careers.capgemini.com/',
  'careers.deliveryhero.com' : 'https://careers.deliveryhero.com/jobs?options=745%2C869%2C860'
};

// ─── Python scraper company names ────────────────────────────────────────────
// Display names for companies scraped via the Python/Layer 2 scraper, keyed by
// a substring of their career page URL. Used as a fallback when no ATS API
// provides a canonical company name — prevents slug-derived names like
// "Academicwork" instead of "Academic Work".
export const COMPANY_NAME_OVERRIDES: Array<{ urlSubstring: string; name: string }> = [
  { urlSubstring: 'academicwork.fi', name: 'Academic Work' },
  { urlSubstring: 'ag.wd3.myworkdayjobs.com', name: 'Airbus' },
  { urlSubstring: 'cgi.njoyn.com', name: 'CGI' },
  { urlSubstring: 'jobs.arla.com', name: 'Arla' },
  { urlSubstring: 'jobs.sap.com', name: 'SAP' },
  { urlSubstring: 'edenpeople', name: 'Edenred' },
  { urlSubstring: 'wartsila', name: 'Wärtsilä' },
  { urlSubstring: 'deliveryhero', name: 'Delivery Hero' },
  { urlSubstring: 'swecogroup.com', name: 'Sweco Group' },
  { urlSubstring: 'nordnetab.com', name: 'Nordnet' },
  { urlSubstring: 'upcloud.teamtailor.com', name: 'UpCloud' },
  { urlSubstring: 'jobs.siemens-healthineers.com', name: 'Siemens Healthineers' },
  { urlSubstring: 'ing.wd3.myworkdayjobs.com', name: 'ING' },
  { urlSubstring: 'nxp.wd3.myworkdayjobs.com', name: 'NXP' },
  { urlSubstring: 'werkenbijabnamro.nl', name: 'ABN AMRO' },
  { urlSubstring: 'jobs.volvogroup.com', name: 'Volvo Group' },
];
