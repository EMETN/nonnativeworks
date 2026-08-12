"""
Academic Work — static HTML scraper.

Covers every Academic Work country career site (same underlying
platform/template, one entry per domain in SITES below). Scraping any single
academicwork.* URL fans out to ALL configured sites in one run (see
scrape_academicwork_static) — a single admin action reviews/uploads every
country at once. Scrapes ALL jobs (local-language and English) from each
country's local-language listing so that the ratio of English-friendly vs.
total positions is calculated correctly — this holds even for sites that are
almost entirely local-language, since every job is still counted even when
its description is never fetched.

Listing URL:  {base_url}{list_path}
Pagination:   ?i=0, ?i=1, ?i=2, ... — stop when page returns 0 jobs.
~10 jobs per page.

Card structure (div.grid.auto-rows-min contains 2 <a> tags to the same job):
  texts[0]      — job title (often includes company/city suffix after a comma)
  texts[1..fi-1]— company name (omitted for some staffing placements)
  texts[fi-1]   — location: city name(s), region, or local-language location phrase
  texts[fi]     — employment type: "Full time" / locale equivalent / "Part time" / …
  texts[fi+1]   — assignment type: "Recruitment" / locale equivalent / …
  texts[fi+2]   — recency: "3 hours ago" / locale equivalent

where fi = index of the first employment-type token.

Each job is stamped with its site's country_code explicitly rather than
relying on location-text parsing to resolve the country — local-language
location phrases (regions, idioms) don't always resolve via the general
lookup, and the country is already known from which domain was scraped.

Description: descriptions are only fetched for jobs whose title looks
English (title_language). On sites with a working /en/jobs/j/…?lang=en
translation (FI, DK — see has_english_url in SITES), that URL is used
instead of the local one to avoid local-site boilerplate (nav/footer) that
would produce false-positive native-language signals in the classifier. On
sites without one (SE, NO, DE, CH — confirmed 404), the description is
fetched from the local-language job URL directly, since English-titled
postings on those sites are already written in English at that URL.
Non-English-titled jobs are skipped entirely — the title detector already
flags them as requiring the local language, so no description fetch is
needed just to get an accurate count.

Every job page (regardless of site) also carries two site-chrome blocks
that stripHtml's nav/footer removal doesn't catch — a "become a
consultant" promo card and a "related/similar jobs" list — both always
rendered in the SITE's local language, independent of the job posting's
own language. Left in, this made English-described SE/NO/DE/CH postings
misclassify as requiring the local language, since the classifier saw far
more local-language boilerplate text than actual English job content. See
_strip_chrome, applied to every fetched description page.
"""

import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job
from title_language import _title_appears_non_english_excluding_cities

MAX_PAGES = 50

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# One entry per Academic Work country site, keyed by the domain substring
# detect_platform() matches on. `list_path` is also the prefix of job detail
# URLs: {base_url}{list_path}/j/{slug}/{id}. `employment_types` are the
# locale words used to locate the location field on a card (see
# _extract_location) — English tokens are included everywhere since a few
# jobs on any given site can still carry English employment-type labels.
SITES: dict[str, dict] = {
    "academicwork.fi": {
        "base_url": "https://www.academicwork.fi",
        "list_path": "/avoimet-tyopaikat",
        "country_code": "FI",
        # FI and DK are confirmed to have a working /en/jobs/j/…?lang=en
        # translation of each job page (academicwork.dk too — see below). SE,
        # NO, DE, CH all confirmed 404 there — their local-language job URL
        # already contains the description as originally written (English or
        # local), so it's fetched as-is for them (see has_english_url below
        # and _description_url).
        "has_english_url": True,
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "kokoaikainen",
            "osa-aikainen",
            "määräaikainen",
        },
    },
    "academicwork.se": {
        "base_url": "https://www.academicwork.se",
        "list_path": "/lediga-jobb",
        "country_code": "SE",
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "heltid",
            "deltid",
        },
    },
    "academicwork.no": {
        "base_url": "https://www.academicwork.no",
        "list_path": "/ledige-stillinger",
        "country_code": "NO",
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "heltid",
            "deltid",
        },
    },
    "academicwork.dk": {
        "base_url": "https://www.academicwork.dk",
        "list_path": "/ledige-stillinger",
        "country_code": "DK",
        # Confirmed working: academicwork.dk/en/jobs/j/{slug}/{id}?lang=en
        "has_english_url": True,
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "fuldtid",
            "deltid",
        },
    },
    "academicwork.de": {
        "base_url": "https://www.academicwork.de",
        "list_path": "/offene-stellenangebote",
        "country_code": "DE",
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "vollzeit",
            "teilzeit",
        },
    },
    # Swiss site mixes French (Geneva/Romandy) and German (Zurich) listings,
    # so employment-type tokens cover both locales plus English.
    "academicwork.ch": {
        "base_url": "https://www.academicwork.ch",
        "list_path": "/offres-emploi",
        "country_code": "CH",
        "employment_types": {
            "full time",
            "part time",
            "temporary",
            "contract",
            "vollzeit",
            "teilzeit",
            "temps plein",
            "temps partiel",
        },
    },
}

