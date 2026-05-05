"""
Config-driven static HTML scraper.

Handles career sites that render jobs as plain HTML. Driven by entries in
scraper/generic_scrapers.yaml — no new Python file needed to add a company.

Three extraction modes (set via extract_mode in config):

  css_cards (default)
    Jobs are repeating HTML elements selected by card_selector. Field values
    are pulled from child elements via CSS selectors or heuristic defaults.

  attribute_json
    All jobs are encoded as a JSON array in an HTML attribute on a single
    container element (e.g. a web component). Fields are mapped by key name
    from each JSON object. No pagination needed — all jobs arrive at once.

  script_json
    All jobs are encoded as a JSON array stored under a key in a Next.js RSC
    script tag (self.__next_f.push([id, "...escaped payload..."])). Fields
    support dot notation for nested access (e.g. "header.roleTitle"). Location
    fan-out works via a locations array of objects with location_subfield and
    country_subfield keys.

  script_var_json
    Jobs are embedded as a plain JavaScript variable assignment in a <script>
    tag, e.g. var phApp = phApp || {"data": {"jobs": [...]}}. var_name
    identifies the variable; data_path (dot-notation) navigates to the jobs
    array inside the parsed object. Fields support the same dot-notation access
    as script_json.

  teamtailor
    TeamTailor ATS career sites. Jobs are in #jobs_list_container > li. Each
    card has a link (title + URL) and a metadata div with department, location,
    and work-type separated by middots. Department is extracted as jobFunction.

All modes share the same two-phase structure:
  1. Listing — fetch page(s) and extract jobs.
  2. Description enrichment — detail pages are always fetched for English-titled
     jobs so the language classifier has content to work with. In attribute_json
     and script_json modes, jobFunction is already set from the JSON so that
     assignment is skipped, but the description fetch itself still runs.
"""

import json as json_mod
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job, job_key, LOCATION_CLASS_PATTERNS
from title_language import _title_appears_non_english
from tracked_countries import is_tracked_location

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
    url_sel = cfg.get("url_selector")

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

    if url_sel:
        url_tag = card.select_one(url_sel)
        if url_tag and url_tag.get("href"):
            job_url = urljoin(base_url, url_tag["href"])

    if not title:
        return None

    location = None
    if loc_sel:
        tag = card.select_one(loc_sel)
        if tag:
            for label in tag.select(".sm-label"):
                label.decompose()
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


# ── script_json / script_var_json helpers ─────────────────────────────────────

def _get_nested(obj, path: str):
    """Dot-notation access into a nested dict, e.g. 'header.roleTitle'."""
    for part in path.split("."):
        if not isinstance(obj, dict):
            return None
        obj = obj.get(part)
    return obj


def _search_rsc_pushes(text: str, script_key: str) -> list | None:
    """
    Search all self.__next_f.push([id, "..."]) calls in a script tag's text
    for a JSON array stored under script_key. Returns the parsed list or None.
    """
    key_str = f'"{script_key}":'
    for m in re.finditer(r'__next_f\.push\(\[\d+,\s*"((?:[^"\\]|\\.)*)"\]', text):
        try:
            content = json_mod.loads('"' + m.group(1) + '"')
        except Exception:
            continue
        idx = content.find(key_str)
        if idx == -1:
            continue
        value_start = idx + len(key_str)
        while value_start < len(content) and content[value_start] in " \t\n\r":
            value_start += 1
        try:
            value, _ = json_mod.JSONDecoder().raw_decode(content, value_start)
            if isinstance(value, list):
                return value
        except Exception:
            continue
    return None


