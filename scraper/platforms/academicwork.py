"""
Academic Work — static HTML scraper.

Scrapes ALL jobs (Finnish and English) from the Finnish-language listing so
that the ratio of English-friendly vs. total positions is calculated correctly.

Listing URL:  https://www.academicwork.fi/avoimet-tyopaikat
Pagination:   ?i=0, ?i=1, ?i=2, ... — stop when page returns 0 jobs.
~10 jobs per page.

Card structure (div.grid.auto-rows-min contains 2 <a> tags to the same job):
  texts[0]      — job title (often includes company/city suffix after a comma)
  texts[1..fi-1]— company name (omitted for some staffing placements)
  texts[fi-1]   — location: city name(s), region, or Finnish location phrase
  texts[fi]     — employment type: "Full time" / "Kokoaikainen" / "Osa-aikainen" / …
  texts[fi+1]   — assignment type: "Recruitment" / "Vuokratoimeksianto" / …
  texts[fi+2]   — recency: "3 hours ago" / "3 tuntia sitten"

where fi = index of the first employment-type token.

All jobs are from the Finnish site, so country-lookup falls back to FI for
unrecognised location strings (regions, Finnish phrases like "Pääkaupunkiseutu").

Description: descriptions are fetched from the English URL equivalent
(/en/jobs/j/…?lang=en) to avoid Finnish site boilerplate (nav/footer)
that would produce false-positive native-language signals in the classifier.
Finnish-titled jobs are skipped — the title detector already flags them.
"""

import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job
from title_language import _title_appears_non_english

BASE_URL = "https://www.academicwork.fi"
LIST_PATH = "/avoimet-tyopaikat"
MAX_PAGES = 50

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Employment-type tokens in both English and Finnish
_EMPLOYMENT_TYPES = {
    "full time", "part time", "temporary", "contract",   # English
    "kokoaikainen", "osa-aikainen", "määräaikainen",     # Finnish
}

# Link path segment that identifies job detail pages on this site
_JOB_PATH = "/avoimet-tyopaikat/j/"


def _fetch_page(session: requests.Session, page: int) -> list[dict]:
    try:
        resp = session.get(
            f"{BASE_URL}{LIST_PATH}",
            params={"i": page},
            timeout=20,
            headers=_HEADERS,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"academicwork: page i={page} fetch error: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    return _extract_cards(soup)


def _extract_cards(soup) -> list[dict]:
    jobs = []
    seen_urls: set[str] = set()

    for div in soup.find_all("div"):
        classes = " ".join(div.get("class", []))
        if "grid" not in classes or "auto-rows-min" not in classes:
            continue

        # Each job card contains exactly two <a> tags pointing to the same job URL
        job_links = [a for a in div.find_all("a", href=True) if _JOB_PATH in a["href"]]
        if len(job_links) != 2:
            continue

        href = job_links[0]["href"]
        job_url = urljoin(BASE_URL, href)

        url_key = job_url.split("?")[0]
        if url_key in seen_urls:
            continue
        seen_urls.add(url_key)

        texts = [t.strip() for t in div.stripped_strings if t.strip()]
        if not texts:
            continue

        title = texts[0]
        # Academic Work appends ", CompanyName, City" to titles. Pass the stripped
        # version as classifierTitle so the classifier doesn't trigger on Finnish
        # company names (e.g. "Wärtsilä"), while the full title is stored in the DB.
        classifier_title = title.split(",")[0].strip()
        location = _extract_location(texts)
        job = build_job(title, job_url, location)
        if classifier_title != title:
            job["classifierTitle"] = classifier_title
        jobs.append(job)

    return jobs


def _extract_location(texts: list[str]) -> str | None:
    """Return the location string from a card's text list.

    The location is the text immediately before the employment-type token
    ("Full time", "Kokoaikainen", etc.). Requires at least title + location
    before the token (index >= 2).
    """
    for i, text in enumerate(texts):
        if text.lower() in _EMPLOYMENT_TYPES and i >= 2:
            return texts[i - 1]
    return None


def _to_english_url(url: str) -> str:
    """Convert a Finnish listing job URL to its English equivalent.

    https://www.academicwork.fi/avoimet-tyopaikat/j/{slug}/{id}
      → https://www.academicwork.fi/en/jobs/j/{slug}/{id}?lang=en

    The English page avoids Finnish boilerplate (nav/footer) that would
    otherwise produce false-positive native-language signals in the classifier.
    """
    url = url.replace("/avoimet-tyopaikat/j/", "/en/jobs/j/")
    if "lang=" not in url:
        url += ("&" if "?" in url else "?") + "lang=en"
    return url


def _fetch_description(session: requests.Session, job_url: str) -> str:
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"academicwork: description fetch error ({job_url}): {e}", file=sys.stderr)
        return ""


def scrape_academicwork_static(url: str) -> list[dict]:
    session = requests.Session()

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    all_jobs: list[dict] = []
    seen_urls: set[str] = set()

    for page in range(MAX_PAGES):
        page_jobs = _fetch_page(session, page)
        print(f"academicwork: i={page} → {len(page_jobs)} jobs", file=sys.stderr)
        if not page_jobs:
            break

        # Deduplicate across pages (same job can appear on multiple pages)
        new_jobs = [j for j in page_jobs if j.get("url", "").split("?")[0] not in seen_urls]
        for j in new_jobs:
            seen_urls.add(j.get("url", "").split("?")[0])
        all_jobs.extend(new_jobs)

    print(f"academicwork: collected {len(all_jobs)} jobs total", file=sys.stderr)

    # ── Phase 2: description enrichment ──────────────────────────────────────
    # Only fetch descriptions for English-titled jobs — non-English titles are
    # already classified as requiring native language by the title detector.
    # Descriptions are fetched from the English URL (/en/jobs/j/…?lang=en) so
    # the classifier sees English page content without Finnish site boilerplate.
    # The job slug and ID are identical between the Finnish and English URL paths.
    english_jobs = [j for j in all_jobs if not _title_appears_non_english(j.get("classifierTitle") or j.get("title", ""))]
    unique_urls = list(dict.fromkeys(
        _to_english_url(j["url"]) for j in english_jobs if j.get("url")
    ))
    print(f"academicwork: fetching descriptions for {len(unique_urls)} English-titled jobs", file=sys.stderr)

    desc_cache: dict[str, str] = {}
    for i, job_url in enumerate(unique_urls):
        desc_cache[job_url] = _fetch_description(session, job_url)
        if (i + 1) % 10 == 0:
            print(f"academicwork: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        html = desc_cache.get(_to_english_url(job.get("url", "")), "")
        if html:
            job["descriptionHtml"] = html

    print(f"academicwork: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
