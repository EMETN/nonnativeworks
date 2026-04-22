"""
Config-driven static HTML scraper.

Handles career sites that render jobs as plain HTML. Driven by entries in
scraper/generic_scrapers.yaml — no new Python file needed to add a company.

Two extraction modes (set via extract_mode in config):

  css_cards (default)
    Jobs are repeating HTML elements selected by card_selector. Field values
    are pulled from child elements via CSS selectors or heuristic defaults.

  attribute_json
    All jobs are encoded as a JSON array in an HTML attribute on a single
    container element (e.g. a web component). Fields are mapped by key name
    from each JSON object. No pagination needed — all jobs arrive at once.

Both modes share the same two-phase structure:
  1. Listing — fetch page(s) and extract jobs.
  2. Description enrichment — detail pages are always fetched for English-titled
     jobs so the language classifier has content to work with. In attribute_json
     mode, jobFunction is already set from the JSON so that assignment is skipped,
     but the description fetch itself still runs.
"""

import json as json_mod
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

_DESCRIPTION_SELECTOR_FALLBACKS = [
    ".jobdescription",
    ".job-description",
    "[class*='description']",
    "article",
    "main",
]


# ── css_cards helpers ─────────────────────────────────────────────────────────

def _page_param_value(pagination: dict, page_number: int) -> int:
    ptype = pagination.get("type", "offset")
    page_size = pagination.get("page_size", 25)
    if ptype == "offset":
        return page_number * page_size
    if ptype == "page":
        return page_number + 1
    return page_number  # index


def _extract_card(card, base_url: str, cfg: dict) -> dict | None:
    title_sel = cfg.get("title_selector")
    loc_sel = cfg.get("location_selector")

    title, job_url = None, None

    if title_sel:
        tag = card.select_one(title_sel)
        if tag:
            title = tag.get_text(strip=True)
            href = tag.get("href")
            if href:
                job_url = urljoin(base_url, href)

    if not title:
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


