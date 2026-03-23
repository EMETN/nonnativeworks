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
   */
  body?: Record<string, unknown>;
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
    /** Use url OR urlTemplate, not both. */
    url?: string;
    department?: string;
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
  /** Dot-path to the jobs array in the response body. Omit if root is the array. */
  itemsPath?: string;
  /** Optional HTTP headers (e.g. Accept, X-Api-Key). Content-Type is set automatically for POST. */
  headers?: Record<string, string>;
  /** Company display name. Falls back to the hostname if omitted. */
  companyName?: string;
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
    expandSecondaryLocations: {
      path: 'secondaryLocations',
      countryName: 'Name',
    },
  },

    // TODO: verify Nordea API shape before enabling.
  // Embed all query params in the URL — the CompanyApiConfig type has no queryParams field.
  // Replace urlTemplate once the actual item field structure is confirmed.
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
