# Companies tracked

- ABB
- ABN AMRO
- Academic Work
- Accenture
- Adyen
- Airbus
- Aiven
- Allianz
- AlphaSense
- AMD
- Anthropic
- Arla
- ASML
- Autodesk
- Barona
- Bayer
- Bending Spoons
- BMW Group (local script)
- Bolt
- Booking.com
- Cabify
- Capgemini
- Carlsberg
- Celonis
- CGI (local script)
- Cognite
- Danske Bank
- Deel
- Delivery Hero
- Dentsu
- DEPT
- Doctolib
- E.ON
- Edenred
- Elekta
- Equinor
- Ericsson
- Feedzai
- Finnair
- Fiskars
- Fortum
- Futurice
- GE Healthcare
- GetYourGuide
- GitLab
- Gofore
- Happeo
- Heineken
- Hiab
- Hoxhunt
- ICEYE
- If
- IKEA
- ING
- Klarna
- Kone
- Konecranes
- Legora
- Lovable
- Lufthansa Group
- Maersk
- Mapbox
- Metso
- Mews
- Mistral
- Monks
- Munich Re
- N26
- Nebius
- Neste
- Netflix
- Nets/Nexi
- Nokia
- Nordea
- Nordnet
- Novo Nordisk
- NXP
- Ogilvy
- OP Financial Group
- OpenAI
- Orion
- Orkla
- Oura
- Philips
- Picnic
- Posti
- Prosus
- Proton
- Publicis Groupe
- Randstad
- Reaktor
- RELEX Solutions
- Rovio
- Sanoma
- SAP
- Scout24
- SEB
- Siemens (local script)
- Siemens Healthineers
- Smartly
- SOK
- Solita
- Spotify
- Stellantis
- Stora Enso
- SumUp
- Supercell
- Supermetrics
- Sweco Group
- Talkdesk
- Tandem Health
- Tekever
- Telia
- Thales
- Thoughtworks
- Tieto
- Truecaller
- Trustpilot
- Uber
- Uniper
- UpCloud
- Vaisala
- Vestas
- Vinted
- VML
- Volvo Group
- Wise
- Wolt
- WPP (local script)
- Wärtsilä
- Yousician
- Zalando

## Companies by Scraping Layer

Which companies are handled at each layer. Layers run in order and stop as soon as one returns results.

---

### Layer 1 — Known ATS APIs

Detected automatically from the career page URL. No per-company config needed — just submit the ATS-hosted URL.

