# Companies tracked

- Gofore  (needs still some work, language classifier not working perfectly)
- Nokia
- Nordea
- OP Financial Group
- Reaktor
- Tieto
- Wolt
- Oura
- Accenture
- Posti
- Barona (enrichment of descriptions not working yet)

## Companies by Scraping Layer

Which companies are handled at each layer. Layers run in order and stop as soon as one returns results.

---

### Layer 1 — Known ATS APIs

Detected automatically from the career page URL. No per-company config needed — just submit the ATS-hosted URL.

| ATS | URL pattern | Companies using it |
|-----|-------------|-------------------|
| Greenhouse | `boards.greenhouse.io/{slug}` | Wolt, Oura |
| Lever | `jobs.lever.co/{slug}` | |
| Ashby | `jobs.ashbyhq.com/{slug}` | Reaktor |
| Workable | `apply.workable.com/api/v1/widget/accounts/{slug}` |Iceye |
| Workday | `{slug}.wd3.myworkdayjobs.com/wday/cxs/{slug}/jobs` | Posti |

---

### Layer 1.5 — Per-company API configs

Manually configured in `src/lib/ats/company-apis.ts`, keyed by career page hostname.

| Company | Hostname | API type |
|---------|----------|----------|
| OP Financial Group | `op-careers.fi` | Custom recruiting API (POST, Polylang locale) |
| Nokia | `jobs.nokia.com` | Oracle HCM Recruiting Cloud |
| Gofore | `gofore.com` | WordPress REST API (Polylang) |
| Nordea | `nordea.com` | Custom Nordea API |
| Accenture | `accenture.com` | Custom API |
| Barona | `baronacareers.com/fi/fi/job` | Custom API |

---

### Layer 2 — Python HTML scraper

Fallback when no API is available. Configured in `scraper/main.py`.

#### Attrax ATS (dedicated scraper within layer 2)

Detected by `attrax-vacancy-tile` in the page HTML. Uses a paginated Attrax-specific parser.

| Company | Hostname | Notes |
|---------|----------|-------|
| Tieto | `careers.tieto.com` | URL override applied — filtered to tracked countries to bypass 250-job cap |

#### Generic heuristics (all other sites)

Any company not matched by layers 1, 1.5, or Attrax detection falls here. The scraper tries three parallel strategies (container scan, list scan, link scan) and uses whichever returns the most results.

| Company | Hostname | Notes |
|---------|----------|-------|
| _(add manually)_ | | |