def _fetch_css_cards_page(
    session: requests.Session,
    list_url: str,
    params: dict,
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
    for card in soup.select(cfg["card_selector"]):
        job = _extract_card(card, list_url, cfg)
        if job and job.get("title"):
            jobs.append(job)
    return jobs


# ── attribute_json helpers ────────────────────────────────────────────────────

def _extract_attribute_json(html: str, cfg: dict) -> list[dict]:
    """Extract jobs from a JSON array stored in an HTML element attribute."""
    fields = cfg.get("fields", {})
    container_sel = cfg["container_selector"]
    attr_name = cfg["attribute_name"]

    soup = BeautifulSoup(html, "html.parser")
    container = soup.select_one(container_sel)
    if not container:
        print(f"generic: container not found: {container_sel}", file=sys.stderr)
        return []

    raw = container.get(attr_name, "")
    if not raw:
        print(f"generic: attribute '{attr_name}' empty or missing", file=sys.stderr)
        return []

    try:
        items = json_mod.loads(raw)
    except Exception as e:
        print(f"generic: failed to parse attribute JSON: {e}", file=sys.stderr)
        return []

    if not isinstance(items, list):
        print("generic: attribute JSON is not an array", file=sys.stderr)
        return []

    title_field       = fields.get("title", "title")
    url_field         = fields.get("url", "url")
    location_field    = fields.get("location")
    country_field     = fields.get("country")
    job_function_field = fields.get("job_function")

    jobs = []
    for item in items:
        title = item.get(title_field, "")
        if not title:
            continue

        job_url      = item.get(url_field) if url_field else None
        job_function = item.get(job_function_field) if job_function_field else None

        # countries and locations are treated as parallel arrays:
        # countries[i] corresponds to locations[i].
        countries = item.get(country_field, []) if country_field else []
        if isinstance(countries, str):
            countries = [countries]

        locations = item.get(location_field, []) if location_field else []
        if isinstance(locations, str):
            locations = [locations]

        if countries:
            # Fan out one job entry per country
            for i, country in enumerate(countries):
                location = locations[i] if i < len(locations) else (locations[0] if locations else None)
                job = build_job(title, job_url, location)
                job["country_code"] = country
                if job_function:
                    job["jobFunction"] = job_function
                jobs.append(job)
        else:
            location = locations[0] if locations else None
            job = build_job(title, job_url, location)
            if job_function:
                job["jobFunction"] = job_function
            jobs.append(job)

    return jobs


def _fetch_attribute_json_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    cfg: dict,
) -> list[dict]:
    try:
        resp = session.get(list_url, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: fetch error ({list_url}): {e}", file=sys.stderr)
        return []
    return _extract_attribute_json(resp.text, cfg)


# ── detail page enrichment (shared) ──────────────────────────────────────────

def _fetch_detail_page(
    session: requests.Session,
    job_url: str,
    desc_sel: str | None,
    jf_sel: str | None,
) -> tuple[str, str | None]:
    """Fetch a job detail page and return (description_html, job_function)."""
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

        job_function = None
        if jf_sel:
            tag = soup.select_one(jf_sel)
            if tag:
                job_function = tag.get_text(strip=True) or None

        return desc_html, job_function
    except Exception as e:
        print(f"generic: detail page fetch error ({job_url}): {e}", file=sys.stderr)
        return "", None


# ── main entry point ──────────────────────────────────────────────────────────

def scrape_generic(url: str, cfg: dict) -> list[dict]:
    name         = cfg.get("name", url)
    extract_mode = cfg.get("extract_mode", "css_cards")
    pagination   = cfg.get("pagination", {})
    ptype        = pagination.get("type", "none")
    page_size    = pagination.get("page_size", 25)
    max_pages    = pagination.get("max_pages", _DEFAULT_MAX_PAGES)
    desc_sel     = cfg.get("description_selector")
    jf_sel       = cfg.get("job_function_selector")
    list_url     = cfg.get("list_url", url)
    extra_params: dict = cfg.get("extra_params", {})

    fetch_page = (
        _fetch_attribute_json_page if extract_mode == "attribute_json"
        else _fetch_css_cards_page
    )

    session = requests.Session()

    # ── Phase 1: listing ──────────────────────────────────────────────────────
    all_jobs: list[dict] = []
    seen_titles: set[str] = set()

    if ptype == "none":
        jobs = fetch_page(session, list_url, dict(extra_params), cfg)
        print(f"generic [{name}]: single page → {len(jobs)} jobs", file=sys.stderr)
        all_jobs = jobs
    else:
        param_name = pagination["param"]
        for page_num in range(max_pages):
            params = {**extra_params, param_name: _page_param_value(pagination, page_num)}
            jobs = fetch_page(session, list_url, params, cfg)
            print(f"generic [{name}]: {param_name}={params[param_name]} → {len(jobs)} jobs", file=sys.stderr)

            new_jobs = [j for j in jobs if j["title"].lower() not in seen_titles]
            for j in new_jobs:
                seen_titles.add(j["title"].lower())
            all_jobs.extend(new_jobs)

            if len(jobs) < page_size:
                break

    print(f"generic [{name}]: collected {len(all_jobs)} jobs", file=sys.stderr)

    # ── Phase 2: description enrichment for English-titled jobs ──────────────
    # In attribute_json mode, skip detail page fetches for jobs that already
    # have jobFunction from the JSON (description still fetched if needed).
    english_jobs = [j for j in all_jobs if not _title_appears_non_english(j.get("title", ""))]
    unique_urls = list(dict.fromkeys(j["url"] for j in english_jobs if j.get("url")))
    print(f"generic [{name}]: fetching descriptions for {len(unique_urls)} English-titled jobs", file=sys.stderr)

    detail_cache: dict[str, tuple[str, str | None]] = {}
    for i, job_url in enumerate(unique_urls):
        detail_cache[job_url] = _fetch_detail_page(session, job_url, desc_sel, jf_sel)
        if (i + 1) % 10 == 0:
            print(f"generic [{name}]: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    for job in english_jobs:
        desc_html, job_function = detail_cache.get(job.get("url", ""), ("", None))
        if desc_html:
            job["descriptionHtml"] = desc_html
        # Only set jobFunction from detail page if not already set from phase 1
        if job_function and not job.get("jobFunction"):
            job["jobFunction"] = job_function

    print(f"generic [{name}]: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