def _extract_script_json(html: str, cfg: dict, base_url: str) -> list[dict]:
    """Extract jobs from a JSON array embedded in a Next.js RSC script tag."""
    fields          = cfg.get("fields", {})
    script_key      = cfg["script_key"]
    title_field     = fields.get("title", "title")
    url_field       = fields.get("url", "url")
    locations_field = fields.get("locations")
    loc_subfield    = fields.get("location_subfield")
    ctry_subfield   = fields.get("country_subfield")
    jf_field        = fields.get("job_function")

    soup = BeautifulSoup(html, "html.parser")
    items = None
    for script in soup.find_all("script"):
        text = script.string or ""
        if script_key not in text:
            continue
        items = _search_rsc_pushes(text, script_key)
        if items is not None:
            break

    if items is None:
        print(f"generic: script_json key '{script_key}' not found", file=sys.stderr)
        return []

    jobs = []
    for item in items:
        title = _get_nested(item, title_field) if title_field else None
        if not title:
            continue

        raw_url  = _get_nested(item, url_field) if url_field else None
        job_url  = urljoin(base_url, raw_url) if raw_url else None
        jf       = _get_nested(item, jf_field) if jf_field else None
        loc_objs = _get_nested(item, locations_field) if locations_field else []
        if not isinstance(loc_objs, list):
            loc_objs = []

        if loc_objs and ctry_subfield:
            for loc_obj in loc_objs:
                if not isinstance(loc_obj, dict):
                    continue
                country  = loc_obj.get(ctry_subfield)
                location = loc_obj.get(loc_subfield) if loc_subfield else None
                job = build_job(title, job_url, location)
                if country:
                    job["country_code"] = country
                if jf:
                    job["jobFunction"] = jf
                jobs.append(job)
        else:
            job = build_job(title, job_url, None)
            if jf:
                job["jobFunction"] = jf
            jobs.append(job)

    return jobs


