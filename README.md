# NonNativeWorks

Discover companies that welcome non-native language speakers. Track open positions across countries worldwide.

## Stack

- **Astro 7** — full SSR (`output: 'server'`; Netlify adapter in production, Node standalone adapter for local dev and CI)
- **Preact** — interactive islands (`client:load`)
- **Tailwind CSS v4** — `@tailwindcss/vite` plugin
- **Supabase** — PostgreSQL + Auth (cookie-based sessions via `@supabase/ssr`)
- **Zod** — runtime validation
- **TypeScript**

## Getting started

### Prerequisites

- Node 24+ and [pnpm](https://pnpm.io/) (or a container runtime — [OrbStack](https://orbstack.dev/), [Docker Desktop](https://www.docker.com/) — to use the devcontainer)
- A free [Supabase](https://supabase.com/) project

### Contributor setup (`.env`)

You do **not** need Doppler access to work on this project.

```bash
pnpm install
cp .env.example .env    # then fill in your Supabase URL and keys
pnpm dev:env            # dev server at localhost:4321
```

Create a Supabase project, run `supabase/migrations/000_full_schema.sql` in its SQL
editor, and copy the URL and keys from Settings → API into your `.env`. Only
`SUPABASE_URL` and `SUPABASE_ANON_KEY` are needed for the public site;
`.env.example` documents the rest.

`pnpm dev:env` and `pnpm build:env` are the `.env` equivalents of `pnpm dev` and
`pnpm build`. They load the file via `node --env-file`, which the plain `astro`
commands don't do — Astro only reads `.env` into `import.meta.env`, while the server
code reads `process.env`.

### Devcontainer setup

1. Open the repo in VS Code and reopen in the devcontainer (or use GitHub Codespaces).
2. `pnpm install` runs automatically via `postCreateCommand`.

### Secrets management (Doppler — maintainers)

Maintainers manage environment variables via [Doppler](https://www.doppler.com/) rather than a local `.env`. Access is not needed to contribute — see the `.env` route above. The `doppler.yaml` at the repo root auto-selects the project and config.

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

`pnpm dev` and `pnpm preview` are wrapped with `doppler run --` so env vars are injected automatically.

### Database setup

Run the migration in the Supabase SQL editor:

```
supabase/migrations/000_full_schema.sql
```

This creates all tables, views, RLS policies, and seeds the 12 job categories. Countries are created automatically on first upload.

### Start developing

```bash
pnpm dev:env    # .env route
pnpm dev        # Doppler route (maintainers)
```

## Commands

| Command          | Action                                         |
| ---------------- | ---------------------------------------------- |
| `pnpm dev:env`   | Dev server at `localhost:4321`, reading `.env` |
| `pnpm build:env` | Production build, reading `.env`               |
| `pnpm dev`       | Dev server via Doppler (maintainers)           |
| `pnpm build`     | Production build to `./dist/`                  |
| `pnpm preview`   | Preview production build via Doppler           |
| `pnpm test`      | Run the test suite (Vitest)                    |
| `pnpm format`    | Format with Prettier                           |
| `pnpm lint:py`   | Lint `scraper/` with Ruff                      |

## URL structure

| URL                    | Description                  |
| ---------------------- | ---------------------------- |
| `/`                    | Homepage — country list      |
| `/{country}`           | Country page — company grid  |
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

| Workflow               | Trigger                                                      | What it does                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality.yml`          | Every PR and push to `main`                                  | Prettier format check, test suite, and Ruff format + lint on `scraper/` (lint advisory for now)                                                                                                             |
| `scrape-preview.yml`   | PR that touches `scraper/companies.yaml`                     | Detects newly added companies, dry-runs their scrape, and posts the results as a PR comment for review before merge. Can also be triggered manually to write new (or all) companies to the **dev** database |
| `scheduled-scrape.yml` | Mon–Fri at 03:00 EET / 01:00 UTC (also manually triggerable) | Scrapes all companies in `companies.yaml` and writes results to the **prod** database                                                                                                                       |

### scrape-preview.yml — manual trigger options

| `all_companies` | `write_to_dev` | Result                                |
| --------------- | -------------- | ------------------------------------- |
| false           | false          | Dry-run newly added companies only    |
| false           | true           | Write newly added companies to dev DB |
| true            | false          | Dry-run all companies                 |
| true            | true           | Write all companies to dev DB         |

## Devcontainer firewall

The devcontainer has an intentional outbound firewall (`init-firewall.sh`). Supabase and Doppler domains are allowlisted. If you see `EHOSTUNREACH` for a new external domain, add it to `.devcontainer/init-firewall.sh` and rebuild the container.

## Credits

- Flag icons — [Flagpedia](https://flagpedia.net)

## License

Licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [LICENSE.md](LICENSE.md).
