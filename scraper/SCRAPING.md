# Scraping & Classification Logic

How the system fetches jobs, resolves countries, and classifies language requirements.

---

## Local scraping script (`run-local.sh`)

Some companies use Cloudflare or similar bot protection that blocks GitHub Actions runner IPs. These must be scraped locally (or from a VPS with a residential IP) using `scraper/run-local.sh`.

The script mirrors the GitHub Actions workflow: it builds the Astro app, starts a local Node server, and calls `batch_run.py` against it — the only difference is it reads from `scraper/companies-local.yaml` instead of `scraper/companies.yaml`.

### Prerequisites

1. **Doppler CLI** authenticated, with a config (default: `dev_personal`) that contains:
    - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — database credentials
    - `SCRAPER_SECRET` — matches the server's auth header
    - `PLAYWRIGHT_CDP_URL` — e.g. `http://192.168.65.254:9222` (see below)

2. **Chrome running with remote debugging** (required for Playwright-based scrapers):

    ```
    chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-allow-origins=*
    ```

    All existing Chrome windows must be closed before launching with these flags — Chrome ignores them if an instance is already running.

    Verify it's reachable from inside the container:

    ```bash
    curl http://192.168.65.254:9222/json/version
    ```

3. **Python dependencies** installed in `/opt/scraper-venv` or `scraper/.venv`:
    ```bash
    pip install -r scraper/requirements.txt
    ```

### Usage

```bash
# Scrape into the dev database (default)
bash scraper/run-local.sh

# Scrape into production
DOPPLER_CONFIG=prd bash scraper/run-local.sh

# Test without uploading
bash scraper/run-local.sh --dry-run

# Force a fresh build (if scrape.ts or other server code changed)
bash scraper/run-local.sh --rebuild
```

### Adding companies

Edit `scraper/companies-local.yaml`. The format is the same as `scraper/companies.yaml`. Add a company here (instead of the main file) when:

- The career site uses Cloudflare or bot protection that blocks GitHub Actions IPs
- The scraper requires a Playwright browser session (njoyn, Barona Phase 2)

Test the company via the admin scraper tab first, then add it here.

---

## Overview

When the admin submits a career page URL, the scrape API (`/api/admin/scrape`) runs through up to four layers in sequence, stopping as soon as any layer returns jobs.

```
Layer 1   → Known ATS API (Greenhouse, Lever, Ashby, Workable, Workday, Recruitee)
Layer 1.5 → Per-company API config
Layer 2   → Python scraper (generic config-driven or platform-specific)
              └─ enrichDescriptions (fetches individual job pages)
```

All layers produce `RawJob` objects (`title`, `location`, `url`, `descriptionHtml?`, `descriptionText?`, `country_code?`, `department?`), which are then run through the classifier.

---

## Layer 1 — Known ATS APIs

The URL is inspected by `detectAts()` (`src/lib/ats/detector.ts`) to see if it matches a known ATS hostname:

| Pattern                                                            | ATS                                       |
| ------------------------------------------------------------------ | ----------------------------------------- |
| `boards.greenhouse.io/{slug}` or `job-boards.greenhouse.io/{slug}` | Greenhouse                                |
| `jobs.lever.co/{slug}` or `jobs.eu.lever.co/{slug}`                | Lever (EU variant uses `api.eu.lever.co`) |
| `jobs.ashbyhq.com/{slug}`                                          | Ashby                                     |
| `apply.workable.com/{slug}` or `{slug}.workable.com`               | Workable                                  |
| `{company}.wd{N}.myworkdayjobs.com/{locale}/{site}`                | Workday                                   |
| `wd{N}.myworkdaysite.com/{locale}/recruiting/{company}/{site}`     | Workday (alternate)                       |
| `{slug}.recruitee.com`                                             | Recruitee                                 |

If matched, the company slug is extracted and the corresponding API is called directly. These APIs return structured JSON with titles, locations, and descriptions already included — no HTML scraping needed.

If the URL doesn't match a known ATS hostname, a company slug is still extracted from the hostname (stripping common prefixes like `careers.`, `jobs.`, `www.`) and probed against Greenhouse, Lever, Ashby, and Workable APIs speculatively.

### ATS-specific notes

**Workday** — Parsed via `parseWorkdayUrl()` which extracts the company, instance (wd3, wd502, etc.), and site name. Supports `locationCountry` and `locationHierarchy1` query params for country filtering. Description enrichment only runs for jobs in tracked countries (avoids fetching HTML for thousands of untracked jobs in large global listings like ABB).