# Link path segment that identifies job detail pages, relative to each
# site's list_path (job detail URLs are {list_path}/j/{slug}/{id}).
_JOB_SEGMENT = "/j/"


def site_for_url(url: str) -> dict | None:
    """Return the SITES config matching this URL's domain, or None."""
    for domain, site in SITES.items():
        if domain in url:
            return site
    return None


def _fetch_page(session: requests.Session, site: dict, page: int) -> list[dict]:
    try:
        resp = session.get(
            f"{site['base_url']}{site['list_path']}",
            params={"i": page},
            timeout=20,
            headers=_HEADERS,
        )
        resp.raise_for_status()
    except Exception as e:
        print(
            f"academicwork [{site['country_code']}]: page i={page} fetch error: {e}",
            file=sys.stderr,
        )
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    return _extract_cards(soup, site)


def _extract_cards(soup, site: dict) -> list[dict]:
    jobs = []
    seen_urls: set[str] = set()
    job_path = site["list_path"] + _JOB_SEGMENT

    for div in soup.find_all("div"):
        classes = " ".join(div.get("class", []))
        if "grid" not in classes or "auto-rows-min" not in classes:
            continue

        # Each job card contains exactly two <a> tags pointing to the same job URL
        job_links = [a for a in div.find_all("a", href=True) if job_path in a["href"]]
        if len(job_links) != 2:
            continue

        href = job_links[0]["href"]
        job_url = urljoin(site["base_url"], href)

        url_key = job_url.split("?")[0]
        if url_key in seen_urls:
            continue
        seen_urls.add(url_key)

        texts = [t.strip() for t in div.stripped_strings if t.strip()]
        if not texts:
            continue

        title = texts[0]
        # Academic Work appends ", CompanyName, City" to titles. Pass the stripped
        # version as classifierTitle so the classifier doesn't trigger on local
        # company names (e.g. "Wärtsilä"), while the full title is stored in the DB.
        classifier_title = title.split(",")[0].strip()
        location = _extract_location(texts, site["employment_types"])
        job = build_job(title, job_url, location)
        job["country_code"] = site["country_code"]
        if classifier_title != title:
            job["classifierTitle"] = classifier_title
        jobs.append(job)

    return jobs


def _extract_location(texts: list[str], employment_types: set[str]) -> str | None:
    """Return the location string from a card's text list.

    The location is the text immediately before the employment-type token
    ("Full time", "Heltid", etc.). Requires at least title + location
    before the token (index >= 2).
    """
    for i, text in enumerate(texts):
        if text.lower() in employment_types and i >= 2:
            return texts[i - 1]
    return None


def _description_url(url: str, site: dict) -> str:
    """Return the URL to fetch a job's description from.

    On sites with has_english_url (currently only FI), converts the
    local-language listing job URL to its English equivalent:
    {base_url}{list_path}/j/{slug}/{id} → {base_url}/en/jobs/j/{slug}/{id}?lang=en
    — this avoids local-site boilerplate (nav/footer) that would otherwise
    produce false-positive native-language signals in the classifier.

    Other sites have no such translated URL (confirmed 404 on academicwork.se)
    — their local job URL already holds the description as originally written,
    English or not, so it's fetched as-is.
    """
    if not site.get("has_english_url"):
        return url
    url = url.replace(f"{site['list_path']}/j/", "/en/jobs/j/")
    if "lang=" not in url:
        url += ("&" if "?" in url else "?") + "lang=en"
    return url


