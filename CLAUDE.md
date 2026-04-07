# NonNativeWorks — Project Context

## What this is

A website that tracks open job positions at companies where English is enough — no local language required. Visitors browse by country, see job ratios and category breakdowns. An admin operator curates data by generating LLM prompts from career page URLs and uploading the structured JSON output.

## Status: All 5 phases complete

- Phase 1: Project setup, Supabase schema, base layouts ✓
- Phase 2: Homepage infographic (flag-colored bars + spheres) ✓
- Phase 3: Country detail pages (sortable company table, category breakdown) ✓
- Phase 4: Admin UI (prompt generator, JSON uploader, data manager, auth) ✓
- Phase 5: SEO, Open Graph, sitemap, robots.txt, accessibility, favicon ✓

## Stack

- **Astro 5** — `output: 'server'` (full SSR; Netlify adapter in production, Node standalone adapter for local dev and GitHub Actions CI)
- **Preact** — interactive islands (`client:load`)
- **Tailwind CSS v4** — `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- **Supabase** — PostgreSQL + Auth (cookie-based sessions via `@supabase/ssr`)
- **Zod** — runtime validation (client + server)
- **TypeScript** — `"jsxImportSource": "preact"` in `tsconfig.json`

## Known quirks & patches

### `@preact/preset-vite` bug
The package throws `Cannot use 'in' operator to search for 'meta' in undefined`. A postinstall patch applies automatically:
- Script: `scripts/patch-preact-vite.mjs`
- Adds `this != null &&` guard before `"meta" in this` in the built ESM file
- Re-runs on every `pnpm install` via `"postinstall"` in `package.json`

### Supabase SSR cookie type fix
`parseCookieHeader` returns `value?: string | undefined`. Fixed in `src/lib/supabase.ts` by mapping `value: value ?? ''`.

### Dev server
```bash
pnpm dev
# Runs with --host (devcontainer) and --dns-result-order=ipv4first
```

### Devcontainer firewall
The devcontainer has an intentional outbound firewall (`init-firewall.sh`). Supabase domains are allowlisted. If you see `EHOSTUNREACH` on a new Supabase project URL, add it to `.devcontainer/init-firewall.sh` and rebuild the container.

## Database

Run the migration in the Supabase SQL editor:
1. `supabase/migrations/000_full_schema.sql` — tables, views, RLS, seed data (10 categories)

### Key schema points
- `companies` has a `UNIQUE(name, country_id)` constraint — upserts on this
- `positions` are always fully replaced on upload (delete + re-insert per company)
- `country_stats` and `company_stats` are SQL views used by public pages
- Auto-country creation: upload API creates unknown countries using `country_name` + `country_code` from LLM output

## Scraping system

### Overview
Scraping is the automated extraction of job listings from company career pages. The TypeScript API route `/api/admin/scrape` (POST) handles all scraping logic — both in dev and in the GitHub Actions workflow. There is no logic duplication between the two environments.

### How a single scrape works (`src/pages/api/admin/scrape.ts`)
Before ATS detection, `CAREER_URL_ALIASES` (`src/lib/ats/company-apis.ts`) remaps friendly branded career URLs (e.g. `careers.abb`) to the canonical ATS URL that the scraper should actually hit.

The scraper then runs in three layers, falling through to the next if the previous returns no results:

1. **Layer 1 — ATS API**: Detects the ATS from the URL (Greenhouse, Lever, Ashby, Workable, Workday) and calls their public JSON APIs. No browser needed. If no ATS hostname is matched but a company slug is found, it probes all four slug-based ATS APIs speculatively. Description fetching is limited to jobs in tracked countries to avoid unnecessary fetches for large global listings.
2. **Layer 1.5 — per-company API**: Falls back to `COMPANY_APIS` config (`src/lib/ats/company-apis.ts`) for companies with custom API endpoints. Fetching logic lives in `src/lib/ats/company-api-fetcher.ts`. Configured companies: OP Financial Group, Nokia, Gofore, Nordea, Accenture.
3. **Layer 2 — Python scraper**: Falls back to `scraper/main.py` (Playwright-based browser scraper) for sites with no supported ATS. After the Python scraper returns jobs, `enrichDescriptions()` fetches individual job pages for language classification.

After jobs are collected, each job's location is resolved to one or more countries via `lookupCountryFromLocation()` (`src/lib/ats/country-lookup.ts`). Jobs without a matching tracked country are skipped. `classifyJobVerbose()` then assigns `category` and `requires_native_language`. Results are returned as a `ScrapeResult` with jobs grouped by country.

### Development: admin UI scraper tab
- Operator pastes a career URL into the admin scraper tab
- The browser calls `POST /api/admin/scrape` on the running Astro dev server
- Results are reviewed in the UI, then uploaded via the JSON uploader (or the scrape result is uploaded directly)
- The Python scraper subprocess is spawned locally. Python binary lookup order: `/opt/scraper-venv/bin/python3` (Docker/devcontainer), then `scraper/.venv/bin/python3`, then system `python3`

### Production: GitHub Actions scheduled workflow
- **Workflow**: `.github/workflows/scheduled-scrape.yml` — runs every 2 days at 06:00 UTC; also triggerable manually
- **Company list**: `scraper/companies.yaml` — add a company here only after manually testing it via the admin scraper tab
- **Execution**: Builds the Astro app (Node standalone adapter) and starts it locally (`node dist/server/entry.mjs`) inside the runner, then calls its own `/api/admin/scrape` and `/api/admin/upload` endpoints — same code path as local dev
- **Parallelism**: Companies are split into up to 3 parallel slices (GitHub Actions matrix) via `scraper/batch_run.py`
- **Auth**: `SCRAPER_SECRET` env var (via Doppler) is passed as the `X-Scraper-Secret` header to bypass cookie auth
- **Secrets**: Only `DOPPLER_TOKEN` is stored in GitHub — Doppler injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SCRAPER_SECRET`
- **Logs**: Scrape run logs are written to `logs/YYYY-MM-DD.log` and uploaded as GitHub Actions artifacts (90-day retention)