**Lever** — Supports both `jobs.lever.co` and the EU-hosted `jobs.eu.lever.co` variant. The EU variant uses `api.eu.lever.co` for API calls. Bilingual slash-separated titles (e.g. "Finance Developer/ Finanšu izstrādātājs") are cleaned via `stripBilingualSuffix()` which removes the Latvian portion after the `/`.

**Workable** — Description enrichment only runs for jobs in tracked countries, similar to Workday.

### Hostname overrides (`HOSTNAME_SLUG_OVERRIDES`)

Companies whose career page hostname differs from their ATS board slug are mapped in `HOSTNAME_SLUG_OVERRIDES` in `detector.ts`. For example, `ouraring.com` maps to Greenhouse slug `oura`.

### Career URL aliases (`CAREER_URL_ALIASES`)

Before ATS detection, `CAREER_URL_ALIASES` in `company-apis.ts` remaps branded career page hostnames (e.g. `careers.abb`) to the canonical ATS URL. This allows operators to paste the user-facing URL instead of the raw ATS URL.

---

## Layer 1.5 — Per-company API configs (`COMPANY_APIS`)

Some companies load their job data from internal or proprietary APIs that aren't generic ATS platforms. These are configured manually in `src/lib/ats/company-apis.ts`, keyed by the career page hostname.

Each config specifies:

- **API URL + HTTP method** (GET or POST)
- **Pagination** — `page`, `offset`, `finder-offset` (Oracle HCM), or `none`
- **Field mapping** — dot-paths into each response item for `title`, `location`, `url`, `id`
- **Description fetching** — one of three strategies (see below)

### Description fetching strategies

