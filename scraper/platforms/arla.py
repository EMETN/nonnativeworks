"""
Arla — static scraper.

jobs.arla.com renders job data inside phApp.ddo, a JS object assigned in a
<script> block. The jobs listing is a nested value of the form:

    {"status":200,"hits":10,"totalHits":N,"data":{"jobs":[...]}}

Note: the script tag content is HTML-entity-encoded in the response
(/*&lt;!--*/ not /*<!--*/), so we match the JSON shape directly instead.

Pagination: ?from=N&s=1 (offset, PAGE_SIZE jobs per page — stop when offset >= totalHits).

Job fields used from the listing JSON:
  title             — display title
  location          — "City, Country, PostalCode" — used for country resolution
  country           — country name in English (fallback)
  city              — city name (fallback)
  jobSeqNo          — unique sequence number used to build the job URL
  category          — department / job family (mapped to jobFunction)
  descriptionTeaser — short (~200 char) plain-text teaser

For English-titled jobs the individual detail page is fetched to get the full
description HTML. The detail page also has a JSON script block; we look for the
description in data.job (detail-page shape) and data.jobs[0] (listing-page shape),
then fall back to BeautifulSoup HTML extraction.
"""

import json
import re
import sys

import requests
from bs4 import BeautifulSoup

from extract import build_job
from title_language import _title_appears_non_english_excluding_cities
from tracked_countries import is_tracked_location

BASE_URL = "https://jobs.arla.com"
LIST_URL = f"{BASE_URL}/gb/en"
PAGE_SIZE = 10
MAX_PAGES = 300

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# The jobs block appears in the page as {"status":200,"hits":N,"totalHits":N,...}
# embedded inside phApp.ddo. We match it directly — no reliance on the
# /*<!--*/ comment marker which is HTML-entity-encoded in the actual response.
_JSON_START_RE = re.compile(
    r'(\{"status"\s*:\s*200\s*,\s*"hits"\s*:\s*\d+\s*,\s*"totalHits")'
)

# Field names (in priority order) where the full description might live in
# the detail-page JSON. Some ATS platforms use 'description', others 'body', etc.
_DESCRIPTION_FIELDS = ("description", "jobDescription", "body", "descriptionHtml")


def _parse_json_block(html: str) -> dict:
    """Return the parsed jobs JSON object {"status":200,"hits":...} from the page, or {}."""
    m = _JSON_START_RE.search(html)
    if not m:
        return {}
    try:
        decoder = json.JSONDecoder()
        data, _ = decoder.raw_decode(html, m.start(1))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _extract_listing_data(html: str) -> tuple[list[dict], int]:
    """Extract (jobs, totalHits) from a listing-page JSON block."""
    data = _parse_json_block(html)
    jobs = data.get("data", {}).get("jobs", [])
    total = data.get("totalHits", 0)
    return jobs, total


def _extract_description(html: str) -> str:
    """
    Extract the full job description from a detail page.

    Strategy (in order):
      1. JSON block → data.job.<field> (detail-page shape)
      2. JSON block → data.jobs[0].<field> (listing-page shape with one result)
      3. BeautifulSoup — first sizeable element whose class hints at a description
    """
    data = _parse_json_block(html)
    inner = data.get("data", {})

    # Shape 1: data.job is a single object
    job_obj = inner.get("job")
    if isinstance(job_obj, dict):
        for field in _DESCRIPTION_FIELDS:
            val = job_obj.get(field, "")
            if val and len(str(val)) > 100:
                return str(val)

    # Shape 2: data.jobs is a list with one element
    jobs_list = inner.get("jobs", [])
    if jobs_list and isinstance(jobs_list[0], dict):
        for field in _DESCRIPTION_FIELDS:
            val = jobs_list[0].get(field, "")
            if val and len(str(val)) > 100:
                return str(val)

    # Fallback: scrape HTML — look for the main description container
    soup = BeautifulSoup(html, "html.parser")
    for el in soup.find_all(["div", "section", "article"]):
        cls = " ".join(el.get("class") or []).lower()
        if any(
            kw in cls
            for kw in ("description", "job-detail", "job-content", "jobdetail")
        ):
            text = el.get_text(strip=True)
            if len(text) > 100:
                return str(el)

    return ""


