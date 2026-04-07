"""
Zalando — static scraper.

jobs.zalando.com is a Next.js app that embeds all job data via RSC (React
Server Components) streaming. The HTML contains inline <script> blocks of the
form:

    self.__next_f.push([1,"<N>:<escaped-json>"])

Each chunk string is decoded and parsed as JSON. The jobs listing chunk has the
shape {"data": [{title, id, offices, ...}, ...]}. Individual job pages expose
a description inside <article>...</article>, fetched for English-titled jobs.

Pagination: ?page=N (stops when an empty data array is returned).
"""

import json
import re
import sys

import requests
from bs4 import BeautifulSoup

from extract import build_job
from title_language import _title_appears_non_english

BASE_URL = "https://jobs.zalando.com"
JOBS_LIST_URL = f"{BASE_URL}/en/jobs"
MAX_PAGES = 100

# Maps Zalando office city names to ISO alpha-2 country codes.
# Only cities that Zalando actually uses are listed.
ZALANDO_CITY_TO_CC: dict[str, str] = {
    "Berlin": "DE",
    "Dortmund": "DE",
    "Hamburg": "DE",
    "Munich": "DE",
    "Hanover": "DE",
    "Frankfurt": "DE",
    "Stuttgart": "DE",
    "Mönchengladbach": "DE",
    "Moenchengladbach": "DE",
    "Giessen": "DE",
    "Lahr": "DE",
    "Cologne": "DE",
    "Dusseldorf": "DE",
    "Ludwigsfelde": "DE",
    "Freiburg im Breisgau": "DE",
    "Munster": "DE",
    "Ansbach": "DE",
    "Helsinki": "FI",
    "Stockholm": "SE",
    "Amsterdam": "NL",
    "Bleiswijk": "NL",
    "Copenhagen": "DK",
    "Oslo": "NO",
    "Dublin": "IE",
    "Paris": "FR",
    "Warsaw": "PL",
    "Łódź": "PL",
    "Lodz": "PL",
    "Milan": "IT",
    "Lisbon": "PT",
    "Zagreb": "HR",
    "Zurich": "CH",
    "Vienna": "AT",
    "Brussels": "BE",
    "Prague": "CZ",
    "Budapest": "HU",
    "Tallinn": "EE",
    "Riga": "LV",
    "Vilnius": "LT",
}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Matches self.__next_f.push([1,"<escaped-string>"]) — the capture group holds
# the raw escaped string content (not yet unescaped).
_PUSH_RE = re.compile(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)')


def _parse_next_f_jobs(html: str) -> list[dict]:
    """
    Scan all RSC push chunks in the page HTML and return the jobs data array.

    Each chunk string looks like "<id>:<json>". We look for the chunk whose
    decoded JSON has a "data" list where each element has "title" and "id".
    """
    for m in _PUSH_RE.finditer(html):
        # Wrap in quotes so json.loads handles all escape sequences correctly
        try:
            chunk_str: str = json.loads(f'"{m.group(1)}"')
        except json.JSONDecodeError:
            continue

        colon_idx = chunk_str.find(":")
        if colon_idx == -1:
            continue

        try:
            chunk_data = json.loads(chunk_str[colon_idx + 1 :])
        except json.JSONDecodeError:
            continue

        if not isinstance(chunk_data, dict):
            continue

        data = chunk_data.get("data")
        if not isinstance(data, list) or not data:
            continue
        if not (isinstance(data[0], dict) and "title" in data[0] and "id" in data[0]):
            continue

        return data

    return []


def _fetch_listing_page(session: requests.Session, page: int) -> list[dict]:
    url = JOBS_LIST_URL if page == 1 else f"{JOBS_LIST_URL}?page={page}"
    try:
        resp = session.get(url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"zalando: page {page} fetch error: {e}", file=sys.stderr)
        return []
    return _parse_next_f_jobs(resp.text)


