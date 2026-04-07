# Hardcoded country filters

Some companies require explicit per-country configuration because their APIs do not
return all countries in a single generic request. When you add a new tracked country
to `src/lib/tracked-countries.ts`, check each section below and update accordingly.

---

## Accenture — `src/lib/ats/company-apis.ts` → `'accenture.com'` → `repeatFor.body`

Accenture's API only accepts one country per request, so the scraper fires a separate
paginated request for each entry in `repeatFor.body` and merges the results.

**Currently tracked countries included:**

| Country     | `jobCountry`  | `countrySite` |
|-------------|---------------|---------------|
| Finland     | `Finland`     | `fi-en`       |
| Sweden      | `Sweden`      | `se-en`       |
| Norway      | `Norway`      | `no-en`       |
| Denmark     | `Denmark`     | `dk-en`       |
| Netherlands | `Netherlands` | `nl-en`       |
| Germany     | `Germany`     | `de-de`       |
| Latvia      | `Latvia`      | `lv-en`       |

**Tracked countries NOT included** (Accenture has no meaningful presence there):
Estonia, Lithuania, Iceland

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

**Currently included `locationCountry` facet IDs:**

| ID                                   | Country (unverified — confirm via scraper output) |
|--------------------------------------|---------------------------------------------------|
| `49ab063f422741e2aef271de00efeac8`   | ?                                                 |
| `dcc5b7608d8644b3a93716604e78e995`   | ?                                                 |
| `6a800a4736884df5826858d435650f45`   | ?                                                 |
| `d07f8ca8625e4345b98a91d0558b872a`   | ?                                                 |
| `9696868b09c64d52a62ee13b052383cc`   | ?                                                 |
| `8a0328effd25491fb8e6a08801f08e94`   | ?                                                 |
| `038b0482bfea403abb61c9bcc3d7eb60`   | ?                                                 |
| `0afb2fa656da42e8bfb6d47bd24a26fa`   | ?                                                 |

**How to find a new country's facet ID:**
1. Go to `https://careers.abb/global/en/search-results`
2. Apply the country filter for the new country in the UI
3. Copy the `locationCountry=<id>` value from the updated URL
4. Append `&locationCountry=<id>` to the URL in `CAREER_URL_ALIASES`

Once you run the scraper and see which countries appear in the results, fill in the
country names in the table above.
