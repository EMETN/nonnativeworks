# Companies tracked

- ABB
- Academic Work
- Accenture
- Airbus
- AlphaSense
- Arla
- Barona (local script)
- Bolt
- Booking.com
- Capgemini
- CGI (local script)
- Dept
- Edenred
- Ericsson
- Fortum
- Gofore
- Happeo
- Hiab
- If
- Kone
- Konecranes
- Maersk
- Metso
- Neste
- Nokia
- Nordea
- OP Financial Group
- Orion
- Orkla
- Oura
- Posti
- Proton
- Publicis Groupe
- Reaktor
- Rovio
- SAP
- Smartly
- SOK
- Solita
- Stora Enso
- Telia
- Tieto
- Vaisala
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
| Greenhouse | `boards.greenhouse.io/{slug}` | Wolt, Oura, Smartly, Yousician, Proton, AlphaSense, Dept, Solita |
| Lever | `jobs.lever.co/{slug}` | |
| Ashby | `jobs.ashbyhq.com/{slug}` | Reaktor |
| Workable | `apply.workable.com/api/v1/widget/accounts/{slug}` |Iceye |
| Workday | `{slug}.wd3.myworkdayjobs.com/wday/cxs/{slug}/jobs` | Posti, ABB, Stora Enso, SOK, Airbus, If, Maersk, Kone, Edenred (myworkdaysite) |
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
| Telia | `teliacompany.com` | Custom JSON API (`/api/job`) |
| Accenture | `accenture.com` | Custom API |
| Booking.com | `jobs.booking.com` | Custom API |
| Orkla | `careers.orkla.com` | Custom API (POST) |
| Capgemini | `capgemini.com/careers` | Custom API |
| Publicis Groupe | `careers.publicisgroupe.com/jobs` | Customer API |

---

### Layer 2 — Python HTML scraper

Fallback when no API is available. Configured in `scraper/main.py`.

#### Attrax ATS (dedicated scraper within layer 2)

Detected by `attrax-vacancy-tile` in the page HTML. Uses a paginated Attrax-specific parser.

| Company | Hostname | Notes |
|---------|----------|-------|
| Konecranes | `konecranes.careers/jobs` | |
| Tieto | `careers.tieto.com` | URL override applied — filtered to tracked countries to bypass 250-job cap |

#### Config-driven generic scraper (`scraper/generic_scrapers.yaml`)

Declarative YAML config — no code changes needed to add a company. Two extraction modes:
- **`css_cards`** — jobs are repeating HTML elements; configure a card selector + field selectors
- **`attribute_json`** — all jobs are encoded as a JSON array in an HTML attribute (common with web components)

| Company | Hostname | Mode | Notes |
|---------|----------|------|-------|
| Metso | `metso.com/corporate/careers/open-jobs` | `attribute_json` | `<careers-list-page open-positions='[…]'>`; fan-out per country via `countries[]` array |
| Neste | `jobs.neste.com` | `css_cards` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Vaisala | `careers.vaisala.com/search` | `css_cards` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| SAP | `jobs.sap.com/search` | `css_cards` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Fortum | `jobs.fortum.com/search` | `css_cards` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Hiab | `careers.hiab.com/search` | `css_cards` | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Bolt | `bolt.eu/en/careers/positions` | `script_json` | Paginated; 20 rows per page |

#### Platform-specific scrapers (`scraper/platforms/`)

Dedicated per-platform Python modules for sites with non-standard structures.

| Company | Hostname | Notes |
|---------|----------|-------|
| Academic Work | `academicwork.fi` | Staffing agency; paginated `?i=0,1,...` listing; card parsed via `div.grid.auto-rows-min` grid; descriptions fetched from English URL (`/en/jobs/j/…?lang=en`) to avoid Finnish boilerplate |
| Arla | `jobs.arla.com` | Jobs JSON embedded in a `<script>` block (`phApp.ddo`); paginated `?from=N`; descriptions enriched via static fetch |
| Barona | `barona.fi` | Hybrid: Phase 1 fetches full listing via barona.fi WP AJAX API (plain requests); Phase 2 uses Playwright on baronacareers.com to read `requirements.languages` and `requirements.education` for English-titled jobs |
| CGI | `cgi.njoyn.com` | Njoyn ATS; Playwright |
| Rovio | `rovio.com` | Custom `c-open-po-card` HTML; descriptions enriched via static fetch |
| Zalando | `jobs.zalando.com` | Next.js RSC payload parsed from `self.__next_f.push` chunks; offices mapped to country codes; descriptions enriched via static fetch |



