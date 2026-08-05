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
- Delivery Hero
- Dept
- Edenred
- Elekta
- E.ON
- Ericsson
- Finnair
- Fiskars
- Fortum
- Futurice
- Gofore
- Happeo
- Hiab
- If
- ING
- Kone
- Konecranes
- Maersk
- Metso
- Munich Re
- Neste
- Nets/Nexi
- Nokia
- Nordea
- Nordnet
- Novo
- NXP
- OP Financial Group
- Orion
- Orkla
- Oura
- Philips
- Posti
- Prosus
- Proton
- Publicis Groupe
- Randstad
- Reaktor
- Rovio
- Sanoma
- SAP
- Scout24
- SEB
- Siemens Healthineers
- Smartly
- SOK
- Solita
- Stora Enso
- Telia
- Thales
- Tieto
- Uniper
- UpCloud
- Vaisala
- Vestas
- Volvo Group
- Wolt
- Wärtsilä
- Zalando
- Yousician

## Companies by Scraping Layer

Which companies are handled at each layer. Layers run in order and stop as soon as one returns results.

---

### Layer 1 — Known ATS APIs

Detected automatically from the career page URL. No per-company config needed — just submit the ATS-hosted URL.

| ATS        | URL pattern                                         | Companies using it                                                                                                                          |
| ---------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse | `boards.greenhouse.io/{slug}`                       | Wolt, Oura, Smartly, Yousician, Proton, AlphaSense, Dept, Solita                                                                            |
| Lever      | `jobs.lever.co/{slug}`                              | Prosus, SEB                                                                                                                                 |
| Ashby      | `jobs.ashbyhq.com/{slug}`                           | Reaktor                                                                                                                                     |
| Workable   | `apply.workable.com/api/v1/widget/accounts/{slug}`  | Iceye                                                                                                                                       |
| Workday    | `{slug}.wd3.myworkdayjobs.com/wday/cxs/{slug}/jobs` | Posti, ABB, Stora Enso, SOK, Airbus, If, Maersk, Kone, Edenred (myworkdaysite), Finnair, Sanoma, Fiskars, Elekta, Thales, ING, NXP, Philips |
| Recruitee  | `{slug}.recruitee.com`                              | Happeo                                                                                                                                      |

---

### Layer 1.5 — Per-company API configs

Manually configured in `src/lib/ats/company-apis.ts`, keyed by career page hostname.