| Strategy                   | When to use                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fetchDescription: true`   | Job pages are crawlable HTML. Fetches each job's URL and stores the full HTML as `descriptionHtml`.                            |
| `descriptionFields: [...]` | The listing API already returns description text. Named fields are concatenated into `descriptionText`.                        |
| `descriptionApiUrl`        | Description is in a separate JSON endpoint (e.g. Oracle HCM). Fetches one call per job using `{sourceId}` in the URL template. |

For `fetchDescription`, fetching is skipped for jobs with non-ASCII titles (they already signal a local-language requirement) and done in parallel batches of 5.

### Secondary URL (dual-locale fetching)

Some companies serve the same job listing in multiple languages (e.g. OP Financial Group has both Finnish and English locale endpoints). A `secondaryUrl` can be configured to fetch the English version; jobs are matched by `fields.id` and their descriptions replace the primary ones before classification. This prevents Finnish boilerplate from causing false positives in language detection.

---

## Layer 2 — Python scraper (`scraper/main.py`)

Used as a fallback when no ATS API or company API is available. Runs as a subprocess and prints a JSON array of `RawJob` objects to stdout.

There are two main paths:

### Generic config-driven scraper (`generic_scrapers.yaml`)

Configured in `scraper/generic_scrapers.yaml`. Each entry matches a career page URL substring and drives `scraper/platforms/generic_paginated.py` — no new Python code needed to add a company.

Six extraction modes are supported:

| Mode                  | Description                                                         | Example companies                                                                         |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `css_cards` (default) | Jobs are repeating HTML elements selected by CSS selectors          | Neste, SAP, Vaisala, Fortum, Hiab, Wärtsilä, Vestas, Sweco, Siemens Healthineers, Scout24 |
| `attribute_json`      | All jobs encoded as a JSON array in an HTML element attribute       | Metso                                                                                     |
| `script_json`         | Jobs in a Next.js RSC `self.__next_f.push()` payload                | Bolt                                                                                      |
| `script_var_json`     | Jobs in a plain JavaScript variable assignment                      | Allianz                                                                                   |
| `teamtailor`          | TeamTailor ATS sites with fixed HTML template                       | Nordnet, UpCloud, Futurice                                                                |
| `xml_feed`            | XML job feed with all fields inline (no detail page fetches needed) | Volvo Group                                                                               |

All modes share a two-phase structure:

1. **Listing** — fetch page(s) and extract jobs (supports offset, page, index, or no pagination)
2. **Description enrichment** — detail pages are fetched for English-titled jobs in tracked locations so the language classifier has description text to work with

Additional features:

- **Country filtering** (`country_filter_param` + `countries`) — runs one paginated fetch per country and merges results (e.g. SAP, Sweco)
- **Multi-location fan-out** (`detail_location_selector`) — resolves "Multiple Locations" jobs by fetching the detail page and extracting individual locations (e.g. Siemens Healthineers)
- **Job function extraction** (`job_function_selector`) — extracts department/function from the detail page for category classification

### Platform-specific scrapers

For career sites that need dedicated logic beyond what the generic config supports:

| Platform      | File                        | Detection                                          |
| ------------- | --------------------------- | -------------------------------------------------- |
| Academic Work | `platforms/academicwork.py` | URL contains `academicwork.fi/.se/.no/.dk/.de/.ch` |
| Arla          | `platforms/arla.py`         | URL contains `jobs.arla.com`                       |
| Attrax        | `platforms/attrax.py`       | HTML contains `attrax-vacancy-tile`                |
| Barona        | `platforms/barona.py`       | URL contains `baronacareers.com` or `barona.fi`    |
| Njoyn         | `platforms/njoyn.py`        | URL contains `njoyn.com`                           |
| Rovio         | `platforms/rovio.py`        | URL contains `rovio.com`                           |
| Zalando       | `platforms/zalando.py`      | URL contains `jobs.zalando.com`                    |

### URL overrides

Some sites cap their unfiltered job listing at fewer results than they actually have. A `URL_OVERRIDES` dict in `main.py` maps career page hostnames to pre-filtered URLs (e.g. Tieto is filtered to tracked countries, bypassing a 250-job cap on the unfiltered listing).

### Generic heuristic fallback

For URLs matching neither a generic config nor a known platform, the scraper falls back to a static HTTP fetch + BeautifulSoup extraction. If static yields fewer than 3 jobs, Playwright is tried.

Three heuristic strategies run and the one returning the most jobs wins:

1. **Container scan** — finds elements whose `class` or `id` matches job-related keywords, extracts title + URL from the first heading or link found
2. **List scan** — finds `<ul>`/`<ol>` where most `<li>` items have job-like URLs
3. **Link scan** — collects `<a>` tags whose `href` path matches job-related patterns

### Description enrichment (Python scraper)

After the Python scraper returns its jobs, `enrichDescriptions()` is called to fetch individual job pages and populate `descriptionHtml`. This is the same function used by Layer 1.5's `fetchDescription` option. Without this step, language classification would only have the job title to work with.

---

## Country resolution

After jobs are collected (from any layer), each job's location is resolved to one or more countries via `lookupCountryFromLocation()` (`src/lib/ats/country-lookup.ts`).

If a job already has a `country_code` set by the scraper (e.g. from an XML feed or Lever's country field), that is used directly. Otherwise the free-text `location` string is resolved through multiple passes:

1. **Split** — location is split on semicolons and pipes, then on commas within each part. Work-mode prefixes (`Hybrid -`, `Remote -`) and suffixes (`(Remote)`) are stripped. Text inside parentheses is extracted as extra candidate segments. Spaced dashes (`" - "`) are also split to handle formats like `"Germany - Home Based"`.
2. **Segment lookup** — each segment is checked against:
    - Country name/code map (country names, native-language names, ISO 2-letter and 3-letter codes)
    - City map (maps ~1000+ cities to countries)
    - City prefix match (e.g. `"riga central"` → `"riga"` → LV)
3. **Full-string fallback** — if no segments match, the entire location is tried as a single key
4. **Trailing ISO code** — extracts a trailing 2-letter code (e.g. `"Home office DK"` → DK)
5. **Leading ISO code** — extracts a leading 2-letter code from Workday-style venue codes (e.g. `"NLGWV03 - The Hague"` → NL)
6. **Company fallback** — if all else fails, a per-company default country is used (configured in `getCompanyCountryFallback()`)

Jobs matching no tracked country are counted as `skipped_untracked_country` and excluded. Jobs with no resolvable location at all are counted as `skipped_unknown_location`.

---

## Classification

Each resolved `(job, countryCode)` pair is passed to `classifyJobVerbose()`, which runs two classifiers.

### Category classifier

Assigns one of: `engineering`, `marketing`, `sales`, `hr`, `finance`, `design`, `operations`, `customer-support`, `legal`, `data`, `other`.

Priority order:

1. **jobFunction** (from ATS department field) — matched against category keywords (highest weight)
2. **Title** — keyword matching (2 pts per match)
3. **Description** — keyword matching (1 pt per match, fallback if no title match)

### Language classifier (`detectNativeLanguage`)

Determines `requires_native_language`, `local_language_advantage`, `requiredLanguages`, and `preferredLanguages` for each job. Runs through phases in order, returning as soon as a signal is found. Phases 1a–2a are country-scoped (only check the language of the job's assigned country); Phase 2a-cross broadens the scan to all tracked languages.

**Phase 1a — Non-ASCII title**
A job title containing characters like `ä`, `ö`, `å`, `ü`, `é` etc., or an unambiguous local-language keyword (e.g. `"entwickler"`, `"asiantuntija"`), signals a local-language requirement. Returns `required` immediately without inspecting the description.

**Phase 1b — Advantage signal pre-filter**
Before running the language detector, checks if the combined text (title + description) contains any "X is a plus / advantage / preferred / benefit / asset" phrase for the country's language. If found, returns `advantage`. This runs before tinyld because a full fetched page often contains local-language navigation and footers that would trigger the detector even when the actual job says "Finnish is a plus".

Also checks group-language phrases for Nordic countries ("a Nordic language is an advantage", "fluent in a Scandinavian language", etc.) and Baltic countries ("a Baltic language is an advantage", etc.). The regex-based check also handles patterns like "German or other Nordic languages are a plus" and "knowledge of Scandinavian languages is an asset".

**Phase 1b-chars — Native character frequency**
Counts occurrences of language-specific non-ASCII characters in the description (e.g. ä/ö for Finnish/Swedish, æ/ø/å for Norwegian/Danish). A sufficient count (language-specific thresholds) is a near-certain indicator that the description is written in the local language.

**Phase 1c — tinyld paragraph detection**
The description is split into paragraphs (block-level HTML tags are converted to newlines by `stripHtml`). tinyld runs on each paragraph ≥ 80 characters. If any paragraph is detected as the country's language, returns `required`. Paragraph-level detection handles mixed-language ads where only the requirements section is in the local language.

**Phase 2a — Explicit requirement phrases (country-scoped)**
Scans for keyword phrases like `"fluent Finnish"`, `"Finnish required"`, `"working language is German"`, `"Finnish and English"`, `"full professional proficiency in German"`, `"conversational Finnish"`, etc. Generated programmatically per language keyword from `COUNTRY_LANGUAGE_MAP`.

Requirement signals can be negated by surrounding context:

- **Downgraded to advantage**: "nice-to-have", "not compulsory", "is preferred", "considered an asset"
- **Fully negated**: "or English" (English alone is sufficient)
- **Prefixed advantage context**: "bonus points if you speak German"

Also checks Nordic group phrases ("fluent in English and at least one Nordic language", "fluent in one Scandinavian language") and Baltic group phrases ("at least one of local Baltic language").

**Phase 2a-cross — Cross-language scan**
Repeats the requirement and advantage signal scan for every tracked language, not just the country's own. This catches cases where the required language differs from the job's location — e.g. a job in Latvia that says `"fluent Norwegian required"`. The matched language keyword is looked up in `KEYWORD_TO_CANONICAL_NAME` to produce the correct `requiredLanguages` or `preferredLanguages` value (e.g. `['Norwegian']`), independent of the job's country.

Skips any keywords belonging to the country's own language (already covered by Phase 2a). Runs after all country-specific phases so those remain the authoritative signal when they do match.

**Phase 2b — "Depending on location" conditional**
Catches phrases like `"Fluent English and, depending on the location, Finnish, Swedish or Lithuanian."` A regex detects the trigger phrase and then checks if any of the country's languages appear anywhere in the text. Returns `required` when matched.

**Phase 2c — Default**
No signals found. Returns `not required` — absence of any local-language mention is itself a strong signal that English is sufficient.

### Classification outputs

Each classified job carries:

| Field                      | Type                                                     | Description                                                            |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `requires_native_language` | `boolean`                                                | True if a local/non-English language is required                       |
| `local_language_advantage` | `boolean`                                                | True if a local language is preferred but not required                 |
| `requiredLanguages`        | `string[]`                                               | Canonical English name(s) of required language(s), e.g. `["Finnish"]`  |
| `preferredLanguages`       | `string[]`                                               | Canonical English name(s) of preferred language(s), e.g. `["Swedish"]` |
| `category`                 | `string`                                                 | Job category (engineering, sales, etc.)                                |
| `categorySource`           | `'title' \| 'description' \| 'jobFunction' \| 'default'` | What determined the category                                           |

For most single-language countries `requiredLanguages` will have one entry. Multi-language countries (CH, BE) may return multiple. Cross-language matches return the specific matched language, not the country's languages.
