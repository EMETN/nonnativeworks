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

```bash
pnpm install
cp .env.example .env   # fill in your Supabase credentials
pnpm dev
```

### Database setup

Run the migration in the Supabase SQL editor:

```
supabase/migrations/001_initial_schema.sql
```

## Commands

| Command            | Action                               |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start dev server at `localhost:4321` |
| `pnpm build`       | Build production site to `./dist/`   |
| `pnpm preview`     | Preview production build locally     |
| `pnpm astro check` | Run TypeScript type checking         |