def _fetch_detail(session: requests.Session, job_id: str) -> tuple[str, str]:
    """
    Fetch a job detail page and return (description_html, job_category).

    description_html — inner HTML of the <article> element, or empty string.
    job_category     — text of the "Job Category" <dd>, or empty string.
                       e.g. "Software Engineering - Full Stack"
    """
    url = f"{BASE_URL}/en/jobs/{job_id}"
    try:
        resp = session.get(url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")

        article = soup.find("article")
        desc_html = str(article) if article else ""

        job_category = ""
        dt = soup.find("dt", string=lambda t: t and t.strip() == "Job Category")
        if dt:
            dd = dt.find_next_sibling("dd")
            if dd:
                job_category = dd.get_text(strip=True)

        return desc_html, job_category
    except Exception as e:
        print(f"zalando: detail fetch error ({job_id}): {e}", file=sys.stderr)
        return "", ""


def scrape_zalando_static(url: str) -> list[dict]:
    """
    Scrape all Zalando job listings.

    Phase 1 — collect raw job records from paginated listing.
    Phase 2 — fan-out one RawJob entry per distinct tracked country found in
               the job's offices list (mirrors the Rovio multi-city pattern).
    Phase 3 — enrich English-titled jobs with <article> HTML from detail pages.
    """
    session = requests.Session()

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    raw_jobs: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        page_jobs = _fetch_listing_page(session, page)
        print(f"zalando: page {page} → {len(page_jobs)} jobs", file=sys.stderr)
        if not page_jobs:
            break
        raw_jobs.extend(page_jobs)

    print(f"zalando: collected {len(raw_jobs)} raw jobs", file=sys.stderr)

    # ── Phase 2: expand to per-country RawJob entries ─────────────────────────
    jobs: list[dict] = []
    seen: set[tuple[str, str]] = set()  # (job_id, country_code)

    for raw in raw_jobs:
        job_id = str(raw.get("id", ""))
        title = raw.get("title", "")
        offices: list[str] = raw.get("offices") or []
        job_url = f"{BASE_URL}/en/jobs/{job_id}" if job_id else ""

        # Collect distinct country codes from office list, preserving order
        country_codes: list[str] = []
        for office in offices:
            cc = ZALANDO_CITY_TO_CC.get(office)
            if cc and cc not in country_codes:
                country_codes.append(cc)

        if not country_codes:
            # Unknown city — include once without a country_code
            key = (job_id, "")
            if key not in seen:
                seen.add(key)
                location = offices[0] if offices else ""
                jobs.append(build_job(title, job_url, location))
            continue

        for cc in country_codes:
            key = (job_id, cc)
            if key in seen:
                continue
            seen.add(key)
            city = next(
                (o for o in offices if ZALANDO_CITY_TO_CC.get(o) == cc),
                offices[0],
            )
            job = build_job(title, job_url, city)
            job["country_code"] = cc
            jobs.append(job)

    print(f"zalando: expanded to {len(jobs)} per-country entries", file=sys.stderr)

    # ── Phase 3: description enrichment for English-titled jobs ───────────────
    english_jobs = [j for j in jobs if not _title_appears_non_english(j.get("title", ""))]

    # Fetch each unique URL once; apply the result to all fan-out duplicates
    unique_urls: list[str] = []
    seen_urls: set[str] = set()
    for job in english_jobs:
        u = job.get("url", "")
        if u and u not in seen_urls:
            seen_urls.add(u)
            unique_urls.append(u)

    print(
        f"zalando: fetching descriptions for {len(unique_urls)} unique English-titled jobs",
        file=sys.stderr,
    )

    # Cache: url → (desc_html, job_category)
    detail_cache: dict[str, tuple[str, str]] = {}
    for i, job_url in enumerate(unique_urls):
        job_id = job_url.rstrip("/").split("/")[-1]
        desc_html, job_category = _fetch_detail(session, job_id)
        detail_cache[job_url] = (desc_html, job_category)
        if (i + 1) % 10 == 0:
            print(f"zalando: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        desc_html, job_category = detail_cache.get(job.get("url", ""), ("", ""))
        if desc_html:
            job["descriptionHtml"] = desc_html
        if job_category:
            job["jobFunction"] = job_category

    print(f"zalando: done — {len(jobs)} total jobs", file=sys.stderr)
    return jobs
