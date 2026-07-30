"""
Rovio — static HTML scraper.

rovio.com/open-positions/ renders all jobs server-side and is accessible
with a standard browser User-Agent via plain HTTP.

HTML structure (one card per job):
  <div class="c-open-po-card">
    <a class="c-open-po-card__title ..." href="/open-positions/{slug}/">Title</a>
    <ul class="c-open-po-card__details grey-medium p--s">
      <li>Category</li>
      <li>Location</li>
      <li>Type</li>
    </ul>
  </div>

Description enrichment: individual job pages are fetched with the same
headers and stored as descriptionHtml for the language classifier.
"""

import re
import sys
from urllib.parse import urljoin

from extract import SKIP_LOCATION_PATTERNS, build_job
from title_language import _title_appears_non_english

_ROVIO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Maps lowercase city name substrings to ISO alpha-2 country codes.
# Substring matching is intentional so "Helsinki Metropolitan Area" matches "helsinki".
_ROVIO_CITY_TO_CC: dict[str, str] = {
    "helsinki": "FI",
    "espoo": "FI",
    "tampere": "FI",
    "turku": "FI",
    "oulu": "FI",
    "stockholm": "SE",
    "gothenburg": "SE",
    "göteborg": "SE",
    "malmö": "SE",
    "oslo": "NO",
    "bergen": "NO",
    "copenhagen": "DK",
    "københavn": "DK",
    "amsterdam": "NL",
    "rotterdam": "NL",
    "berlin": "DE",
    "munich": "DE",
    "münchen": "DE",
    "hamburg": "DE",
    "frankfurt": "DE",
    "tallinn": "EE",
    "riga": "LV",
    "vilnius": "LT",
}

# Splits "Helsinki Metropolitan Area or Barcelona or Stockholm" into parts.
_LOCATION_SPLIT_RE = re.compile(r"\s+or\s+|[/|]", re.IGNORECASE)


def _city_to_cc(city: str) -> str | None:
    """Return the tracked ISO country code for a city string, or None."""
    lower = city.lower()
    for keyword, cc in _ROVIO_CITY_TO_CC.items():
        if keyword in lower:
            return cc
    return None


def scrape_rovio_static(url: str) -> list[dict]:
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("requests/beautifulsoup4 not installed", file=sys.stderr)
        return []

    try:
        resp = requests.get(url, timeout=20, headers=_ROVIO_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"Rovio: HTTP error: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    jobs = extract_rovio_jobs(soup, url)
    print(f"Rovio: extracted {len(jobs)} jobs from listing page", file=sys.stderr)

    _enrich_rovio_descriptions(jobs)
    return jobs


def extract_rovio_jobs(soup, base_url: str) -> list[dict]:
    jobs = []
    for card in soup.find_all(class_="c-open-po-card"):
        title_tag = card.find(class_="c-open-po-card__title")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)
        if not title:
            continue
        href = title_tag.get("href", "")
        job_url = urljoin(base_url, href) if href else None

        # Location is the second <li> in the details list (first is category)
        raw_location = None
        details = card.find(class_="c-open-po-card__details")
        if details:
            items = details.find_all("li")
            if len(items) >= 2:
                loc_text = items[1].get_text(strip=True)
                if loc_text and not SKIP_LOCATION_PATTERNS.match(loc_text):
                    raw_location = loc_text

        if raw_location:
            # Split multi-city strings (e.g. "Helsinki or Barcelona or Stockholm")
            # and fan out one job per tracked country found.
            parts = [
                p.strip() for p in _LOCATION_SPLIT_RE.split(raw_location) if p.strip()
            ]
            seen_cc: set[str] = set()
            cc_city_pairs: list[tuple[str, str]] = []
            for part in parts:
                cc = _city_to_cc(part)
                if cc and cc not in seen_cc:
                    seen_cc.add(cc)
                    cc_city_pairs.append((cc, part))

            if cc_city_pairs:
                for cc, city in cc_city_pairs:
                    job = build_job(title, job_url, city)
                    job["country_code"] = cc
                    jobs.append(job)
            else:
                # No tracked country recognised — emit without country_code;
                # classify.ts will skip it but the raw output stays complete.
                jobs.append(build_job(title, job_url, raw_location))
        else:
            jobs.append(build_job(title, job_url, None))

    return jobs


def _enrich_rovio_descriptions(jobs: list[dict]) -> None:
    """Fetch individual job pages for English-titled jobs and attach descriptionHtml.

    Deduplicates by URL — if a job was fanned out to multiple countries it shares
    one URL, so the page is fetched once and applied to all matching entries.
    """
    try:
        import requests
    except ImportError:
        return

    targets = [
        j
        for j in jobs
        if j.get("url") and not _title_appears_non_english(j.get("title", ""))
    ]
    if not targets:
        return

    # Group by URL so each unique page is fetched only once
    by_url: dict[str, list[dict]] = {}
    for job in targets:
        by_url.setdefault(job["url"], []).append(job)

    unique_urls = list(by_url.keys())
    print(
        f"Rovio: fetching descriptions for {len(unique_urls)} unique job pages ({len(targets)} entries)",
        file=sys.stderr,
    )
    session = requests.Session()
    session.headers.update(_ROVIO_HEADERS)

    for i, url in enumerate(unique_urls):
        try:
            resp = session.get(url, timeout=20)
            resp.raise_for_status()
            html = resp.text
            for job in by_url[url]:
                job["descriptionHtml"] = html
        except Exception as e:
            print(f"Rovio: description fetch failed for {url}: {e}", file=sys.stderr)
        if (i + 1) % 10 == 0:
            print(f"Rovio: enriched {i + 1}/{len(unique_urls)} pages", file=sys.stderr)
