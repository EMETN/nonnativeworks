# Scraping & Classification Logic

How the system fetches jobs, resolves countries, and classifies language requirements.

---

## Overview

When the admin submits a career page URL, the scrape API (`/api/admin/scrape`) runs through up to four layers in sequence, stopping as soon as any layer returns jobs.

```
Layer 1   → Known ATS API (Greenhouse, Lever, Ashby, Workable)
Layer 1.5 → Per-company API config
Layer 2   → Python HTML scraper
              └─ enrichDescriptions (fetches individual job pages)
```

All layers produce `RawJob` objects (`title`, `location`, `url`, `descriptionHtml?`, `descriptionText?`), which are then run through the classifier.

---

## Layer 1 — Known ATS APIs

The URL is inspected by `detectAts()` to see if it matches a known ATS hostname:

| Pattern | ATS |
|---|---|
| `boards.greenhouse.io/{slug}` | Greenhouse |
| `jobs.lever.co/{slug}` | Lever |
| `jobs.ashbyhq.com/{slug}` | Ashby |
| `apply.workable.com/api/v1/widget/accounts/{slug}` | Workable |

If matched, the company slug is extracted and the corresponding API is called directly (e.g. `boards-api.greenhouse.io/v1/boards/{slug}/jobs`). These APIs return structured JSON with titles, locations, and descriptions already included — no HTML scraping needed.

If the URL doesn't match a known ATS hostname, a company slug is still extracted from the hostname (stripping common prefixes like `careers.`, `jobs.`, `www.`) and probed against all three APIs speculatively.

---

## Layer 1.5 — Per-company API configs (`COMPANY_APIS`)

Some companies load their job data from internal or proprietary APIs that aren't generic ATS platforms. These are configured manually in `src/lib/ats/company-apis.ts`, keyed by the career page hostname.

Each config specifies:
- **API URL + HTTP method** (GET or POST)
- **Pagination** — `page`, `offset`, `finder-offset` (Oracle HCM), or `none`
- **Field mapping** — dot-paths into each response item for `title`, `location`, `url`, `id`
- **Description fetching** — one of three strategies (see below)

Currently configured: OP Financial Group, Nokia, Gofore, Nordea.

### Description fetching strategies

| Strategy | When to use |
|---|---|
| `fetchDescription: true` | Job pages are crawlable HTML. Fetches each job's URL and stores the full HTML as `descriptionHtml`. |
| `descriptionFields: [...]` | The listing API already returns description text. Named fields are concatenated into `descriptionText`. |
| `descriptionApiUrl` | Description is in a separate JSON endpoint (e.g. Oracle HCM). Fetches one call per job using `{sourceId}` in the URL template. |

For `fetchDescription`, fetching is skipped for jobs with non-ASCII titles (they already signal a local-language requirement) and done in parallel batches of 5.

### Secondary URL (dual-locale fetching)

Some companies serve the same job listing in multiple languages (e.g. OP Financial Group has both Finnish and English locale endpoints). A `secondaryUrl` can be configured to fetch the English version; jobs are matched by `fields.id` and their descriptions replace the primary ones before classification. This prevents Finnish boilerplate from causing false positives in language detection.

---

## Layer 2 — Python HTML scraper (`scraper/main.py`)

Used as a fallback when no API is available. Runs as a subprocess and prints a JSON array of `RawJob` objects to stdout.

### URL overrides

Some sites cap their unfiltered job listing at fewer results than they actually have. A `URL_OVERRIDES` dict maps career page hostnames to pre-filtered URLs (e.g. Tieto is filtered to tracked countries, bypassing a 250-job cap on the unfiltered listing).

### Static fetch

A plain HTTP GET is made with `requests`. The raw bytes (`resp.content`) are passed to BeautifulSoup — not `resp.text` — to avoid encoding errors with non-ASCII characters (em dashes, umlauts, etc.) when the server's declared encoding doesn't match the actual content.

Platform detection runs on the raw HTML to check for known ATS signatures (currently only Attrax).

### Attrax ATS

Detected by the presence of `attrax-vacancy-tile` in the HTML. Uses a dedicated paginated scraper instead of the generic heuristics:

- Iterates `?page=1`, `?page=2`, … while preserving any existing query parameters (e.g. country filter options)
- Tries static HTTP first; falls back to Playwright if static yields fewer than 3 jobs
- Each tile is parsed for:
  - **Title** — `attrax-vacancy-tile__title`, with `get_text(separator=" ")` + space-before-punctuation cleanup to handle nested child elements
  - **Location** — `attrax-vacancy-tile__location-freetext` (preferred) or `attrax-vacancy-tile__option-location`
  - **URL** — `attrax-vacancy-tile__learn-more` href (via `tile.find("a", href=True)` fallback)
- Deduplication uses job URL as the key (falling back to `title|location`) so jobs with the same title in different cities are not dropped

### Generic heuristics

For unknown platforms, three strategies run in parallel and the one returning the most jobs wins:

1. **Container scan** — finds elements whose `class` or `id` matches job-related keywords (`job`, `vacancy`, `opening`, etc.), filters out deeply nested wrappers, extracts title + URL from the first heading or link found
2. **List scan** — finds `<ul>`/`<ol>` where most `<li>` items have job-like URLs
3. **Link scan** — collects `<a>` tags whose `href` path matches job-related patterns

