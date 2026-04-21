"""
Config-driven static HTML scraper.

Handles career sites that render jobs as plain HTML and paginate via a query
parameter. Driven by entries in scraper/generic_scrapers.yaml — no new Python
file needed to add a company that fits this pattern.

Two phases (same as every other platform scraper):
  1. Paginated listing — fetch pages until results dry up, extract cards.
  2. Description enrichment — fetch detail pages for English-titled jobs only.
"""

import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job, LOCATION_CLASS_PATTERNS
from title_language import _title_appears_non_english

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_DEFAULT_MAX_PAGES = 200

# Tried in order when description_selector is not set in config
_DESCRIPTION_SELECTOR_FALLBACKS = [
    ".jobdescription",
    ".job-description",
    "[class*='description']",
    "article",
    "main",
]


def _page_param_value(pagination: dict, page_number: int) -> int:
    """Return the query-parameter value for a given page number (0-based)."""
    ptype = pagination.get("type", "offset")
    page_size = pagination.get("page_size", 25)
    if ptype == "offset":
        return page_number * page_size
    if ptype == "page":
        return page_number + 1
    # index
    return page_number


def _extract_card(card, base_url: str, cfg: dict) -> dict | None:
    """Extract one job from a card element using config selectors or defaults."""
    title_sel = cfg.get("title_selector")
    loc_sel = cfg.get("location_selector")

    # ── Title + URL ──────────────────────────────────────────────────────────
    title, job_url = None, None

    if title_sel:
        tag = card.select_one(title_sel)
        if tag:
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if href:
                job_url = urljoin(base_url, href)

    if not title:
        # Default: first heading, then first link
        for heading in card.find_all(["h2", "h3", "h4"]):
            text = heading.get_text(strip=True)
            if text:
                title = text
                link = card.find("a", href=True)
                if link:
                    job_url = urljoin(base_url, link["href"])
                break
        if not title:
            link = card.find("a", href=True)
            if link:
                title = link.get_text(strip=True)
                job_url = urljoin(base_url, link["href"])

    if not title:
        return None

    # ── Location ─────────────────────────────────────────────────────────────
    location = None

    if loc_sel:
        tag = card.select_one(loc_sel)
        if tag:
            location = tag.get_text(strip=True) or None
    else:
        for child in card.find_all(True):
            child_classes = " ".join(child.get("class", []))
            if LOCATION_CLASS_PATTERNS.search(child_classes):
                text = child.get_text(strip=True)
                if text:
                    location = text
                    break

    return build_job(title, job_url, location)


def _fetch_listing_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    card_selector: str,
    cfg: dict,
) -> list[dict]:
    try:
        resp = session.get(list_url, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: fetch error ({list_url} {params}): {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    jobs = []
    for card in soup.select(card_selector):
        job = _extract_card(card, list_url, cfg)
        if job and job.get("title"):
            jobs.append(job)
    return jobs


def _fetch_detail_page(
    session: requests.Session,
    job_url: str,
    desc_sel: str | None,
    dept_sel: str | None,
) -> tuple[str, str | None]:
    """Fetch a job detail page and return (description_html, department)."""
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.content, "html.parser")

        selectors = [desc_sel] if desc_sel else _DESCRIPTION_SELECTOR_FALLBACKS
        desc_html = ""
        for sel in selectors:
            tag = soup.select_one(sel)
            if tag:
                desc_html = str(tag)
                break

        department = None
        if dept_sel:
            tag = soup.select_one(dept_sel)
            if tag:
                department = tag.get_text(strip=True) or None

        return desc_html, department
    except Exception as e:
        print(f"generic: detail page fetch error ({job_url}): {e}", file=sys.stderr)
        return "", None


def scrape_generic(url: str, cfg: dict) -> list[dict]:
    name = cfg.get("name", url)
    pagination = cfg.get("pagination", {})
    ptype = pagination.get("type", "none")
    page_size = pagination.get("page_size", 25)
    max_pages = pagination.get("max_pages", _DEFAULT_MAX_PAGES)
    card_selector = cfg["card_selector"]
    desc_sel = cfg.get("description_selector")
    dept_sel = cfg.get("job_function_selector")
    list_url = cfg.get("list_url", url)
    extra_params: dict = cfg.get("extra_params", {})

    session = requests.Session()

    # ── Phase 1: paginated listing ────────────────────────────────────────────
    all_jobs: list[dict] = []
    seen_titles: set[str] = set()

    if ptype == "none":
        params = dict(extra_params)
        jobs = _fetch_listing_page(session, list_url, params, card_selector, cfg)
        print(f"generic [{name}]: single page → {len(jobs)} jobs", file=sys.stderr)
        all_jobs = jobs
    else:
        param_name = pagination["param"]
        for page_num in range(max_pages):
            params = {**extra_params, param_name: _page_param_value(pagination, page_num)}
            jobs = _fetch_listing_page(session, list_url, params, card_selector, cfg)
            print(f"generic [{name}]: {param_name}={params[param_name]} → {len(jobs)} jobs", file=sys.stderr)

            new_jobs = [j for j in jobs if j["title"].lower() not in seen_titles]
            for j in new_jobs:
                seen_titles.add(j["title"].lower())
            all_jobs.extend(new_jobs)

            if len(jobs) < page_size:
                break

    print(f"generic [{name}]: collected {len(all_jobs)} jobs", file=sys.stderr)

    # ── Phase 2: description enrichment for English-titled jobs ──────────────
    english_jobs = [j for j in all_jobs if not _title_appears_non_english(j.get("title", ""))]
    unique_urls = list(dict.fromkeys(j["url"] for j in english_jobs if j.get("url")))
    print(f"generic [{name}]: fetching descriptions for {len(unique_urls)} English-titled jobs", file=sys.stderr)

    detail_cache: dict[str, tuple[str, str | None]] = {}
    for i, job_url in enumerate(unique_urls):
        detail_cache[job_url] = _fetch_detail_page(session, job_url, desc_sel, dept_sel)
        if (i + 1) % 10 == 0:
            print(f"generic [{name}]: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        desc_html, department = detail_cache.get(job.get("url", ""), ("", None))
        if desc_html:
            job["descriptionHtml"] = desc_html
        if department:
            job["jobFunction"] = department

    print(f"generic [{name}]: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
