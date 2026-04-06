# NonNativeWorks

Discover companies that welcome non-native language speakers. Track open positions across countries worldwide.

## Stack

- **Astro 5** — full SSR (`output: 'server'`; Netlify adapter in production, Node standalone adapter for local dev and CI)
- **Preact** — interactive islands (`client:load`)
- **Tailwind CSS v4** — `@tailwindcss/vite` plugin
- **Supabase** — PostgreSQL + Auth (cookie-based sessions via `@supabase/ssr`)
- **Zod** — runtime validation
- **TypeScript**

## Getting started

### Prerequisites

- A container runtime ([OrbStack](https://orbstack.dev/), [Docker Desktop](https://www.docker.com/), etc.)
- [Doppler CLI](https://docs.doppler.com/docs/cli) access — request it from the project owner

### Devcontainer setup

1. Open the repo in VS Code and reopen in the devcontainer (or use GitHub Codespaces).
2. `pnpm install` runs automatically via `postCreateCommand`.

### Secrets management (Doppler)

All environment variables (Supabase keys, git config, etc.) are managed via [Doppler](https://www.doppler.com/). The `doppler.yaml` at the repo root auto-selects the project and config.

After the **first** devcontainer build:

```bash
doppler login          # Authenticate (opens browser)
doppler setup          # Auto-configured via doppler.yaml
```

Both credentials and setup are persisted in a Docker volume (`~/.doppler`), so you won't need to re-run these after rebuilding the container.

Each developer's secrets (Supabase keys, git identity, etc.) live in their own `dev_personal` config. Set your git identity once:

```bash
doppler secrets set --config dev_personal GIT_USER_NAME="Your Name" GIT_USER_EMAIL="your@email.com"
```

Git config is applied automatically on container start via `postStartCommand`.

All `pnpm` scripts (`dev`, `build`, `preview`) are wrapped with `doppler run --` so env vars are injected automatically.

### Database setup

Run the migration in the Supabase SQL editor:

```
supabase/migrations/000_full_schema.sql
```

This creates all tables, views, RLS policies, and seeds 5 countries + 10 categories.

### Start developing

```bash
pnpm dev
```

## Commands

| Command            | Action                               |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start dev server at `localhost:4321` |
| `pnpm build`       | Build production site to `./dist/`   |
| `pnpm preview`     | Preview production build locally     |

## URL structure

| URL | Description |
|-----|-------------|
| `/` | Homepage — country list |
| `/{country}` | Country page — company grid |
| `/{country}/{company}` | Company page — position list |

## Project structure

```
src/
├── components/
│   ├── admin/           # Admin UI islands (Preact)
│   ├── company/         # Company page components
│   ├── country/         # Country page components
│   ├── infographic/     # Homepage infographic
│   └── shared/          # Reusable components (DataGrid)
├── layouts/             # Base and admin page layouts
├── lib/                 # Shared utilities, DB queries, validation
├── pages/
│   ├── api/admin/       # Upload and company management endpoints
│   ├── api/auth/        # Sign-in / sign-out endpoints
│   ├── admin/           # Admin dashboard and login
│   ├── [country]/
│   │   ├── index.astro  # Country page
│   │   └── [company].astro # Company page
│   └── index.astro      # Homepage
├── styles/              # Global CSS
└── middleware.ts        # Auth guard for /admin/*
```

## CI / workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `scrape-preview.yml` | PR that touches `scraper/companies.yaml` | Detects newly added companies, dry-runs their scrape, and posts the results as a PR comment for review before merge. Can also be triggered manually to write new (or all) companies to the **dev** database |
| `scheduled-scrape.yml` | Mon–Fri at 06:00 EET (also manually triggerable) | Scrapes all companies in `companies.yaml` and writes results to the **prod** database |

### scrape-preview.yml — manual trigger options

| `all_companies` | `write_to_dev` | Result |
|---|---|---|
| false | false | Dry-run newly added companies only |
| false | true | Write newly added companies to dev DB |
| true | false | Dry-run all companies |
| true | true | Write all companies to dev DB |

## Devcontainer firewall

The devcontainer has an intentional outbound firewall (`init-firewall.sh`). Supabase and Doppler domains are allowlisted. If you see `EHOSTUNREACH` for a new external domain, add it to `.devcontainer/init-firewall.sh` and rebuild the container.