### Description enrichment (Python scraper)

After the Python scraper returns its jobs, `enrichDescriptions()` is called to fetch individual job pages and populate `descriptionHtml`. This is the same function used by Layer 1.5's `fetchDescription` option. Without this step, language classification would only have the job title to work with.

---

## Country resolution

After jobs are collected (from any layer), each job's `location` string is resolved to one or more countries via `lookupCountryFromLocation()`.

The lookup works in three passes:

1. **Country name / code match** — checks the location against a map of country names, native-language names, and ISO 3-letter codes (e.g. `"Finland"`, `"Suomi"`, `"FIN"` → `FI`)
2. **City match** — checks against a map of cities to countries (e.g. `"Tampere"` → `FI`)
3. **Comma-separated list** — splits on commas and tries each token individually

Jobs matching no tracked country are counted as `skipped_untracked_country` and excluded. Jobs with no location at all are counted as `skipped_unknown_location`.

---

## Classification

Each resolved `(job, countryCode)` pair is passed to `classifyJob()`, which runs two classifiers.

### Category classifier

Keyword matching against the job title (2 pts per match). If no title match, falls back to description text (1 pt per match). Categories: `engineering`, `marketing`, `sales`, `hr`, `finance`, `design`, `operations`, `customer-support`, `legal`, `other`.

### Language classifier (`detectNativeLanguage`)

Determines `requires_native_language`, `local_language_advantage`, `requiredLanguages`, and `preferredLanguages` for each job. Runs through phases in order, returning as soon as a signal is found. Phases 1a–2a are country-scoped (only check the language of the job's assigned country); Phase 2a-cross broadens the scan to all tracked languages.

**Phase 1a — Non-ASCII title**
A job title containing characters like `ä`, `ö`, `å`, `ü`, `é` etc. is an unambiguous signal. Returns `required` with the country's canonical language name(s) immediately without inspecting the description.

**Phase 1b — Advantage signal pre-filter**
Before running the language detector, checks if the combined text (title + description) contains any "X is a plus / advantage / preferred" phrase for the country's language. If found, returns `advantage`. This runs before tinyld because a full fetched page often contains local-language navigation and footers that would trigger the detector even when the actual job says "Finnish is a plus".

Also checks group-language phrases for Nordic countries: "a Nordic language is an advantage", "fluent in a Scandinavian language", etc.

**Phase 1c — tinyld paragraph detection**
The description is split into paragraphs (block-level HTML tags are converted to newlines by `stripHtml` before this step). tinyld runs on each paragraph ≥ 80 characters. If any paragraph is detected as the country's language, returns `required`. Paragraph-level detection handles mixed-language ads where only the requirements section is in the local language.

**Phase 2a — Explicit requirement phrases (country-scoped)**
Scans for keyword phrases like `"fluent Finnish"`, `"Finnish required"`, `"working language is German"`, `"Finnish and English"`, etc. Generated programmatically per language keyword from `COUNTRY_LANGUAGE_MAP`.

Also checks Nordic group phrases: "fluent in English and at least one Nordic language".

**Phase 2a-cross — Cross-language scan**
Repeats the requirement and advantage signal scan for every tracked language, not just the country's own. This catches cases where the required language differs from the job's location — e.g. a job in Latvia that says `"fluent Norwegian required"`. The matched language keyword is looked up in `KEYWORD_TO_CANONICAL_NAME` to produce the correct `requiredLanguages` or `preferredLanguages` value (e.g. `['Norwegian']`), independent of the job's country.

Skips any keywords belonging to the country's own language (already covered by Phase 2a). Runs after all country-specific phases so those remain the authoritative signal when they do match.

**Phase 2b — "Depending on location" conditional**
Catches phrases like `"Fluent English and, depending on the location, Finnish, Swedish or Lithuanian."` A regex detects the trigger phrase and then checks if any of the country's languages appear anywhere in the text. Returns `required` when matched. (The language may not be the first listed, so a simple substring match on `"depending on the location, {lang}"` would miss Swedish and Lithuanian in this example.)

**Phase 2c — English-only confirmation**
Checks for explicit English-only phrases like `"working language is English"`, `"English-speaking environment"`. Returns `not required`.

**Phase 2d — Default**
No signals found. Returns `not required` — absence of any local-language mention is itself a strong signal that English is sufficient.

### Classification outputs

Each classified job carries:

| Field | Type | Description |
|---|---|---|
| `requires_native_language` | `boolean` | True if a local/non-English language is required |
| `local_language_advantage` | `boolean` | True if a local language is preferred but not required |
| `requiredLanguages` | `string[]` | Canonical English name(s) of required language(s), e.g. `["Finnish"]` |
| `preferredLanguages` | `string[]` | Canonical English name(s) of preferred language(s), e.g. `["Swedish"]` |
| `city` | `string?` | Raw location string from the scraper before country resolution, e.g. `"Tampere, Finland"` |

For most single-language countries `requiredLanguages` will have one entry. Multi-language countries (CH, BE) may return multiple. Cross-language matches return the specific matched language, not the country's languages.