# The full HTML page is stored as descriptionHtml (see _fetch_description below),
# not just an isolated description container — but every job page also carries
# two site-chrome blocks styled with this exact Tailwind container-query class:
# a "become a consultant" promo card and a "related/similar jobs" list. Both are
# always rendered in the SITE's local language regardless of the job posting's
# own language (confirmed on academicwork.se and academicwork.ch — an
# English-titled, English-described job still gets a Swedish/French promo card
# and a related-jobs list mixing in other local-language job titles appended
# after the real description). Left in, this local-language boilerplate
# dominates the classifier's tinyld/keyword language signals and makes
# English-friendly SE/NO/DE/CH postings look like they require the local
# language. Stripped here rather than in the TS classifier since it's a
# structural/template artifact specific to this platform, not a generic
# nav/footer pattern.
_CHROME_DIV_CLASS = "@container"


def _strip_chrome(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for div in soup.find_all("div", class_=_CHROME_DIV_CLASS):
        div.decompose()
    return str(soup)


def _fetch_description(session: requests.Session, job_url: str) -> str:
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        return _strip_chrome(resp.text)
    except Exception as e:
        print(
            f"academicwork: description fetch error ({job_url}): {e}", file=sys.stderr
        )
        return ""


def _scrape_site(session: requests.Session, site: dict) -> list[dict]:
    country = site["country_code"]

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    all_jobs: list[dict] = []
    seen_urls: set[str] = set()

    for page in range(MAX_PAGES):
        page_jobs = _fetch_page(session, site, page)
        print(
            f"academicwork [{country}]: i={page} → {len(page_jobs)} jobs",
            file=sys.stderr,
        )
        if not page_jobs:
            break

        # Deduplicate across pages (same job can appear on multiple pages)
        new_jobs = [
            j for j in page_jobs if j.get("url", "").split("?")[0] not in seen_urls
        ]
        for j in new_jobs:
            seen_urls.add(j.get("url", "").split("?")[0])
        all_jobs.extend(new_jobs)

    print(
        f"academicwork [{country}]: collected {len(all_jobs)} jobs total",
        file=sys.stderr,
    )

    # ── Phase 2: description enrichment ──────────────────────────────────────
    # Only fetch descriptions for English-titled jobs — non-English titles are
    # already classified as requiring native language by the title detector.
    # Descriptions are fetched from the English URL (/en/jobs/j/…?lang=en) so
    # the classifier sees English page content without local-site boilerplate.
    # The job slug and ID are identical between the local-language and English
    # URL paths.
    english_jobs = [
        j
        for j in all_jobs
        if not _title_appears_non_english_excluding_cities(
            j.get("classifierTitle") or j.get("title", "")
        )
    ]
    unique_urls = list(
        dict.fromkeys(
            _description_url(j["url"], site) for j in english_jobs if j.get("url")
        )
    )
    print(
        f"academicwork [{country}]: fetching descriptions for {len(unique_urls)} English-titled jobs",
        file=sys.stderr,
    )

    desc_cache: dict[str, str] = {}
    for i, job_url in enumerate(unique_urls):
        desc_cache[job_url] = _fetch_description(session, job_url)
        if (i + 1) % 10 == 0:
            print(
                f"academicwork [{country}]: enriched {i + 1}/{len(unique_urls)}",
                file=sys.stderr,
            )

    for job in english_jobs:
        html = desc_cache.get(_description_url(job.get("url", ""), site), "")
        if html:
            job["descriptionHtml"] = html

    print(
        f"academicwork [{country}]: done — {len(all_jobs)} total jobs", file=sys.stderr
    )
    return all_jobs


def scrape_academicwork_static(url: str) -> list[dict]:
    """Scrape every Academic Work country site in one pass.

    Pasting any single academicwork.* URL into the admin scraper triggers a
    fan-out across all configured SITES, not just the one that was pasted —
    this way one action reviews/uploads every country at once instead of
    requiring six separate manual scrapes. Each job is already stamped with
    its own site's country_code, so downstream grouping (buildScrapeResult)
    splits them back into one entry per country automatically.
    """
    if site_for_url(url) is None:
        raise ValueError(f"academicwork: no site config matches URL: {url}")

    session = requests.Session()
    all_jobs: list[dict] = []
    for domain, site in SITES.items():
        print(f"academicwork: scraping {domain} …", file=sys.stderr)
        try:
            all_jobs.extend(_scrape_site(session, site))
        except Exception as e:
            print(
                f"academicwork [{site['country_code']}]: site failed: {e}",
                file=sys.stderr,
            )

    print(
        f"academicwork: done — {len(all_jobs)} jobs across {len(SITES)} sites",
        file=sys.stderr,
    )
    return all_jobs