def _fetch_script_json_page(
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
    return _extract_script_json(resp.text, cfg, list_url)

# ── teamtailor helpers ────────────────────────────────────────────────────────

_MIDDOT = "·"

def _extract_teamtailor_card(card, base_url: str, cfg: dict) -> dict | None:
    link = card.find("a", href=True)
    if not link:
        return None

    title = link.get_text(strip=True)
    if not title:
        return None
    job_url = urljoin(base_url, link["href"])

    location = None
    department = None
    meta_div = card.select_one("div.text-md")
    if meta_div:
        parts = [
            p.strip()
            for p in meta_div.get_text(separator=_MIDDOT).split(_MIDDOT)
            if p.strip()
        ]
        if len(parts) >= 2:
            department = parts[0]
            location = parts[1]
        elif len(parts) == 1:
            location = parts[0]

    # TeamTailor sites often prefix each city with the company/office name,
    # e.g. "Futurice Helsinki, Futurice Tampere". Strip the prefix so the
    # country lookup can match the bare city names.
    if location:
        company_name = cfg.get("name", "")
        if company_name:
            cn_lower = company_name.lower()
            stripped_parts = []
            for part in location.split(","):
                s = part.strip()
                if s.lower().startswith(cn_lower + " "):
                    s = s[len(company_name):].strip()
                stripped_parts.append(s)
            cleaned = ", ".join(stripped_parts)
            location = cleaned or location

    job = build_job(title, job_url, location)
    if department:
        job["jobFunction"] = department
    return job


def _fetch_teamtailor_page(
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
    for card in soup.select("#jobs_list_container > li"):
        job = _extract_teamtailor_card(card, list_url, cfg)
        if job and job.get("title"):
            jobs.append(job)
    return jobs


def _find_jobs_payload(html: str):
    """
    Search raw HTML for:
        {"status":...,"hits":...,"totalHits":...,"data":{"jobs":[...]}}

    Return jobs list or None.
    """
    marker = '"totalHits"'
    decoder = json_mod.JSONDecoder()

    pos = 0
    while True:
        idx = html.find(marker, pos)
        if idx == -1:
            return None

        # walk backward to nearest opening {
        start = idx
        while start >= 0 and html[start] != "{":
            start -= 1

        if start < 0:
            pos = idx + len(marker)
            continue

        try:
            obj, _ = decoder.raw_decode(html, start)
        except Exception:
            pos = idx + len(marker)
            continue

        if not isinstance(obj, dict):
            pos = idx + len(marker)
            continue

        data = obj.get("data")
        if isinstance(data, dict) and isinstance(data.get("jobs"), list):
            return data["jobs"]

        pos = idx + len(marker)


def _extract_script_var_json(html: str, cfg: dict, base_url: str) -> list[dict]:
    """
    Extract jobs from embedded JSON payload in raw HTML.
    """
    fields = cfg.get("fields", {})

    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    location_field = fields.get("location")
    jf_field = fields.get("job_function")

    items = _find_jobs_payload(html)

    if not items:
        print("generic: jobs payload not found", file=sys.stderr)
        return []

    print(f"generic: found jobs payload ({len(items)} items)", file=sys.stderr)

    jobs = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = _get_nested(item, title_field)
        if not title:
            continue

        raw_url = _get_nested(item, url_field)
        job_url = urljoin(base_url, raw_url) if raw_url else None

        location = _get_nested(item, location_field)
        jf = _get_nested(item, jf_field) if jf_field else None

        job = build_job(title, job_url, location)

        if jf:
            job["jobFunction"] = jf

        jobs.append(job)

    return jobs


def _fetch_script_var_json_page(
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
    return _extract_script_var_json(resp.text, cfg, list_url)


# ── detail page enrichment (shared) ──────────────────────────────────────────

_GONE_STATUSES = {404, 410}

def _fetch_detail_page(
    session: requests.Session,
    job_url: str,
    desc_sel: str | None,
    jf_sel: str | None,
    detail_loc_sel: str | None = None,
) -> tuple[str, str | None, list[str] | None, bool]:
    """Fetch a job detail page and return (description_html, job_function, locations, gone).

    gone is True when the page returns 404/410, meaning the position no longer exists.
    locations is a list of location strings when detail_loc_sel is set and matches.
    """
    try:
        resp = session.get(job_url, timeout=20, headers=_HEADERS)
        if resp.status_code in _GONE_STATUSES:
            print(f"generic: detail page gone (HTTP {resp.status_code}): {job_url}", file=sys.stderr)
            return "", None, None, True
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

        locations = None
        if detail_loc_sel:
            loc_tags = soup.select(detail_loc_sel)
            if loc_tags:
                locations = [t.get_text(strip=True) for t in loc_tags if t.get_text(strip=True)]

        return desc_html, job_function, locations, False
    except Exception as e:
        print(f"generic: detail page fetch error ({job_url}): {e}", file=sys.stderr)
        return "", None, None, False


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
    detail_loc_sel = cfg.get("detail_location_selector")
    list_url     = cfg.get("list_url", url)
    extra_params: dict = cfg.get("extra_params", {})
    country_filter_param: str | None = cfg.get("country_filter_param")
    countries: list[str] = cfg.get("countries", [])
    country_values: dict[str, str] = cfg.get("country_values", {})

    if extract_mode == "attribute_json":
        fetch_page = _fetch_attribute_json_page
    elif extract_mode == "script_json":
        fetch_page = _fetch_script_json_page
    elif extract_mode == "script_var_json":
        fetch_page = _fetch_script_var_json_page
    elif extract_mode == "teamtailor":
        fetch_page = _fetch_teamtailor_page
    else:
        fetch_page = _fetch_css_cards_page

    session = requests.Session()

    # ── Phase 1: listing ──────────────────────────────────────────────────────
    # When country_filter_param + countries are set, iterate one paginated fetch
    # per country and merge results. Otherwise, a single fetch set runs as before.
    # country_values maps ISO codes to site-specific filter values (e.g. SE → "3").
    all_jobs: list[dict] = []
    seen_keys: set[str] = set()

    param_sets: list[tuple[dict, str | None]] = (
        [
            ({**extra_params, country_filter_param: country_values.get(cc, cc)}, cc)
            for cc in countries
        ]
        if country_filter_param and countries
        else [(dict(extra_params), None)]
    )

    for base_params, country_code in param_sets:
        label = country_code or ""
        prefix = f"generic [{name}]{f' ({label})' if label else ''}"

        if ptype == "none":
            jobs = fetch_page(session, list_url, base_params, cfg)
            print(f"{prefix}: single page → {len(jobs)} jobs", file=sys.stderr)
            new_jobs = [j for j in jobs if job_key(j) not in seen_keys]
            for j in new_jobs:
                seen_keys.add(job_key(j))
                if country_code:
                    j["country_code"] = country_code
            all_jobs.extend(new_jobs)
        else:
            param_name = pagination["param"]
            for page_num in range(max_pages):
                params = {**base_params, param_name: _page_param_value(pagination, page_num)}
                jobs = fetch_page(session, list_url, params, cfg)
                print(f"{prefix}: {param_name}={params[param_name]} → {len(jobs)} jobs", file=sys.stderr)

                new_jobs = [j for j in jobs if job_key(j) not in seen_keys]
                for j in new_jobs:
                    seen_keys.add(job_key(j))
                    if country_code:
                        j["country_code"] = country_code
                all_jobs.extend(new_jobs)

                if len(jobs) < page_size:
                    break

    print(f"generic [{name}]: collected {len(all_jobs)} jobs", file=sys.stderr)

    # ── Phase 2: description enrichment for English-titled jobs ─────────────��
    # In attribute_json mode, skip detail page fetches for jobs that already
    # have jobFunction from the JSON (description still fetched if needed).
    # When detail_location_selector is set, also fetch detail pages for
    # "Multiple Locations" jobs to resolve their actual locations.
    _MULTI_LOC_MARKERS = {"multiple locations", "multiple cities", "various locations"}

    def _is_multi_location(job: dict) -> bool:
        loc = (job.get("location") or "").lower().strip()
        return loc in _MULTI_LOC_MARKERS

    english_jobs = [j for j in all_jobs if not _title_appears_non_english(j.get("title", "")) and is_tracked_location(j.get("location"))]
    multi_loc_jobs = [j for j in all_jobs if detail_loc_sel and _is_multi_location(j)] if detail_loc_sel else []

    jobs_needing_detail = {j["url"] for j in english_jobs if j.get("url")}
    jobs_needing_detail.update(j["url"] for j in multi_loc_jobs if j.get("url"))
    unique_urls = list(dict.fromkeys(jobs_needing_detail))
    print(f"generic [{name}]: fetching details for {len(unique_urls)} jobs", file=sys.stderr)

    detail_cache: dict[str, tuple[str, str | None, list[str] | None, bool]] = {}
    for i, job_url in enumerate(unique_urls):
        result = _fetch_detail_page(session, job_url, desc_sel, jf_sel, detail_loc_sel)
        detail_cache[job_url] = result
        if (i + 1) % 10 == 0:
            print(f"generic [{name}]: enriched {i + 1}/{len(unique_urls)}", file=sys.stderr)

    gone_urls: set[str] = {u for u, (_, _, _, gone) in detail_cache.items() if gone}
    if gone_urls:
        before = len(all_jobs)
        all_jobs = [j for j in all_jobs if j.get("url") not in gone_urls]
        print(f"generic [{name}]: dropped {before - len(all_jobs)} jobs with expired detail pages", file=sys.stderr)

    for job in english_jobs:
        url = job.get("url", "")
        if url in gone_urls:
            continue
        desc_html, job_function, _, _ = detail_cache.get(url, ("", None, None, False))
        if desc_html:
            job["descriptionHtml"] = desc_html
        if job_function and not job.get("jobFunction"):
            job["jobFunction"] = job_function

    # Fan out multi-location jobs into one entry per resolved location
    if detail_loc_sel:
        expanded: list[dict] = []
        for job in all_jobs:
            if not _is_multi_location(job):
                expanded.append(job)
                continue
            url = job.get("url", "")
            _, _, locations, gone = detail_cache.get(url, ("", None, None, False))
            if gone:
                continue
            if not locations:
                expanded.append(job)
                continue
            for loc in locations:
                copy = dict(job)
                copy["location"] = loc
                expanded.append(copy)
        if len(expanded) != len(all_jobs):
            print(f"generic [{name}]: expanded multi-location jobs: {len(all_jobs)} → {len(expanded)}", file=sys.stderr)
        all_jobs = expanded

    print(f"generic [{name}]: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