def _fetch_page(session: requests.Session, offset: int) -> tuple[list[dict], int]:
    params: dict = {"from": offset, "s": "1"}
    try:
        resp = session.get(LIST_URL, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"arla: fetch error (offset={offset}): {e}", file=sys.stderr)
        return [], 0
    return _extract_listing_data(resp.text)


def _fetch_description_for_url(session: requests.Session, job_url: str) -> str:
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        return _extract_description(resp.text)
    except Exception as e:
        print(f"arla: description fetch error ({job_url}): {e}", file=sys.stderr)
        return ""


def scrape_arla_static(url: str) -> list[dict]:
    session = requests.Session()

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    raw_jobs: list[dict] = []
    total = 0

    for page_num in range(MAX_PAGES):
        offset = page_num * PAGE_SIZE
        page_jobs, page_total = _fetch_page(session, offset)
        if page_num == 0:
            total = page_total
        print(
            f"arla: offset={offset} → {len(page_jobs)} jobs (total: {total})",
            file=sys.stderr,
        )
        if not page_jobs:
            break
        raw_jobs.extend(page_jobs)
        if offset + PAGE_SIZE >= total:
            break

    print(f"arla: collected {len(raw_jobs)} raw jobs", file=sys.stderr)

    # ── Phase 2: build RawJob entries ─────────────────────────────────────────
    result: list[dict] = []
    for raw in raw_jobs:
        title = raw.get("title", "")
        if not title:
            continue

        # Arla appends " - CityName" (or " – CityName") to many titles.
        # Strip it here since the city is already captured in job["city"],
        # otherwise non-ASCII city names (e.g. "Düsseldorf") trigger the
        # Phase 1a non-ASCII classifier on an otherwise English title.
        for _sep in (" - ", " – "):
            _idx = title.rfind(_sep)
            if _idx != -1:
                title = title[:_idx]
                break

        location = (
            raw.get("location") or f"{raw.get('city', '')}, {raw.get('country', '')}"
        ).strip(", ")

        seq_no = raw.get("jobSeqNo", "")
        job_url = f"{LIST_URL}/job/{seq_no}" if seq_no else LIST_URL

        job = build_job(title, job_url, location)

        # Pass the clean city name directly — the location string
        # ("City, Country, PostalCode") is only used for country resolution,
        # and small cities won't be in the TypeScript CITY_MAP.
        city = raw.get("city", "").strip()
        if city:
            job["city"] = city

        category = raw.get("category", "")
        if category:
            job["jobFunction"] = category

        teaser = raw.get("descriptionTeaser", "")
        if teaser:
            job["descriptionText"] = teaser

        result.append(job)

    # ── Phase 3: enrich English-titled jobs with full description HTML ────────
    # Non-English titles are already caught by Phase 1a of the classifier.
    # For English-titled jobs the teaser alone may be English with no language
    # signals — fetch the detail page to find requirement/advantage phrases.
    # Only enrich jobs in tracked countries — fetching descriptions for jobs in
    # Canada, UK, Poland, etc. wastes time and can cause timeouts on GitHub Actions.
    english_jobs = [
        j
        for j in result
        if not _title_appears_non_english_excluding_cities(j.get("title", ""))
        and is_tracked_location(j.get("location"))
    ]
    unique_urls = list(dict.fromkeys(j["url"] for j in english_jobs if j.get("url")))

    print(
        f"arla: fetching descriptions for {len(unique_urls)} unique English-titled tracked-country jobs",
        file=sys.stderr,
    )

    desc_cache: dict[str, str] = {}
    for i, job_url in enumerate(unique_urls):
        desc_cache[job_url] = _fetch_description_for_url(session, job_url)
        if (i + 1) % 10 == 0:
            print(f"arla: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        desc_html = desc_cache.get(job.get("url", ""), "")
        if desc_html:
            job["descriptionHtml"] = desc_html
            # Drop the short teaser so the TS layer uses stripHtml(descriptionHtml)
            # for plainText — the teaser is too brief to catch education/skills signals.
            job.pop("descriptionText", None)

    print(f"arla: done — {len(result)} total jobs", file=sys.stderr)
    return result
