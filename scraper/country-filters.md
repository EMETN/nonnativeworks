# Hardcoded country filters

Some companies require explicit per-country configuration because their APIs do not
return all countries in a single generic request. When you add a new tracked country
to `src/lib/tracked-countries.ts`, check each section below and update accordingly.

Currently tracked countries (`src/lib/tracked-countries.ts`, 25 total): Austria,
Belgium, Bulgaria, Croatia, Czechia, Denmark, Estonia, Finland, France, Germany,
Greece, Hungary, Iceland, Italy, Latvia, Lithuania, Luxembourg, Netherlands, Norway,
Poland, Portugal, Romania, Spain, Sweden, Switzerland.

---

## Accenture — `src/lib/ats/company-apis.ts` → `'accenture.com'` → `repeatFor.body`

Accenture's API only accepts one country per request, so the scraper fires a separate
paginated request for each entry in `repeatFor.body` and merges the results.

**Currently tracked countries included (21):**

| Country     | `jobCountry`     | `countrySite` | Notes                              |
| ----------- | ---------------- | ------------- | ---------------------------------- |
| Austria     | `Österreich`     | `at-de`       | localized site (`jobLanguage: ''`) |
| Belgium     | `Belgium`        | `be-en`       |                                    |
| Bulgaria    | `Bulgaria`       | `bg-en`       |                                    |
| Czechia     | `Czech Republic` | `cz-en`       |                                    |
| Denmark     | `Denmark`        | `dk-en`       |                                    |
| Finland     | `Finland`        | `fi-en`       |                                    |
| France      | `France`         | `fr-fr`       | localized site                     |
| Germany     | `Deutschland`    | `de-de`       | localized site                     |
| Greece      | `Greece`         | `gr-en`       |                                    |
| Hungary     | `Hungary`        | `hu-en`       |                                    |
| Italy       | `Italia`         | `it-it`       | localized site                     |
| Latvia      | `Latvia`         | `lv-en`       |                                    |
| Luxembourg  | `Luxembourg`     | `lu-en`       |                                    |
| Netherlands | `Netherlands`    | `nl-en`       |                                    |
| Norway      | `Norway`         | `no-en`       |                                    |
| Poland      | `Poland`         | `pl-en`       |                                    |
| Portugal    | `Portugal`       | `pt-pt`       | localized site                     |
| Romania     | `Romania`        | `ro-en`       |                                    |
| Spain       | `España`         | `es-es`       | localized site                     |
| Sweden      | `Sweden`         | `se-en`       |                                    |
| Switzerland | `Switzerland`    | `ch-en`       |                                    |

Localized sites (`jobLanguage: ''`) filter `jobCountry` by the local-language country
name; the English name returns 0 for those countries.

**Tracked countries NOT included:**

- Estonia, Lithuania, Iceland — Accenture has no meaningful presence there.
- Croatia — newly tracked as of the 2026-08 country expansion; not yet added/verified
  for this scraper.

**How to add a new country:** append `{ jobCountry: '<EnglishName>', countrySite: '<locale>' }`
to the `repeatFor.body` array. The `countrySite` value is the locale slug used in Accenture's
job detail URLs (e.g. `fi-en`, `se-en`). Check the Accenture careers site for the correct slug.

> Note: `urlPlaceholders: { '{0}': 'fi-en' }` is a fallback for job URLs that contain a `{0}`
> locale placeholder. It is set to `fi-en` and does not need to match every country — Accenture's
> API returns full URLs per job with the correct locale already substituted.

---

## ABB — `src/lib/ats/company-apis.ts` → `CAREER_URL_ALIASES` → `'careers.abb'`

ABB's Workday instance returns 2000+ global jobs. The career URL stored in `companies.yaml`
(`https://careers.abb/global/en/search-results`) is remapped by `CAREER_URL_ALIASES` to
a Workday URL that pre-filters by country using `locationCountry` facet IDs.

These GUIDs come from Workday's own location reference data and are **shared across
customer tenants** — confirmed live by comparing ABB's and Airbus's facet responses,
which return identical IDs for the same country. That's why the same GUIDs reappear
in the Airbus section below.

**Currently included `locationCountry` facet IDs (24 of 25 tracked countries):**

