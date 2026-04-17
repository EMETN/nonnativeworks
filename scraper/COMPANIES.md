# Companies tracked

- ABB
- Academic Work
- Accenture
- Airbus
- Barona
- CGI
- Gofore
- Happeo
- If
- Konecranes
- Neste
- Nokia
- Nordea
- Orion
- OP Financial Group
- Oura
- Posti
- Reaktor
- Rovio
- Smartly
- SOK
- Stora Enso
- Tieto
- Wolt
- Zalando
- Yousician

## Companies by Scraping Layer

Which companies are handled at each layer. Layers run in order and stop as soon as one returns results.

---

### Layer 1 — Known ATS APIs

Detected automatically from the career page URL. No per-company config needed — just submit the ATS-hosted URL.

| ATS | URL pattern | Companies using it |
|-----|-------------|-------------------|
| Greenhouse | `boards.greenhouse.io/{slug}` | Wolt, Oura, Smartly, Yousician |
| Lever | `jobs.lever.co/{slug}` | |
| Ashby | `jobs.ashbyhq.com/{slug}` | Reaktor |
| Workable | `apply.workable.com/api/v1/widget/accounts/{slug}` |Iceye |
| Workday | `{slug}.wd3.myworkdayjobs.com/wday/cxs/{slug}/jobs` | Posti, ABB, Stora Enso, SOK, Airbus, If |
| Recruitee | `{slug}.recruitee.com` | Happeo |

---

### Layer 1.5 — Per-company API configs

Manually configured in `src/lib/ats/company-apis.ts`, keyed by career page hostname.

| Company | Hostname | API type |
|---------|----------|----------|
| OP Financial Group | `op-careers.fi` | Custom recruiting API (POST, Polylang locale) |
| Nokia | `jobs.nokia.com` | Oracle HCM Recruiting Cloud |
| Orion | `fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com` | Oracle HCM Recruiting Cloud |
| Gofore | `gofore.com` | WordPress REST API (Polylang) |
| Nordea | `nordea.com` | Custom Nordea API |
| Accenture | `accenture.com` | Custom API |

---

### Layer 2 — Python HTML scraper

Fallback when no API is available. Configured in `scraper/main.py`.

#### Attrax ATS (dedicated scraper within layer 2)

Detected by `attrax-vacancy-tile` in the page HTML. Uses a paginated Attrax-specific parser.

| Company | Hostname | Notes |
|---------|----------|-------|
| Konecranes | `konecranes.careers/jobs` | |
| Tieto | `careers.tieto.com` | URL override applied — filtered to tracked countries to bypass 250-job cap |

#### Generic heuristics (all other sites)

Any company not matched by layers 1, 1.5, or Attrax detection falls here. The scraper tries three parallel strategies (container scan, list scan, link scan) and uses whichever returns the most results.

| Company | Hostname | Notes |
|---------|----------|-------|
| Academic Work | `academicwork.fi` | Staffing agency; paginated `?i=0,1,...` listing; card parsed via `div.grid.auto-rows-min` grid; descriptions enriched via static fetch |
| Barona | `barona.fi` | Hybrid: Phase 1 fetches full listing via barona.fi WP AJAX API (plain requests); Phase 2 uses Playwright on baronacareers.com to read `requirements.languages` and `requirements.education` for English-titled jobs |
| CGI | `cgi.njoyn.com` | Playwright |
| Neste | `jobs.neste.com` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Rovio | `rovio.com` | Custom `c-open-po-card` HTML; descriptions enriched via static fetch |
| Zalando | `jobs.zalando.com` | Next.js RSC payload parsed from `self.__next_f.push` chunks; offices mapped to country codes; descriptions enriched via static fetch |



