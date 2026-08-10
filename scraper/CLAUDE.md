# Scraping System

The TypeScript API route `src/pages/api/admin/scrape.ts` (POST) handles all scraping logic — both in dev and in the GitHub Actions workflow. There is no logic duplication between the two environments.

## How a single scrape works

Before ATS detection, `CAREER_URL_ALIASES` (`src/lib/ats/company-apis.ts`) remaps friendly branded career URLs (e.g. `careers.abb`) to the canonical ATS URL.

The scraper runs in three layers, falling through to the next if the previous returns no results:

1. **Layer 1 — ATS API**: Detects ATS from the URL (Greenhouse, Lever, Ashby, Workable, Workday) and calls their public JSON APIs. No browser needed. If no ATS hostname is matched but a company slug is found, it probes all four slug-based ATS APIs speculatively. Description fetching is limited to jobs in tracked countries.
2. **Layer 1.5 — per-company API**: Falls back to `COMPANY_APIS` config (`src/lib/ats/company-apis.ts`) for companies with custom API endpoints. Fetching logic lives in `src/lib/ats/company-api-fetcher.ts`. Configured companies: OP Financial Group, Nokia, Gofore, Nordea, Accenture.
3. **Layer 2 — Python scraper**: Falls back to `scraper/main.py` (Playwright-based browser scraper). After the Python scraper returns jobs, `enrichDescriptions()` fetches individual job pages for language classification.

After jobs are collected, each job's location is resolved via `lookupCountryFromLocation()` (`src/lib/ats/country-lookup.ts`). Jobs without a matching tracked country are skipped. `classifyJobVerbose()` then assigns `category` and `requires_native_language`.

## Development

- Operator pastes a career URL into the admin scraper tab
- The browser calls `POST /api/admin/scrape` on the running Astro dev server
- Results are reviewed in the UI, then posted to `POST /api/admin/upload` from the same component (`src/components/admin/Scraper.tsx`)
- Python binary lookup order: `/opt/scraper-venv/bin/python3` (Docker/devcontainer), then `scraper/.venv/bin/python3`, then system `python3`

## Production: GitHub Actions scheduled workflow

- **Workflow**: `.github/workflows/scheduled-scrape.yml` — runs at 01:00 UTC Mon–Fri (`cron: '0 1 * * 1-5'`); also triggerable manually
- **Company list**: `scraper/companies.yaml` — add a company only after manually testing it via the admin scraper tab
- **Execution**: Builds the Astro app (Node standalone adapter) and starts it locally (`node dist/server/entry.mjs`), then calls its own `/api/admin/scrape` and `/api/admin/upload` endpoints
- **Parallelism**: Companies split into up to 3 parallel slices (GitHub Actions matrix) via `scraper/batch_run.py`
- **Auth**: `SCRAPER_SECRET` env var (via Doppler) passed as `X-Scraper-Secret` header to bypass cookie auth
- **Secrets**: Only `DOPPLER_TOKEN` stored in GitHub — Doppler injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SCRAPER_SECRET`
- **Logs**: Written to `logs/YYYY-MM-DD.log`, uploaded as GitHub Actions artifacts (90-day retention)

## Reference

See `scraper/SCRAPING.md` for the detailed human-readable reference: layers, country resolution, and classification phases.
