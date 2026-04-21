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

Automated extraction of job listings from company career pages via `src/pages/api/admin/scrape.ts` (POST). Runs three layers: ATS API detection (Greenhouse, Lever, Ashby, Workable, Workday) → per-company custom APIs → Python/Playwright browser scraper. For details see `scraper/CLAUDE.md`.

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
