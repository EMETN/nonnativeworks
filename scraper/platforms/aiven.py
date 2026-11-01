"""
Aiven — static scraper.

Aiven's Greenhouse board isn't public (boards-api returns 404), so jobs come
from the listing page's cards.
"""

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

_JOB_HREF_RE = re.compile(r"^https://careers\.aiven\.io/openings/\d+$")


def _extract_jobs(html: bytes) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    jobs: list[dict] = []
    for card in soup.find_all("a", href=_JOB_HREF_RE):
        fields = [p.get_text(strip=True) for p in card.find_all("p")]
        if not fields or not fields[0]:
            continue
        location = fields[1] if len(fields) > 1 else None
        jobs.append(build_job(fields[0], card["href"], location))
    return jobs


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
    result = _extract_jobs(resp.content)
    print(f"aiven: collected {len(result)} jobs", file=sys.stderr)
    return result
