# Contributing

Thanks for taking an interest. This project tracks open job positions at companies
where English is enough — no local language required.

By contributing you agree that your work is licensed under the terms in
[LICENSE.md](LICENSE.md).

## Ways to contribute

All of these are welcome:

- **Bug fixes** — anything that's broken, from a wrong job classification to a
  layout that collapses on mobile
- **Scraper coverage** — new ATS integrations, custom scrapers for career pages the
  generic layers can't read, better country and city resolution
- **Classification quality** — the language and category classifiers in
  `src/lib/classifiers/` decide what shows up as "English is enough". Improvements
  there raise the quality of every listing
- **UI and UX** — design, layout, interaction, dark mode
- **Accessibility** — semantic markup, keyboard navigation, contrast, screen readers
- **Performance** — page weight, query efficiency, caching, Core Web Vitals
- **Documentation** — including this file
- **Adding a company** — see below; it needs no local setup

If you're planning something substantial, open an issue first so we can talk it
through before you spend the time.

## Adding a company

Coverage is what makes the site useful, and adding a company is a small change to
[`scraper/companies.yaml`](scraper/companies.yaml):

```yaml
- name: Example Corp
  url: https://careers.example.com
  min_positions: 5
```

| Field                | Meaning                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| `name`               | Display name — readability only, not used by the scraper                              |
| `url`                | Career page URL handed to the scraper (required)                                      |
| `min_positions`      | Run fails if fewer positions are found. Set conservatively; `0` warns instead         |
| `is_english_company` | Flags the company as English-only. Stored, not yet shown on the site. Default `false` |

Opening a PR that touches `companies.yaml` triggers the **Scrape preview** workflow.
It dry-runs the new entries and posts the results as a comment, so you and the
maintainers can see what would be imported before anything is merged. If the preview
finds nothing, the career page probably needs a custom scraper — say so in the PR
and we can look at it together.

If you're working from a fork, the preview won't run automatically — GitHub
withholds the credentials it needs from forked pull requests. A maintainer will run
it and post the results on your PR. Nothing is expected of you.

Companies must have a career page reachable without a login.

Adding a company needs **no local setup and no credentials** — edit the YAML in
GitHub's web editor and open the PR. The preview workflow does the rest.

## Development setup

Only needed if you're changing code. See
[README.md](README.md#contributor-setup-env). Short version:

```bash
pnpm install
cp .env.example .env    # fill in Supabase URL + keys
pnpm dev:env
```

You need your own free Supabase project; run
`supabase/migrations/000_full_schema.sql` in its SQL editor to create the schema.
Doppler access is for maintainers only and is not required.

## Before opening a PR

```bash
pnpm test           # Vitest
pnpm format         # Prettier — TS, JS, .astro, JSON, YAML, Markdown
pnpm format:py      # Ruff formatter for scraper/
pnpm lint:py        # Ruff linter
pnpm lint:secrets   # Secretlint — scan the repo for credentials
```

A pre-commit hook formats staged files automatically, and CI re-checks formatting,
tests, Ruff, and the secret scan on every PR.

Conventions worth matching:

- Prettier owns formatting — 4-space indent, single quotes. Don't hand-format.
- Comments explain _why_, not _what_, and stay sparse.
- Python lives in `scraper/` and follows Ruff's defaults.

## Keeping credentials out of git

Your `.env` holds keys for _your own_ Supabase project, not this one's — but it
still shouldn't reach a public repo. Three things guard against that:

- `.env` is gitignored. Don't `git add -f` it.
- The pre-commit hook runs [Secretlint](https://github.com/secretlint/secretlint)
  over every staged file and **aborts the commit** if it finds a credential. It
  knows the formats used here: Supabase keys (both the legacy JWT and `sb_secret_`
  styles), Doppler tokens, Sentry auth tokens, plus the usual AWS/GCP/GitHub
  patterns. Config lives in `.secretlintrc.json`.
- GitHub push protection blocks pushes containing recognised secrets, and Supabase
  is a scanning partner — leaked keys get revoked automatically.

If you ever do commit a key: revoke and rotate it first, then worry about the git
history. Rewriting history doesn't un-leak a secret that's already been pushed.

## Where things are

| Path                   | What                                                           |
| ---------------------- | -------------------------------------------------------------- |
| `src/pages/`           | Astro routes — public pages, `/admin`, `/api`                  |
| `src/components/`      | Preact islands and Astro components                            |
| `src/lib/ats/`         | ATS integrations (Greenhouse, Lever, Ashby, Workable, Workday) |
| `src/lib/classifiers/` | Language and category classification                           |
| `scraper/`             | Python/Playwright fallback scraper                             |
| `supabase/migrations/` | Schema                                                         |

`scraper/CLAUDE.md` and `scraper/SCRAPING.md` document how the three scraping layers
fit together — worth reading before changing extraction logic.

## For maintainers: previewing a company added from a fork

The scrape preview is skipped on pull requests from forks — GitHub withholds the
Doppler credentials it needs, so the run would only fail. Previewing one means
running the contributor's branch from this repo, where those credentials _are_ in
scope.

Only do that when the diff is **nothing but `scraper/companies.yaml`**. A one-line
YAML addition is trivially verifiable by eye, and the only code that executes is our
own scraper pointed at their URL.

If the PR touches anything else — `package.json`, a workflow, `scraper/` — review
and merge it on its own merits and let the nightly scheduled scrape validate the
company. Re-running a fork's branch from this repo to "just check it" hands that
branch our tokens.

## Security

Please don't report vulnerabilities in public issues. See
[SECURITY.md](SECURITY.md).
