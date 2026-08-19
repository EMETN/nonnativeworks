"""
Aiven — static scraper.

aiven.io/careers/job server-renders every open position on a single page —
no "Load more"/offset pagination (confirmed against /sitemap.xml: exactly as
many /careers/job/{id} URLs as job cards on the listing page). Two things
live in that one page, both needed:

  1. A <script type="application/ld+json"> ItemList of schema.org JobPosting
     objects — title, full description HTML, and location, but no per-job
     URL or ID.
  2. The job-card <a href="/careers/job/{id}"> links themselves, which don't
     duplicate the title/location/description already captured above.

Both are in the same document order (JSON-LD "position" 0..N matches the
card order), so they're zipped by index to attach a URL to each JobPosting.
Descriptions are already full HTML, so — unlike most other platform
scrapers here — no per-job detail-page fetch is needed at all.
"""

import json
import re
import sys

import requests
from bs4 import BeautifulSoup

from extract import build_job

LIST_URL = "https://aiven.io/careers/job"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

_JOB_HREF_RE = re.compile(r"^/careers/job/(\d+)$")


def _extract_job_postings(html: bytes) -> list[dict]:
    """Return schema.org JobPosting items from the page's ItemList JSON-LD block, in order."""
    soup = BeautifulSoup(html, "html.parser")
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, dict) and data.get("@type") == "ItemList":
            items = data.get("itemListElement", [])
            items.sort(key=lambda li: li.get("position", 0))
            return [
                li["item"]
                for li in items
                if isinstance(li.get("item"), dict)
                and li["item"].get("@type") == "JobPosting"
            ]
    return []


def _extract_job_ids(html: bytes) -> list[str]:
    """Return job IDs from /careers/job/{id} card links, in document order."""
    soup = BeautifulSoup(html, "html.parser")
    ids: list[str] = []
    for a in soup.find_all("a", href=_JOB_HREF_RE):
        m = _JOB_HREF_RE.match(a["href"])
        if m:
            ids.append(m.group(1))
    return ids


def scrape_aiven_static(url: str) -> list[dict]:
    try:
        resp = requests.get(LIST_URL, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"aiven: fetch error: {e}", file=sys.stderr)
        return []

    # Pass raw bytes, not resp.text — the server sends "content-type: text/html"
    # with no charset, so requests falls back to guessing ISO-8859-1 for resp.text
    # and mangles UTF-8 apostrophes/dashes ("Weâre"). BeautifulSoup detects the
    # actual encoding from the bytes correctly.
    html = resp.content
    postings = _extract_job_postings(html)
    job_ids = _extract_job_ids(html)

    if len(postings) != len(job_ids):
        print(
            f"aiven: JSON-LD postings ({len(postings)}) and card links "
            f"({len(job_ids)}) count mismatch — URLs may misalign",
            file=sys.stderr,
        )

    result: list[dict] = []
    for i, item in enumerate(postings):
        title = item.get("title", "")
        if not title:
            continue

        locations = item.get("jobLocation") or []
        location = ", ".join(
            locality
            for loc in locations
            if (locality := loc.get("address", {}).get("addressLocality"))
        )

        job_id = job_ids[i] if i < len(job_ids) else None
        job_url = f"{LIST_URL}/{job_id}" if job_id else LIST_URL

        job = build_job(title, job_url, location)

        description = item.get("description", "")
        if description:
            job["descriptionHtml"] = description

        result.append(job)

    print(f"aiven: collected {len(result)} jobs", file=sys.stderr)
    return result