### Key scraper files

| File | Purpose |
|------|---------|
| `src/pages/api/admin/scrape.ts` | Main scrape endpoint — URL aliasing, ATS detection, layer 1/1.5/2 fallback, classification |
| `src/lib/ats/detector.ts` | URL → ATS type + company slug detection |
| `src/lib/ats/types.ts` | Shared TypeScript types: `RawJob`, `ScrapeResult`, `AtsType`, etc. |
| `src/lib/ats/greenhouse.ts` / `lever.ts` / `ashby.ts` / `workable.ts` / `workday.ts` | Layer 1 ATS-specific fetchers |
| `src/lib/ats/company-apis.ts` | Layer 1.5: per-company API configs (`COMPANY_APIS`) + `CAREER_URL_ALIASES` |
| `src/lib/ats/company-api-fetcher.ts` | Layer 1.5: fetcher logic (pagination, field mapping, description enrichment) |
| `src/lib/ats/country-lookup.ts` | Location → country resolution, city extraction, work model extraction, company country fallbacks |
| `src/lib/ats/title-language.ts` | Non-ASCII title detection (Phase 1a of language classification) |
| `src/lib/tracked-countries.ts` | `TRACKED_COUNTRY_CODES` set — controls which countries are scraped and shown |
| `src/lib/classifier.ts` | Job classification (`category`, `requires_native_language`) |
| `src/lib/scrape-logger.ts` | Writes human-readable logs to `logs/` |
| `scraper/main.py` | Python/Playwright browser scraper (Layer 2 fallback) |
| `scraper/platforms/` | Platform-specific Python scrapers (attrax, barona, njoyn, rovio, zalando) |
| `scraper/app.py` | Optional FastAPI wrapper for deploying the Python scraper on Render |
| `scraper/classify.ts` | Dev CLI tool: pipes raw Python scraper JSON through the TypeScript classifier |
| `scraper/companies.yaml` | Production company list for scheduled scraping |
| `scraper/batch_run.py` | GitHub Actions runner — reads YAML, calls scrape + upload endpoints |
| `scraper/SCRAPING.md` | Detailed reference: layers, country resolution, classification phases |
| `.github/workflows/scheduled-scrape.yml` | Scheduled scrape workflow definition |

## LLM prompt system

`src/lib/prompt-template.ts` — `generatePrompt(careerPageUrl)`:
- Instructs LLM to extract ALL positions from a career page, grouped by country
- Output: JSON object `{ total_positions, companies: [...] }` (wrapped format also accepted)
- Each position has: `country_code`, `title`, `url`, `requires_native_language`, `category`
- The `country_code` on each position is a self-anchoring field to prevent wrong-country assignment
- Detailed rules for `requires_native_language` — default to `true` when in doubt
- Explicit instruction: city lists within one country must NOT be split across countries

## Upload JSON format

The upload endpoint (`/api/admin/upload`) and Zod schema (`src/lib/validation.ts`) accept:
- A single company entry object
- A bare array of entries
- A wrapped object `{ total_positions, companies: [...] }`

All `career_page_url` and position `url` fields auto-strip markdown link format (`[text](url)`) via Zod transform.

## Key files

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Server Supabase client (cookie auth) |
| `src/lib/supabase-browser.ts` | Browser Supabase client (admin islands) |
| `src/lib/queries.ts` | All DB query functions |
| `src/lib/types.ts` | TypeScript interfaces matching DB schema |
| `src/lib/validation.ts` | Zod schemas for upload JSON |
| `src/lib/prompt-template.ts` | LLM prompt generation |
| `src/lib/country-flags.ts` | Flag colors by ISO alpha-2 + `nameToSlug()` |
| `src/middleware.ts` | Auth guard for `/admin/*` routes |
| `src/pages/api/admin/upload.ts` | POST — validate & upsert company data |
| `src/pages/api/admin/companies.ts` | GET/DELETE — manage companies |
| `src/pages/sitemap.xml.ts` | Dynamic SSR sitemap |
| `public/robots.txt` | Allows all, blocks /admin and /api/ |

## URL structure

| URL | Page file | What it shows |
|-----|-----------|---------------|
| `/` | `src/pages/index.astro` | Homepage with country list |
| `/{country}` | `src/pages/[country]/index.astro` | Country page with company grid |
| `/{country}/{company}` | `src/pages/[country]/[company].astro` | Company page with position list |

Company slugs are derived at runtime via `nameToSlug()` — no slug column in the DB.

## Component map

**Public:**
- `DataGrid.tsx` (Preact) — shared sortable grid used by homepage (countries) and country page (companies)
- `InfographicGrid.tsx` (Preact) — wraps DataGrid for homepage countries
- `CompanyGrid.tsx` (Preact) — wraps DataGrid for country page companies
- `PositionList.tsx` (Preact) — company page position list with search and category filter pills
- `CountrySummary.astro` — stat boxes on country page
- `CategoryBreakdown.astro` — horizontal bar chart per category

**Admin (all Preact `client:load`):**
- `PromptGenerator.tsx` — URL input → generates LLM prompt → copy button
- `JsonUploader.tsx` — paste/upload JSON → validate → upload to Supabase
- `DataManager.tsx` — list + delete companies

## Potential next improvements

- Trend tracking (historical snapshots per company)
- Email notification when new positions match a saved filter
- OpenGraph image generation (dynamic OG images per country page)
- Dark mode
