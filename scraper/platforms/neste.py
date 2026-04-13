"""
Neste — static scraper.

jobs.neste.com uses a plain HTML table with 25 rows per page.
Pagination: ?startrow=0, ?startrow=25, ?startrow=50, ...
Stop when a page returns fewer than 25 rows.

Individual job pages expose a description inside .jobdescription,
fetched for English-titled jobs only.
"""

import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job
from title_language import _title_appears_non_english

BASE_URL = "https://jobs.neste.com"
LIST_URL = f"{BASE_URL}/search"
PAGE_SIZE = 25
MAX_PAGES = 100

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def _fetch_listing_page(session: requests.Session, startrow: int) -> list[dict]:
    params: dict = {"sortColumn": "referencedate", "sortDirection": "desc", "startrow": startrow}
    try:
        resp = session.get(LIST_URL, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"neste: page startrow={startrow} fetch error: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    jobs = []
    for row in soup.find_all("tr", class_="data-row"):
        title_tag = row.find("a", class_="jobTitle-link")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        href = title_tag.get("href", "")
        job_url = urljoin(BASE_URL, href) if href else None

        loc_tag = row.find("td", class_="colLocation")
        if not loc_tag:
            loc_tag = row.find("span", class_="jobLocation")
        location = loc_tag.get_text(strip=True) if loc_tag else None

        if title:
            jobs.append(build_job(title, job_url, location))

    return jobs


def _fetch_description(session: requests.Session, job_url: str) -> str:
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")
        desc = soup.find(class_="jobdescription")
        return str(desc) if desc else ""
    except Exception as e:
        print(f"neste: description fetch error ({job_url}): {e}", file=sys.stderr)
        return ""


def scrape_neste_static(url: str) -> list[dict]:
    session = requests.Session()

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    all_jobs: list[dict] = []
    for page in range(MAX_PAGES):
        startrow = page * PAGE_SIZE
        page_jobs = _fetch_listing_page(session, startrow)
        print(f"neste: startrow={startrow} → {len(page_jobs)} jobs", file=sys.stderr)
        all_jobs.extend(page_jobs)
        if len(page_jobs) < PAGE_SIZE:
            break

    print(f"neste: collected {len(all_jobs)} jobs", file=sys.stderr)

    # ── Phase 2: description enrichment for English-titled jobs ──────────────
    english_jobs = [j for j in all_jobs if not _title_appears_non_english(j.get("title", ""))]

    unique_urls = list(dict.fromkeys(j["url"] for j in english_jobs if j.get("url")))
    print(f"neste: fetching descriptions for {len(unique_urls)} unique English-titled jobs", file=sys.stderr)

    desc_cache: dict[str, str] = {}
    for i, job_url in enumerate(unique_urls):
        desc_cache[job_url] = _fetch_description(session, job_url)
        if (i + 1) % 10 == 0:
            print(f"neste: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        desc_html = desc_cache.get(job.get("url", ""), "")
        if desc_html:
            job["descriptionHtml"] = desc_html

    print(f"neste: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