| Company            | Hostname                                     | API type                                                          |
| ------------------ | -------------------------------------------- | ----------------------------------------------------------------- |
| OP Financial Group | `op-careers.fi`                              | Custom recruiting API (POST, Polylang locale)                     |
| Nokia              | `jobs.nokia.com`                             | Oracle HCM Recruiting Cloud                                       |
| Nets/Nexi          | `fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com` | Oracle HCM Recruiting Cloud                                       |
| Orion              | `fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com` | Oracle HCM Recruiting Cloud                                       |
| Gofore             | `gofore.com`                                 | WordPress REST API (Polylang)                                     |
| Nordea             | `nordea.com`                                 | Custom Nordea API                                                 |
| Telia              | `teliacompany.com`                           | Custom JSON API (`/api/job`)                                      |
| Accenture          | `accenture.com`                              | Custom API                                                        |
| Booking.com        | `jobs.booking.com`                           | Custom API                                                        |
| Orkla              | `careers.orkla.com`                          | Custom API (POST)                                                 |
| Capgemini          | `capgemini.com/careers`                      | Custom API                                                        |
| Publicis Groupe    | `careers.publicisgroupe.com/jobs`            | Custom API                                                        |
| Novo Nordisk       | `novonordisk.com/careers`                    | Custom API                                                        |
| Randstad           | `randstad.com/jobs/careers-at-randstad`      | Customer API`                                                     |
| Deel               | `deel.com`                                   | Self-hosted `deel-ats` API (Ashby-backed; multi-country postings) |
| E.ON               | `jobs.eon.com`                               | Careers platform `/api/filter/query` (same as Uniper)             |

---

### Layer 2 — Python HTML scraper

Fallback when no API is available. Configured in `scraper/main.py`.

#### Attrax ATS (dedicated scraper within layer 2)

Detected by `attrax-vacancy-tile` in the page HTML. Uses a paginated Attrax-specific parser.

| Company       | Hostname                   | Notes                                                                      |
| ------------- | -------------------------- | -------------------------------------------------------------------------- |
| Konecranes    | `konecranes.careers/jobs`  |                                                                            |
| Tieto         | `careers.tieto.com`        | URL override applied — filtered to tracked countries to bypass 250-job cap |
| Delivery Hero | `careers.deliveryhero.com` |                                                                            |

#### Config-driven generic scraper (`scraper/generic_scrapers.yaml`)

Declarative YAML config — no code changes needed to add a company. Two extraction modes:

- **`css_cards`** — jobs are repeating HTML elements; configure a card selector + field selectors
- **`attribute_json`** — all jobs are encoded as a JSON array in an HTML attribute (common with web components)

| Company              | Hostname                                                    | Mode                        | Notes                                                                                   |
| -------------------- | ----------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| Metso                | `metso.com/corporate/careers/open-jobs`                     | `attribute_json`            | `<careers-list-page open-positions='[…]'>`; fan-out per country via `countries[]` array |
| Neste                | `jobs.neste.com`                                            | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Vaisala              | `careers.vaisala.com/search`                                | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| SAP                  | `jobs.sap.com/search`                                       | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Fortum               | `jobs.fortum.com/search`                                    | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Hiab                 | `careers.hiab.com/search`                                   | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Wärtsilä             | `careers.wartsila.com/search`                               | `css_cards`                 | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Vestas               | `careers.vestas.com/search`                                 | `css_cards`                 | Paginated `?startrow=N` table; 10 rows per page; descriptions enriched via static fetch |
| Bolt                 | `bolt.eu/en/careers/positions`                              | `script_json`               | Paginated; 20 rows per page                                                             |
| UpCloud              | `upcloud.teamtailor.com/jobs`                               | teamtailor                  |                                                                                         |
| Futurice             | `careers.futurice.com/en-GB/jobs`                           | teamtailor                  |                                                                                         |
| Nordnet              | `career.nordnetab.com/jobs`                                 | teamtailor                  |
| Siemens Healthineers | `jobs.siemens-healthineers.com/en_US/searchjobs/SearchJobs` | `css_cards`                 | Paginated offset; 6 rows page                                                           |
| Scout24              | `scout24.com/en/career/jobs`                                | `css_cards`                 | no pagination                                                                           |
| Volvo Group          | `jobs.volvogroup.com/feed/361555`                           | `xml_feed`                  | no pagination                                                                           |
| Munich Re            | `careers.munichre.com/en/search-jobs`                       | `css_cards - json_html_key` | Paginated; CurrentPage                                                                  |

#### Platform-specific scrapers (`scraper/platforms/`)

Dedicated per-platform Python modules for sites with non-standard structures.

| Company       | Hostname           | Notes                                                                                                                                                                                                               |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Academic Work | `academicwork.fi`  | Staffing agency; paginated `?i=0,1,...` listing; card parsed via `div.grid.auto-rows-min` grid; descriptions fetched from English URL (`/en/jobs/j/…?lang=en`) to avoid Finnish boilerplate                         |
| Arla          | `jobs.arla.com`    | Jobs JSON embedded in a `<script>` block (`phApp.ddo`); paginated `?from=N`; descriptions enriched via static fetch                                                                                                 |
| Barona        | `barona.fi`        | Hybrid: Phase 1 fetches full listing via barona.fi WP AJAX API (plain requests); Phase 2 uses Playwright on baronacareers.com to read `requirements.languages` and `requirements.education` for English-titled jobs |
| CGI           | `cgi.njoyn.com`    | Njoyn ATS; Playwright                                                                                                                                                                                               |
| Rovio         | `rovio.com`        | Custom `c-open-po-card` HTML; descriptions enriched via static fetch                                                                                                                                                |
| Zalando       | `jobs.zalando.com` | Next.js RSC payload parsed from `self.__next_f.push` chunks; offices mapped to country codes; descriptions enriched via static fetch                                                                                |