| ATS             | URL pattern                                         | Companies using it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse      | `boards.greenhouse.io/{slug}`                       | Wolt, Oura, Smartly, Yousician, Proton, AlphaSense, DEPT, Solita, Thoughtworks, Trustpilot, VML (`wundermanthompson`), Anthropic, Cognite, GetYourGuide, Ogilvy, Vinted (`vinteden` + language boards), Monks, SumUp, GitLab, Adyen, Nebius, Picnic (`teampicnic`, plus driver and warehouse pages from its own site), RELEX Solutions (`relex`, plus cities from its own site), Supermetrics (`supermetricsoy`), Celonis, Mews (`mewssystems`), Feedzai, Talkdesk (`talkdesk2`), N26, Cabify, Truecaller |
| Lever           | `jobs.lever.co/{slug}`                              | SEB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Ashby           | `jobs.ashbyhq.com/{slug}`                           | Reaktor, Prosus, Lovable, Legora, ICEYE, Tandem Health (`tandem-health`), Hoxhunt, OpenAI, Supercell, Mapbox, Mistral (`mistral.ai`), Doctolib                                                                                                                                                                                                                                                                                                                                                            |
| Workable        | `apply.workable.com/api/v1/widget/accounts/{slug}`  | — (none currently tracked)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Workday         | `{slug}.wd3.myworkdayjobs.com/wday/cxs/{slug}/jobs` | Posti, ABB, Stora Enso, SOK, Airbus, If, Maersk, Kone, Edenred (myworkdaysite), Finnair, Sanoma, Fiskars, Elekta, Thales, ING, NXP, Philips, Siemens Healthineers (per-country facets, via `extra_urls`), ASML (via `asml.com` alias), Equinor, Dentsu (per-country facets)                                                                                                                                                                                                                               |
| Recruitee       | `{slug}.recruitee.com`                              | Happeo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| SmartRecruiters | `jobs.smartrecruiters.com/{company}`                | SAP (with `careers.sap.com` as `extra_urls` during SAP's migration), Wise (via `wise.jobs` override)                                                                                                                                                                                                                                                                                                                                                                                                      |

---

### Layer 1.5 — Per-company API configs

Manually configured in `src/lib/ats/company-apis.ts`, keyed by career page hostname.

| Company            | Hostname                                     | API type                                                                                                                                                                                           |
| ------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP Financial Group | `op-careers.fi`                              | Custom recruiting API (POST, Polylang locale)                                                                                                                                                      |
| Nokia              | `jobs.nokia.com`                             | Oracle HCM Recruiting Cloud                                                                                                                                                                        |
| Nets/Nexi          | `fa-ewwx-saasfaprod1.fa.ocs.oraclecloud.com` | Oracle HCM Recruiting Cloud                                                                                                                                                                        |
| Orion              | `fa-esaq-saasfaprod1.fa.ocs.oraclecloud.com` | Oracle HCM Recruiting Cloud                                                                                                                                                                        |
| Gofore             | `gofore.com`                                 | WordPress REST API (Polylang)                                                                                                                                                                      |
| Nordea             | `nordea.com`                                 | Custom Nordea API                                                                                                                                                                                  |
| Telia              | `teliacompany.com`                           | Custom JSON API (`/api/job`)                                                                                                                                                                       |
| Accenture          | `accenture.com`                              | Custom API                                                                                                                                                                                         |
| Booking.com        | `jobs.booking.com`                           | Custom API                                                                                                                                                                                         |
| Orkla              | `careers.orkla.com`                          | Custom API (POST)                                                                                                                                                                                  |
| Capgemini          | `capgemini.com/careers`                      | Custom API                                                                                                                                                                                         |
| Publicis Groupe    | `careers.publicisgroupe.com/jobs`            | Custom API                                                                                                                                                                                         |
| Novo Nordisk       | `novonordisk.com/careers`                    | Custom API                                                                                                                                                                                         |
| Randstad           | `randstad.com/jobs/careers-at-randstad`      | Customer API`                                                                                                                                                                                      |
| Stellantis         | `careers.stellantis.com`                     | CWS site backed by Google Talent API (`jobsapi-google.m-cloud.io`); descriptions inline, pageSize capped at 100                                                                                    |
| Uber               | `iaziqy.fa.ocs.oraclecloud.com`              | Oracle HCM (site `UberCareers`; jobs.uber.com itself is behind Cloudflare, the Apply button goes here)                                                                                             |
| Deel               | `deel.com`                                   | Self-hosted `deel-ats` API (Ashby-backed; multi-country postings)                                                                                                                                  |
| E.ON               | `jobs.eon.com`                               | Careers platform `/api/filter/query` (same as Uniper)                                                                                                                                              |
| Uniper             | `careers.uniper.energy`                      | Careers platform `/api/filter/query` (same as E.ON)                                                                                                                                                |
| Barona             | `barona.fi`                                  | WordPress AJAX feed (1-based pages, inline descriptions, ISO2 country); no per-job language data, classifier decides                                                                               |
| Bayer              | `bayer.eightfold.ai`                         | Eightfold (num capped at 10; per-job endpoint fills missing descriptions)                                                                                                                          |
| Lufthansa Group    | `apply.lufthansagroup.careers`               | milch & zucker HR-XML search API (POST, whole board in one request)                                                                                                                                |     |
| Spotify            | `lifeatspotify.com`                          | WordPress jobs API (single response)                                                                                                                                                               |
| Microsoft          | `apply.careers.microsoft.com`                | Eightfold PCSX API (`/api/pcsx/search`), one `location` query per tracked country (~40 requests, hard 429 throttle); `fields.locations` resolves countries from each posting, not the leaky filter |
| Netflix            | `explore.jobs.netflix.net`                   | Eightfold API (offset pagination)                                                                                                                                                                  |
| Danske Bank        | `ejqi.fa.ocs.oraclecloud.eu`                 | Oracle HCM Recruiting Cloud                                                                                                                                                                        |
| ABN AMRO           | `werkenbijabnamro.nl`                        | Custom vacancy API (needs `X-Requested-With` header)                                                                                                                                               |
| AMD                | `careers.amd.com`                            | Jibe jobs API                                                                                                                                                                                      |
| Ericsson           | `jobs.ericsson.com`                          | Eightfold PCSX search API                                                                                                                                                                          |

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

| Company  | Hostname                                | Mode             | Notes                                                                                                                                                         |
| -------- | --------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metso    | `metso.com/corporate/careers/open-jobs` | `attribute_json` | `<careers-list-page open-positions='[…]'>`; fan-out per country via `countries[]` array                                                                       |
| Neste    | `jobs.neste.com`                        | `css_cards`      | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch                                                                       |
| Vaisala  | `careers.vaisala.com/search`            | `css_cards`      | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch                                                                       |
| SAP      | `careers.sap.com/search`                | `css_cards`      | Legacy site, scraped as SAP's `extra_urls` alongside SmartRecruiters. Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch |
| Fortum   | `jobs.fortum.com/search`                | `css_cards`      | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch                                                                       |
| Hiab     | `careers.hiab.com/search`               | `css_cards`      | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch                                                                       |
| Wärtsilä | `careers.wartsila.com/search`           | `css_cards`      | Paginated `?startrow=N` table; 25 rows per page; descriptions enriched via static fetch                                                                       |
| Heineken | `careers.theheinekencompany.com`        | `css_cards`      | Drupal multi-pager (`page=,,N`); country filter pinned in `extra_params`                                                                                      |

| Vestas | `careers.vestas.com/search` | `css_cards` | Paginated `?startrow=N` table; 10 rows per page; descriptions enriched via static fetch |
| Bolt | `bolt.eu/en/careers/positions` | `script_json` | Paginated; 20 rows per page |
| UpCloud | `upcloud.teamtailor.com/jobs` | teamtailor | |
| Futurice | `careers.futurice.com/en-GB/jobs` | teamtailor | |
| Nordnet | `career.nordnetab.com/jobs` | teamtailor |
| Nitor | `nitor.com/en/careers` | `css_cards` | Contentful page, all postings on one page (no pagination). Card is the link itself; no location on the cards, so `default_location: Finland` (offices in Helsinki and Tampere). Includes an "Open Application" entry |
| NestAI | `careers.nestai.com/jobs` | teamtailor | Marketing page `nestai.com/open-positions` is a Webflow list of the same jobs; 20 per page |
| Tekever | `careers.tekever.com/jobs` | teamtailor |
| IQM | `iqm.teamtailor.com/jobs` | teamtailor | Career page `iqm.tech/careers/join-us/` embeds the Teamtailor board; 20 per page |
| Bending Spoons | `jobs.bendingspoons.com` | `next_data` | All postings and their full text are in the page's `__NEXT_DATA__`; no detail fetches. One job per office country |
| GE Healthcare | `careers.gehealthcare.com/global/en/search-results` | `phenom_api` | One `/widgets` query per tracked country (from the country facet), 100 rows per page. Job links use `url_template` (applyUrl points at Workday) |
| DHL | `careers.dhl.com/global/en/search-results` | `phenom_api` | One `/widgets` query per tracked country (from the country facet), 100 rows per page. ~5,200 postings, ~85% in Germany; descriptions are fetched for the ~840 English-titled ones, so a run takes ~8 min. Job links use `url_template` (applyUrl points at Avature) |
| Siemens Healthineers | `careers.siemens-healthineers.com/global/en/search-results` | `phenom_api` | One `/widgets` query per tracked country (from the country facet), 100 rows per page. Workday tenant merged in as `extra_urls` |
| Siemens | `jobs.siemens.com/en_US/externaljobs/SearchJobs` | `css_cards` | Local run only; ~212 pages at 6 rows/page. Host rate-limits under load |
| Scout24 | `scout24.com/en/career/jobs` | `css_cards` | no pagination |
| Volvo Group | `jobs.volvogroup.com/feed/361555` | `xml_feed` | no pagination |
| Munich Re | `careers.munichre.com/en/search-jobs` | `css_cards - json_html_key` | Paginated; CurrentPage |
| IKEA | `jobs.ikea.com/en/search-jobs` | `css_cards - json_html_key` | TalentBrew `/results`, unfiltered; CurrentPage, 100 per page |
| Carlsberg | `careers.carlsberg.com/search` | `css_cards` | SuccessFactors; fetches and merges every site locale (each serves a distinct slice of jobs) |
| Sweco Group | `swecogroup.com/careers/vacancies` | `css_cards` | Recruitee-backed; per-country facet IDs read live from the country `<select>`; `description_selector` avoids local-language form fields |
| Klarna | `jobs.deel.com/klarna` | `script_json` | Deel-hosted board; no pagination; descriptions read from the listing's RSC text rows (detail pages render client-side) |

#### Platform-specific scrapers (`scraper/platforms/`)

Dedicated per-platform Python modules for sites with non-standard structures.

| Company       | Hostname                              | Notes                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Academic Work | `academicwork.fi/.se/.no/.dk/.de/.ch` | Staffing agency; one companies.yaml entry fans out to all six country sites per run; paginated `?i=0,1,...` listing; card parsed via `div.grid.auto-rows-min` grid; descriptions fetched from English URL (`/en/jobs/j/…?lang=en`) to avoid local-site boilerplate; jobs stamped with country_code explicitly per site                  |
| Aiven         | `aiven.io/careers/job`                | Static single page; title, location and URL from job cards, descriptions from job pages                                                                                                                                                                                                                                                 |
| Arla          | `jobs.arla.com`                       | Jobs JSON embedded in a `<script>` block (`phApp.ddo`); paginated `?from=N`; descriptions enriched via static fetch                                                                                                                                                                                                                     |
| BMW Group     | `bmwgroup.jobs`                       | AEM; the whole board arrives as one server-rendered jobfinder fragment (path read from the page's own `data-jobfinder-path`), fields in `data-*` attributes; rows carry a bare city, so the country comes from the page's location filter (`DE/Munich` values) joined on a normalised city name; descriptions enriched via static fetch |
| CGI           | `cgi.njoyn.com`                       | Njoyn ATS; Playwright                                                                                                                                                                                                                                                                                                                   |
| Rovio         | `rovio.com`                           | Custom `c-open-po-card` HTML; descriptions enriched via static fetch                                                                                                                                                                                                                                                                    |
| Zalando       | `jobs.zalando.com`                    | Next.js RSC payload parsed from `self.__next_f.push` chunks; offices mapped to country codes; descriptions enriched via static fetch                                                                                                                                                                                                    |
