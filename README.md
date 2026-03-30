# NonNativeWorks

Discover companies that welcome non-native language speakers. Track open positions across countries worldwide.

## Stack

- **Astro 5** — full SSR (`output: 'server'`, Node standalone adapter)
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

After the devcontainer is created:

```bash
doppler login          # Authenticate (opens browser)
doppler setup          # Auto-configured via doppler.yaml
```

Then set your git identity in your personal config (each developer does this once):

```bash
doppler secrets set --config dev_personal GIT_USER_NAME="Your Name" GIT_USER_EMAIL="your@email.com"
```

And apply it:

```bash
doppler run -- sh -c 'git config user.name "$GIT_USER_NAME" && git config user.email "$GIT_USER_EMAIL"'
```

Shared secrets (Supabase keys, etc.) live in the `dev` config. Personal overrides like git identity go in your `dev_personal` config, which inherits from `dev` automatically.

All `pnpm` scripts (`dev`, `build`, `preview`) are wrapped with `doppler run --` so env vars are injected automatically.

### Database setup

Run the migration in the Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
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

## Project structure

```
src/
├── components/
│   ├── admin/           # Admin UI islands (Preact)
│   ├── country/         # Country detail page components
│   └── infographic/     # Homepage infographic
├── layouts/             # Base and admin page layouts
├── lib/                 # Shared utilities, DB queries, validation
├── pages/
│   ├── api/admin/       # Upload and company management endpoints
│   ├── api/auth/        # Sign-in / sign-out endpoints
│   ├── admin/           # Admin dashboard and login
│   ├── [slug].astro     # Dynamic country detail pages
│   └── index.astro      # Homepage
├── styles/              # Global CSS
└── middleware.ts        # Auth guard for /admin/*
```

## Devcontainer firewall

The devcontainer has an intentional outbound firewall (`init-firewall.sh`). Supabase and Doppler domains are allowlisted. If you see `EHOSTUNREACH` for a new external domain, add it to `.devcontainer/init-firewall.sh` and rebuild the container.