| Country     | `locationCountry` GUID             |
| ----------- | ---------------------------------- |
| Austria     | `d004c0d1a6c84511ab048669fcdf9fd7` |
| Belgium     | `a04ea128f43a42e59b1e6a19e8f0b374` |
| Bulgaria    | `25f4875dc598484dbeee857eb2d81652` |
| Croatia     | `1face6f426c14de9979a134697da0db3` |
| Czechia     | `fc078443155c4ad294201ecf5a61a499` |
| Denmark     | `49ab063f422741e2aef271de00efeac8` |
| Estonia     | `038b0482bfea403abb61c9bcc3d7eb60` |
| Finland     | `0afb2fa656da42e8bfb6d47bd24a26fa` |
| France      | `54c5b6971ffb4bf0b116fe7651ec789a` |
| Germany     | `dcc5b7608d8644b3a93716604e78e995` |
| Greece      | `566388c1eb974c42bd9e3da4c2f57d60` |
| Hungary     | `9db257f5937e4421b2fac64eec6832f8` |
| Italy       | `8cd04a563fd94da7b06857a79faaf815` |
| Latvia      | `1c026f3b1b8640d8bdfcb95466663e4d` |
| Lithuania   | `8a0328effd25491fb8e6a08801f08e94` |
| Luxembourg  | `328b82f597514643a7683a78fc67c3f1` |
| Netherlands | `9696868b09c64d52a62ee13b052383cc` |
| Norway      | `d07f8ca8625e4345b98a91d0558b872a` |
| Poland      | `131d5ac7e3ee4d7b962bdc96e498e412` |
| Portugal    | `2e8c5034deb045d49315417c347472ca` |
| Romania     | `f2e609fe92974a55a05fc1cdc2852122` |
| Spain       | `bd34c524a6a04ae6915f5d96fa086199` |
| Sweden      | `6a800a4736884df5826858d435650f45` |
| Switzerland | `187134fccb084a0ea9b4b95f23890dbe` |

**Not included:** Iceland — Workday's facet endpoint only returns country values with
at least one current posting, and ABB has zero Iceland postings right now. If ABB ever
opens a role there, it'll be silently dropped until someone re-derives this list (see
below). Greece was in the same situation until 2026-09-15, when a live facet lookup
showed ABB's first Greek posting and its GUID was added.

**How to find a new country's GUID:** POST `https://abb.wd3.myworkdayjobs.com/wday/cxs/abb/External_Career_Page/jobs`
with `{"appliedFacets":{},"limit":1,"offset":0,"searchText":""}` and read
`facets[].values[].values[]` under the `locationCountry` facet parameter — each entry
gives `{id, descriptor, count}` (GUID, country name, live posting count). Append
`&locationCountry=<id>` to the URL in `CAREER_URL_ALIASES`.

---

## Airbus — `scraper/companies.yaml` → `Airbus` entry `url`

Airbus runs on a separate Workday tenant (`ag.wd3.myworkdayjobs.com`) and is configured
directly in `companies.yaml` rather than via `CAREER_URL_ALIASES`, since there's no
friendlier public career URL being remapped — the Workday URL is pasted straight into
the admin scraper and saved. Same `locationCountry` GUID scheme as ABB above (GUIDs are
shared across Workday tenants for the same country).

Unlike ABB, this list is intentionally partial — GUIDs are only added for countries
with at least one confirmed live posting, so a bigger set of tracked countries are
correctly left out because Airbus has no roles there.

**Currently included (14):**

| Country     | `locationCountry` GUID             |
| ----------- | ---------------------------------- |
| Belgium     | `a04ea128f43a42e59b1e6a19e8f0b374` |
| Denmark     | `49ab063f422741e2aef271de00efeac8` |
| Finland     | `0afb2fa656da42e8bfb6d47bd24a26fa` |
| France      | `54c5b6971ffb4bf0b116fe7651ec789a` |
| Germany     | `dcc5b7608d8644b3a93716604e78e995` |
| Hungary     | `9db257f5937e4421b2fac64eec6832f8` |
| Italy       | `8cd04a563fd94da7b06857a79faaf815` |
| Netherlands | `9696868b09c64d52a62ee13b052383cc` |
| Norway      | `d07f8ca8625e4345b98a91d0558b872a` |
| Poland      | `131d5ac7e3ee4d7b962bdc96e498e412` |
| Portugal    | `2e8c5034deb045d49315417c347472ca` |
| Romania     | `f2e609fe92974a55a05fc1cdc2852122` |
| Spain       | `bd34c524a6a04ae6915f5d96fa086199` |
| Sweden      | `6a800a4736884df5826858d435650f45` |

All other tracked countries currently have zero open Airbus postings (verified live via
the same facet endpoint as ABB, `https://ag.wd3.myworkdayjobs.com/wday/cxs/ag/Airbus/jobs`).

**How to add a new country:** same method as ABB — run a live facet lookup, then append
`&locationCountry=<id>` to the `Airbus` entry's `url` in `companies.yaml`.
