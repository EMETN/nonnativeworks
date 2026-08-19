# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: go to the
[Security tab](https://github.com/EMETN/nonnativeworks/security/advisories/new)
and choose **Report a vulnerability**. This creates a private advisory visible only
to you and the maintainers.

Useful things to include, as far as you have them:

- What the issue is and which file or endpoint it affects
- How to reproduce it — a request, a payload, or a short sequence of steps
- What an attacker gains

You can expect an initial response within a week. If a report is valid, you'll be
credited in the advisory unless you'd rather not be.

## Scope

This project is a public, read-only job listings site plus a single-operator admin
area. The interesting attack surface is:

- `/api/admin/*` and `/admin/*` — session auth and the `X-Scraper-Secret`
  machine-to-machine bypass, both enforced in `src/middleware.ts`
- `src/pages/api/admin/upload.ts` and `src/lib/validation.ts` — everything the
  scraper writes to the database passes through here
- Anything that renders scraped, third-party-controlled content on public pages

Out of scope: findings that require an already-compromised admin session, rate
limiting and denial of service, and reports from automated scanners without a
demonstrated impact.

## Data

The database holds public job listings and company names — no user accounts beyond
the single admin operator, and no personal data from visitors.
