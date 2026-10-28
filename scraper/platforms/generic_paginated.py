"""
Config-driven static HTML scraper.

Handles career sites that render jobs as plain HTML. Driven by entries in
scraper/generic_scrapers.yaml — no new Python file needed to add a company.

Extraction modes (set via extract_mode in config):

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
    country_subfield keys (or location_subfield alone, leaving the country to
    be resolved from the location text).

  script_var_json
    Jobs are embedded as a plain JavaScript variable assignment in a <script>
    tag, e.g. var phApp = phApp || {"data": {"jobs": [...]}}. var_name
    identifies the variable; data_path (dot-notation) navigates to the jobs
    array inside the parsed object. Fields support the same dot-notation access
    as script_json.

  phenom_api
    Phenom career sites, queried through their /widgets refineSearch JSON
    endpoint (api_body supplies the tenant's refNum). With country_filter_param
    set to a facet field (e.g. "country"), the tracked values of that facet are
    discovered and fetched one country at a time. A locations field yields one
    job per country with that country's cities.

  teamtailor
    TeamTailor ATS career sites. Jobs are in #jobs_list_container > li. Each
    card has a link (title + URL) and a metadata div with department, location,
    and work-type separated by middots. Department is extracted as jobFunction.

All modes share the same two-phase structure:
  1. Listing — fetch page(s) and extract jobs.
  2. Description enrichment — detail pages are fetched for English-titled jobs
     so the language classifier has content to work with, unless the listing
     already supplied a description. In attribute_json and script_json modes,
     jobFunction is already set from the JSON so that assignment is skipped,
     but the description fetch itself still runs.
"""

import contextlib
import json as json_mod
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import (
    LOCATION_CLASS_PATTERNS,
    build_job,
    describe_response,
    is_cached_job,
    job_key,
)
from title_language import _title_appears_non_english_excluding_cities
from tracked_countries import TRACKED_NAMES, is_tracked_location

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) "
        "Gecko/20100101 Firefox/148.0"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_DEFAULT_MAX_PAGES = 200

# Pages fetched at once, per config. These sites spend seconds rendering a page
# server-side, so fetching one at a time makes the wall clock a multiple of the
# work — Siemens measured 3.3s per listing page serially against 0.7s at five in
# flight, and Neste's board came back identical in half the time.
#
# The default is nevertheless 1, i.e. exactly the behaviour every config had
# before this knob existed. Concurrency is opt-in per config because the cost of
# guessing wrong is not a slow scrape but a ban: a sustained ~1,000-page run
# against jobs.siemens.com at five in flight drew nginx 406s partway through and
# then a blanket IP block across the whole Avature tenant, taking Siemens
# Healthineers offline with it. Raise this only for a site you have watched hold
# up under a full run.
#
# A config that sets request_delay is throttled on purpose and always stays
# serial, whatever this says.
_DEFAULT_CONCURRENCY = 1

# Breather between batches, mirroring enrichDescriptions: sustained bursts with
# no pacing at all are what trips WAFs, not the concurrency itself.
_BATCH_PAUSE_SECONDS = 0.5

_DESCRIPTION_SELECTOR_FALLBACKS = [
    ".jobdescription",
    ".job-description",
    "[class*='description']",
    "article",
    "main",
]

# Statuses worth a retry: a rate-limit or a transient server/proxy error. A 404
# or 410 is deliberately absent — that is a deleted posting, not a blip.
_RETRY_STATUSES = {429, 500, 502, 503, 504}

# Ceiling for the retry backoff, so a large max_retries cannot stall a run.
_MAX_BACKOFF_SECONDS = 60

# Start time of the most recent request, used to space requests out when a
# config sets request_delay. Module-level because the spacing has to hold across
# every fetch in a run — listing pages and detail pages alike.
_last_request_at = 0.0

# Most recent response from _get, so a listing page that yields no jobs can say
# what the server actually sent. Best-effort under concurrency > 1, where the
# last response to arrive may belong to a neighbouring page.
_last_response: requests.Response | None = None


def _get(session: requests.Session, url: str, cfg: dict, **kwargs) -> requests.Response:
    """``session.get()`` with the config's request_delay and max_retries applied.

    request_delay is the minimum gap between the *starts* of two requests, so a
    slow response doesn't stack extra waiting on top of it. A response with a
    retryable status is retried with exponential backoff.

    The response is returned as-is, without raise_for_status() — callers keep
    their own status handling (detail pages, for one, read 404/410 as a posting
    that no longer exists rather than as a failure).
    """
    global _last_request_at, _last_response
    delay = cfg.get("request_delay", 0)
    retries = cfg.get("max_retries", 0)

    for attempt in range(retries + 1):
        if delay:
            pending = delay - (time.monotonic() - _last_request_at)
            if pending > 0:
                time.sleep(pending)
        _last_request_at = time.monotonic()

        last_attempt = attempt == retries
        try:
            resp = session.get(url, **kwargs)
        except Exception:
            if last_attempt:
                raise
        else:
            if last_attempt or resp.status_code not in _RETRY_STATUSES:
                _last_response = resp
                return resp
            print(
                f"generic: HTTP {resp.status_code} on {url} — retrying "
                f"({attempt + 1}/{retries})",
                file=sys.stderr,
            )
        # Capped: an uncapped doubling reaches tens of minutes on a config with
        # a generous max_retries, which stalls a run rather than recovering it.
        time.sleep(min(max(delay, 1) * 2**attempt, _MAX_BACKOFF_SECONDS))


# ── css_cards helpers ─────────────────────────────────────────────────────────


def _page_param_value(pagination: dict, page_number: int) -> int | str:
    ptype = pagination.get("type", "offset")
    page_size = pagination.get("page_size", 25)
    if ptype == "offset":
        value = page_number * page_size
    elif ptype == "page":
        value = page_number + 1
    else:
        value = page_number  # index
    # value_template wraps the number when the site expects more than a bare
    # digit in the parameter — e.g. WPP packs "page=3" inside qs_search_job.
    if template := pagination.get("value_template"):
        return template.format(page=value)
    return value


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


def _concurrency(cfg: dict) -> int:
    """How many requests this config may have in flight at once."""
    if cfg.get("request_delay"):
        return 1
    return max(1, int(cfg.get("concurrency", _DEFAULT_CONCURRENCY)))


def _map_concurrently(fn, items: list, workers: int, pool: list) -> list:
    """Run fn(item, session) over items, `workers` at a time, preserving order.
    Falls back to a plain serial loop when workers == 1."""
    if workers == 1 or len(items) <= 1:
        return [fn(item, pool[0]) for item in items]
    results: list = []
    for start in range(0, len(items), workers):
        chunk = items[start : start + workers]
        with ThreadPoolExecutor(max_workers=len(chunk)) as ex:
            results.extend(
                ex.map(lambda p: fn(p[1], pool[p[0] % workers]), enumerate(chunk))
            )
        if start + workers < len(items):
            time.sleep(_BATCH_PAUSE_SECONDS)
    return results


# Longest first so "czech republic" wins over "czech" and the key stays stable.
_COUNTRY_NAMES_BY_LENGTH = sorted(TRACKED_NAMES, key=len, reverse=True)


def _country_key(location: str) -> str:
    """Group key for a detail-page location string such as "Zuerich - Zuerich -
    Switzerland". Returns the tracked country name it mentions, or the string
    itself when none is recognised (so it groups only with identical entries)."""
    loc = location.lower()
    for name in _COUNTRY_NAMES_BY_LENGTH:
        if name in loc:
            return name
    return loc


def _city_of(location: str) -> str:
    """First segment of a "City - State - Country" detail-page location."""
    return location.split(" - ")[0].strip()


def _fetch_css_cards_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    cfg: dict,
) -> list[dict]:
    try:
        resp = _get(session, list_url, cfg, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: fetch error ({list_url} {params}): {e}", file=sys.stderr)
        return []

    content = resp.content
    if json_key := cfg.get("json_html_key"):
        try:
            html_str = resp.json().get(json_key, "")
        except Exception:
            html_str = ""
        content = html_str.encode()

    soup = BeautifulSoup(content, "html.parser")
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

    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    location_field = fields.get("location")
    country_field = fields.get("country")
    job_function_field = fields.get("job_function")

    jobs = []
    for item in items:
        title = item.get(title_field, "")
        if not title:
            continue

        job_url = item.get(url_field) if url_field else None
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
                location = (
                    locations[i]
                    if i < len(locations)
                    else (locations[0] if locations else None)
                )
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
        resp = _get(session, list_url, cfg, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: fetch error ({list_url}): {e}", file=sys.stderr)
        return []
    return _extract_attribute_json(resp.text, cfg)


# ── script_json / script_var_json helpers ─────────────────────────────────────


def _get_nested(obj, path: str):
    """Dot-notation access into nested dicts and lists, e.g. 'items.0.name'."""
    for part in path.split("."):
        if isinstance(obj, list) and part.isdigit():
            obj = obj[int(part)] if int(part) < len(obj) else None
        elif isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
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


def _rsc_text_rows(html: str) -> dict[str, str]:
    """
    Map RSC text-row ids to their content. Long strings are emitted as their own
    row ("78:T13a3," then 0x13a3 bytes, possibly spanning pushes) and referenced
    from the JSON as "$78".
    """
    pushes = []
    for m in re.finditer(r'__next_f\.push\(\[\d+,\s*"((?:[^"\\]|\\.)*)"\]', html):
        with contextlib.suppress(Exception):
            pushes.append(json_mod.loads('"' + m.group(1) + '"'))
    stream = "".join(pushes).encode("utf-8")

    # A row starts after a newline, or straight after the previous text row's bytes.
    header = re.compile(rb"([0-9a-f]+):T([0-9a-f]+),")
    after_newline = re.compile(rb"(?:^|\n)([0-9a-f]+):T([0-9a-f]+),")
    rows: dict[str, str] = {}
    pos = 0
    while m := header.match(stream, pos) or after_newline.search(stream, pos):
        size = int(m.group(2), 16)
        rows[m.group(1).decode()] = stream[m.end() : m.end() + size].decode(
            "utf-8", errors="replace"
        )
        pos = m.end() + size
    return rows


def _extract_script_json(html: str, cfg: dict, base_url: str) -> list[dict]:
    """Extract jobs from a JSON array embedded in a Next.js RSC script tag."""
    fields = cfg.get("fields", {})
    script_key = cfg["script_key"]
    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    locations_field = fields.get("locations")
    loc_subfield = fields.get("location_subfield")
    ctry_subfield = fields.get("country_subfield")
    jf_field = fields.get("job_function")
    desc_field = fields.get("description")
    url_template = cfg.get("url_template")
    text_rows = _rsc_text_rows(html) if desc_field else {}

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

        if url_template:
            try:
                raw_url = url_template.format_map(item)
            except KeyError:
                raw_url = None
        else:
            raw_url = _get_nested(item, url_field) if url_field else None
        job_url = urljoin(base_url, raw_url) if raw_url else None
        jf = _get_nested(item, jf_field) if jf_field else None
        desc = _get_nested(item, desc_field) if desc_field else None
        if isinstance(desc, str) and desc.startswith("$"):
            desc = text_rows.get(desc[1:])
        loc_objs = _get_nested(item, locations_field) if locations_field else []
        if not isinstance(loc_objs, list):
            loc_objs = []

        entries: list[tuple[str | None, str | None]] = []
        if loc_objs and (ctry_subfield or loc_subfield):
            for loc_obj in loc_objs:
                if not isinstance(loc_obj, dict):
                    continue
                country = _get_nested(loc_obj, ctry_subfield) if ctry_subfield else None
                location = _get_nested(loc_obj, loc_subfield) if loc_subfield else None
                entries.append((location, country))
        else:
            entries.append((None, None))

        for location, country in entries:
            job = build_job(title, job_url, location)
            if country:
                job["country_code"] = country
            if jf:
                job["jobFunction"] = jf
            if desc:
                job["descriptionHtml"] = desc
            jobs.append(job)

    return jobs


def _fetch_script_json_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    cfg: dict,
) -> list[dict]:
    try:
        resp = _get(session, list_url, cfg, params=params, timeout=20, headers=_HEADERS)
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
                    s = s[len(company_name) :].strip()
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
        resp = _get(session, list_url, cfg, params=params, timeout=20, headers=_HEADERS)
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


# ── xml_feed helpers ──────────────────────────────────────────────────────────

_XML_CHAR_REF = re.compile(r"&#(x?)([0-9A-Fa-f]+);")
_XML_CHAR_REF_PAIR = re.compile(r"&#(x?)([0-9A-Fa-f]+);&#(x?)([0-9A-Fa-f]+);")


def _char_ref_value(prefix: str, digits: str) -> int:
    return int(digits, 16) if prefix else int(digits)


def _is_valid_xml_char(n: int) -> bool:
    # XML 1.0 legal chars; notably excludes UTF-16 surrogates (0xD800–0xDFFF).
    return (
        n in (0x9, 0xA, 0xD)
        or 0x20 <= n <= 0xD7FF
        or 0xE000 <= n <= 0xFFFD
        or 0x10000 <= n <= 0x10FFFF
    )


def _sanitize_xml_char_refs(content: bytes) -> bytes:
    """Repair feeds that encode emoji as raw UTF-16 surrogate-pair character
    references (e.g. `&#55357;&#56658;`). Those are illegal in XML 1.0, so a strict
    parser rejects the *entire* document over one bad job. Recombine surrogate pairs
    into the real codepoint and drop any remaining references to invalid characters."""
    text = content.decode("utf-8", "replace")

    def combine(m: "re.Match[str]") -> str:
        hi = _char_ref_value(m.group(1), m.group(2))
        lo = _char_ref_value(m.group(3), m.group(4))
        if 0xD800 <= hi <= 0xDBFF and 0xDC00 <= lo <= 0xDFFF:
            cp = 0x10000 + ((hi - 0xD800) << 10) + (lo - 0xDC00)
            return f"&#{cp};"
        return m.group(0)

    def drop_invalid(m: "re.Match[str]") -> str:
        n = _char_ref_value(m.group(1), m.group(2))
        return m.group(0) if _is_valid_xml_char(n) else ""

    text = _XML_CHAR_REF_PAIR.sub(combine, text)
    text = _XML_CHAR_REF.sub(drop_invalid, text)
    return text.encode("utf-8")


def _extract_xml_feed(content: bytes, cfg: dict, base_url: str) -> list[dict]:
    """Extract jobs from an XML job feed (e.g. Volvo's SuccessFactors feed)."""
    from xml.etree import ElementTree as ET

    fields = cfg.get("fields", {})
    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    location_field = fields.get("location", "city")
    country_field = fields.get("country", "country")
    jf_field = fields.get("job_function", "department")
    desc_field = fields.get("description", "description")
    item_tag = cfg.get("item_tag", "job")

    root = ET.fromstring(_sanitize_xml_char_refs(content))
    items = root.iter(item_tag)

    jobs = []
    for item in items:
        title_el = item.find(title_field)
        if title_el is None or not (title_el.text or "").strip():
            continue

        title = title_el.text.strip()
        job_url = (item.findtext(url_field) or "").strip() or None
        if job_url:
            job_url = urljoin(base_url, job_url)
        location = (item.findtext(location_field) or "").strip() or None
        country = (item.findtext(country_field) or "").strip() or None
        jf = (item.findtext(jf_field) or "").strip() or None
        desc = (item.findtext(desc_field) or "").strip() or None

        job = build_job(title, job_url, location)
        if country:
            job["country_code"] = country.upper()
        if jf:
            job["jobFunction"] = jf
        if desc:
            job["descriptionHtml"] = desc

        jobs.append(job)

    return jobs


def _fetch_xml_feed(session: requests.Session, url: str, cfg: dict) -> list[dict]:
    try:
        resp = _get(session, url, cfg, timeout=30, headers=_HEADERS)
        resp.raise_for_status()
        return _extract_xml_feed(resp.content, cfg, url)
    except Exception as e:
        print(f"generic: xml feed error ({url}): {e}", file=sys.stderr)
        return []


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


_POSTCODE_RE = re.compile(r"^\d{4,6}\s+")
_HOUSE_NUMBER_RE = re.compile(r"\s\d+[a-zA-Z]?$")


def _city_from_location(location: str) -> str | None:
    """'An d. Lände 3, 91301 Forchheim, Germany' → 'Forchheim'."""
    for segment in location.split(",")[:-1]:
        segment = _POSTCODE_RE.sub("", segment.strip())
        if segment and not _HOUSE_NUMBER_RE.search(segment):
            return segment
    return None


def _group_locations_by_country(locations: list[str]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {}
    for loc in locations:
        if isinstance(loc, str) and loc.strip():
            groups.setdefault(loc.rsplit(",", 1)[-1].strip(), []).append(loc)
    return groups


def _jobs_from_items(
    items: list, cfg: dict, base_url: str, country: str | None = None
) -> list[dict]:
    fields = cfg.get("fields", {})

    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    url_template = cfg.get("url_template")
    location_field = fields.get("location")
    locations_field = fields.get("locations")
    jf_field = fields.get("job_function")
    desc_field = fields.get("description")

    jobs = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = _get_nested(item, title_field)
        if not title:
            continue

        if url_template:
            # Built from payload fields rather than read from one, for sites whose
            # listing carries no link to the job page (Allianz's only URL field is
            # its SuccessFactors application form, not the posting itself).
            try:
                raw_url = url_template.format_map(item)
            except KeyError:
                raw_url = None
        else:
            raw_url = _get_nested(item, url_field)
        job_url = urljoin(base_url, raw_url) if raw_url else None

        jf = _get_nested(item, jf_field) if jf_field else None

        # A description carried in the listing payload (e.g. Allianz's
        # descriptionTeaser) is written straight onto the job, which lets the
        # enrichment phase below skip the detail page entirely.
        desc = _get_nested(item, desc_field) if desc_field else None

        locations = _get_nested(item, locations_field) if locations_field else None
        if not isinstance(locations, list) or not locations:
            job = build_job(
                title,
                job_url,
                _get_nested(item, location_field) if location_field else None,
            )
            if jf:
                job["jobFunction"] = jf
            if desc:
                job["descriptionText"] = desc
            jobs.append(job)
            continue

        # One job per country, not per location: a posting listed at two sites in
        # the same country is still one opening.
        groups = _group_locations_by_country(locations)
        if country:
            groups = {
                c: locs for c, locs in groups.items() if c.lower() == country.lower()
            } or {country: []}
        for ctry, locs in groups.items():
            job = build_job(title, job_url, "; ".join(locs) or ctry)
            cities = list(dict.fromkeys(filter(None, map(_city_from_location, locs))))
            if cities:
                job["cities"] = cities
            if jf:
                job["jobFunction"] = jf
            if desc:
                job["descriptionText"] = desc
            jobs.append(job)

    return jobs


def _extract_script_var_json(html: str, cfg: dict, base_url: str) -> list[dict]:
    """
    Extract jobs from embedded JSON payload in raw HTML.
    """
    items = _find_jobs_payload(html)

    if not items:
        print("generic: jobs payload not found", file=sys.stderr)
        return []

    print(f"generic: found jobs payload ({len(items)} items)", file=sys.stderr)
    return _jobs_from_items(items, cfg, base_url)


def _fetch_script_var_json_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    cfg: dict,
) -> list[dict]:
    try:
        resp = _get(session, list_url, cfg, params=params, timeout=20, headers=_HEADERS)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: fetch error ({list_url}): {e}", file=sys.stderr)
        return []
    return _extract_script_var_json(resp.text, cfg, list_url)


# ── phenom_api helpers ────────────────────────────────────────────────────────


def _phenom_search(
    session: requests.Session, list_url: str, cfg: dict, body: dict
) -> dict | None:
    """POST a refineSearch query to the Phenom /widgets endpoint."""
    try:
        resp = session.post(
            urljoin(list_url, "/widgets"),
            json={
                "ddoKey": "refineSearch",
                "jobs": True,
                **cfg.get("api_body", {}),
                **body,
            },
            timeout=20,
            headers={**_HEADERS, "Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json().get("refineSearch", {}).get("data")
    except Exception as e:
        print(f"generic: phenom search error ({list_url}): {e}", file=sys.stderr)
        return None


def _phenom_tracked_countries(
    session: requests.Session, list_url: str, cfg: dict
) -> list[str]:
    """Tracked values of the country facet, so per-country queries cover whatever
    countries currently have openings."""
    facet = cfg["country_filter_param"]
    data = _phenom_search(
        session,
        list_url,
        cfg,
        {"size": 1, "selected_fields": {}, "counts": True, "all_fields": [facet]},
    )
    for agg in (data or {}).get("aggregations") or []:
        if isinstance(agg, dict) and agg.get("field") == facet:
            return [c for c in agg.get("value") or {} if c.lower() in TRACKED_NAMES]
    print(f"generic: no {facet!r} facet in phenom response", file=sys.stderr)
    return []


def _fetch_phenom_api_page(
    session: requests.Session,
    list_url: str,
    params: dict,
    cfg: dict,
) -> list[dict]:
    pagination = cfg.get("pagination", {})
    facet = cfg.get("country_filter_param")
    country = params.get(facet) if facet else None
    data = _phenom_search(
        session,
        list_url,
        cfg,
        {
            "from": params.get(pagination.get("param", "from"), 0),
            "size": pagination.get("page_size", 100),
            "selected_fields": {facet: [country]} if country else {},
        },
    )
    return _jobs_from_items((data or {}).get("jobs") or [], cfg, list_url, country)


# ── detail page enrichment (shared) ──────────────────────────────────────────

_GONE_STATUSES = {404, 410}

# Minimum text length (chars) for a CSS-selector result to be considered usable.
# Pages that use Next.js RSC streaming deliver content via __next_f.push script
# chunks rather than real DOM elements, so the selector matches an empty skeleton.
_MIN_DESCRIPTION_TEXT_LEN = 200


def _extract_rsc_description(raw_html: str) -> str:
    """Fallback for Next.js RSC-streamed pages.

    Job content is JSON-encoded inside self.__next_f.push([1, "..."]) script tags
    rather than in the DOM, so CSS selectors on the initial HTML return an empty
    skeleton.  This function decodes those chunks, concatenates them, then extracts
    all paragraph/heading/list elements — enough for the language classifier to find
    requirement phrases.
    """
    # Parse script tags with BeautifulSoup rather than using regex on the raw HTML.
    # The RSC streaming format embeds content as JSON strings inside
    # self.__next_f.push([1, "..."]) calls. We find those script tags, extract
    # the JS text, then eval the string argument with json.loads.
    rsc_page_soup = BeautifulSoup(raw_html, "html.parser")
    payload = ""
    for script in rsc_page_soup.find_all("script"):
        text = script.string or ""
        if "__next_f.push" not in text:
            continue
        m = re.search(r'\[1,"((?:[^"\\]|\\.)*)"\]', text, re.DOTALL)
        if m:
            with contextlib.suppress(Exception):
                payload += json_mod.loads('"' + m.group(1) + '"')
    if not payload:
        return ""
    rsc_soup = BeautifulSoup(payload, "html.parser")
    parts = rsc_soup.find_all(["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"])
    if not parts:
        return ""
    return "<div>" + "".join(str(p) for p in parts) + "</div>"


def _extract_json_description(raw_html: str, key: str) -> str:
    """Longest string value stored under ``key`` in a page's embedded JSON.

    Some career sites render the posting client-side, so the description never
    reaches the DOM and no CSS selector can see it — it exists only inside a
    script payload (Allianz's Phenom People pages are the case this was written
    for). The longest match wins because such payloads usually repeat the field,
    once HTML-escaped and once not, alongside shorter teaser variants.
    """
    best = ""
    for m in re.finditer(re.escape(f'"{key}"') + r'\s*:\s*"', raw_html):
        i = m.end()
        buf: list[str] = []
        while i < len(raw_html):
            char = raw_html[i]
            if char == "\\":
                buf.append(raw_html[i : i + 2])
                i += 2
                continue
            if char == '"':
                break
            buf.append(char)
            i += 1
        if len(buf) > len(best):
            best = "".join(buf)
    if not best:
        return ""
    with contextlib.suppress(Exception):
        best = json_mod.loads(f'"{best}"')
    return unescape(best)


def _extract_phenom_description(raw_html: str) -> str:
    """Fallback for Phenom job pages, which render the description client-side
    from the phApp.ddo jobDetail payload rather than shipping it in the DOM."""
    idx = raw_html.find('"jobDetail"')
    if idx == -1:
        return ""
    start = raw_html.find("{", idx)
    try:
        payload, _ = json_mod.JSONDecoder().raw_decode(raw_html, start)
    except ValueError:
        return ""
    desc = _get_nested(payload, "data.job.description")
    return desc if isinstance(desc, str) else ""


def _fetch_detail_page(
    session: requests.Session,
    job_url: str,
    cfg: dict,
    desc_sel: str | None,
    jf_sel: str | None,
    detail_loc_sel: str | None = None,
    json_desc_key: str | None = None,
) -> tuple[str, str | None, list[str] | None, bool]:
    """Fetch a job detail page and return (description_html, job_function, locations, gone).

    gone is True when the page returns 404/410, meaning the position no longer exists.
    locations is a list of location strings when detail_loc_sel is set and matches.
    """
    try:
        resp = _get(session, job_url, cfg, timeout=20, headers=_HEADERS)
        if resp.status_code in _GONE_STATUSES:
            print(
                f"generic: detail page gone (HTTP {resp.status_code}): {job_url}",
                file=sys.stderr,
            )
            return "", None, None, True
        resp.raise_for_status()
        raw_html = resp.text
        soup = BeautifulSoup(resp.content, "html.parser")

        desc_html = ""
        if desc_sel:
            # Company-configured selector: concatenate ALL matches, not just the
            # first. Some sites (e.g. Sweco) split the job description across
            # multiple sibling sections sharing one class (e.g. an "about the
            # role" block plus separate "requirements"/"benefits" blocks) — using
            # only the first match can silently drop the paragraph that actually
            # carries the language signal.
            tags = soup.select(desc_sel)
            if tags:
                desc_html = "".join(str(t) for t in tags)
        else:
            # Fallback chain: keep first-match-wins behaviour, since these
            # selectors (e.g. "[class*='description']", "main") are broad enough
            # that concatenating every match across many different companies'
            # page structures would risk pulling in unrelated content. Phenom's
            # payload goes first: its "main" is page chrome long enough to pass
            # the length check below.
            desc_html = _extract_phenom_description(raw_html)
            if not desc_html:
                for sel in _DESCRIPTION_SELECTOR_FALLBACKS:
                    tag = soup.select_one(sel)
                    if tag:
                        desc_html = str(tag)
                        break

        # If the selector result is too short the page likely uses Next.js RSC
        # streaming — real content lives in __next_f.push script chunks, not the DOM.
        if (
            len(BeautifulSoup(desc_html, "html.parser").get_text())
            < _MIN_DESCRIPTION_TEXT_LEN
        ):
            rsc_html = _extract_rsc_description(raw_html)
            if rsc_html:
                desc_html = rsc_html
            elif json_desc_key:
                json_desc = _extract_json_description(raw_html, json_desc_key)
                if json_desc:
                    desc_html = json_desc

        job_function = None
        if jf_sel:
            tag = soup.select_one(jf_sel)
            if tag:
                job_function = tag.get_text(strip=True) or None

        locations = None
        if detail_loc_sel:
            loc_tags = soup.select(detail_loc_sel)
            if loc_tags:
                locations = [
                    t.get_text(strip=True) for t in loc_tags if t.get_text(strip=True)
                ]

        return desc_html, job_function, locations, False
    except Exception as e:
        print(f"generic: detail page fetch error ({job_url}): {e}", file=sys.stderr)
        return "", None, None, False


# ── main entry point ──────────────────────────────────────────────────────────


def _countries_from_select(
    session: "requests.Session", list_url: str, spec: dict
) -> tuple[list[str], dict[str, str]]:
    """Read a country ``<select>`` off the listing page → (countries, country_values),
    so per-country iteration follows whatever the site offers instead of a hardcoded
    list. Each option's label (minus an optional brand prefix) is both the filter key
    and the country tag, and resolves downstream — so "Sweco Norge" still maps to NO.
    """
    selector = spec.get("selector", "select[name=country]")
    strip_prefix = spec.get("strip_prefix", "")
    skip_values = set(spec.get("skip_values", ["0", ""]))
    try:
        resp = session.get(list_url, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"generic: country <select> fetch failed ({e})", file=sys.stderr)
        return [], {}
    select = BeautifulSoup(resp.content, "html.parser").select_one(selector)
    if select is None:
        print(f"generic: no country <select> matching {selector!r}", file=sys.stderr)
        return [], {}

    countries: list[str] = []
    values: dict[str, str] = {}
    for opt in select.select("option"):
        value = (opt.get("value") or "").strip()
        if value in skip_values:
            continue
        label = opt.get_text(strip=True)
        if strip_prefix and label.startswith(strip_prefix):
            label = label[len(strip_prefix) :].strip()
        if label and label not in values:
            countries.append(label)
            values[label] = value
    return countries, values


def scrape_generic(url: str, cfg: dict) -> list[dict]:
    name = cfg.get("name", url)
    extract_mode = cfg.get("extract_mode", "css_cards")
    pagination = cfg.get("pagination", {})
    ptype = pagination.get("type", "none")
    page_size = pagination.get("page_size", 25)
    max_pages = pagination.get("max_pages", _DEFAULT_MAX_PAGES)
    desc_sel = cfg.get("description_selector")
    jf_sel = cfg.get("job_function_selector")
    detail_loc_sel = cfg.get("detail_location_selector")
    json_desc_key = cfg.get("description_json_key")
    list_url = cfg.get("list_url", url)
    extra_params: dict = cfg.get("extra_params", {})
    country_filter_param: str | None = cfg.get("country_filter_param")
    countries: list[str] = cfg.get("countries", [])
    country_values: dict[str, str] = cfg.get("country_values", {})
    locale_param: str | None = cfg.get("locale_param")
    locales: list[str] = cfg.get("locales", [])

    # One Session per worker — a Session is not meant to be shared across threads.
    # sessions[0] is the one used wherever a fetch stays serial.
    sessions = [requests.Session() for _ in range(_concurrency(cfg))]
    session = sessions[0]

    country_from_select = cfg.get("country_from_select")
    if country_from_select and country_filter_param:
        countries, country_values = _countries_from_select(
            session, list_url, country_from_select
        )
        print(
            f"generic [{name}]: resolved {len(countries)} countries from <select>",
            file=sys.stderr,
        )

    if extract_mode == "phenom_api" and country_filter_param:
        countries = _phenom_tracked_countries(session, list_url, cfg)
        print(
            f"generic [{name}]: resolved {len(countries)} tracked countries from facet",
            file=sys.stderr,
        )

    if extract_mode == "xml_feed":
        jobs = _fetch_xml_feed(session, list_url, cfg)
        print(f"generic [{name}]: xml feed → {len(jobs)} jobs", file=sys.stderr)
        return jobs

    if extract_mode == "attribute_json":
        fetch_page = _fetch_attribute_json_page
    elif extract_mode == "script_json":
        fetch_page = _fetch_script_json_page
    elif extract_mode == "script_var_json":
        fetch_page = _fetch_script_var_json_page
    elif extract_mode == "phenom_api":
        fetch_page = _fetch_phenom_api_page
    elif extract_mode == "teamtailor":
        fetch_page = _fetch_teamtailor_page
    else:
        fetch_page = _fetch_css_cards_page

    # ── Phase 1: listing ──────────────────────────────────────────────────────
    # When country_filter_param + countries are set, iterate one paginated fetch
    # per country and merge results, tagging each job with its country (the filter
    # guarantees every result belongs to that country). Otherwise, a single fetch
    # set runs as before. country_values maps ISO codes to site-specific filter
    # values (e.g. SE → "3").
    #
    # locale_param + locales is a similar iterate-and-merge fetch, but for sites
    # (e.g. Carlsberg's SuccessFactors instance) where each locale returns a
    # different, non-overlapping slice of jobs across many countries rather than
    # a single-country filter — so results are merged without country tagging,
    # leaving per-job location text to resolve the country as usual.
    all_jobs: list[dict] = []
    seen_keys: set[str] = set()
    workers = len(sessions)

    if country_filter_param and countries:
        param_sets: list[tuple[dict, str | None]] = [
            ({**extra_params, country_filter_param: country_values.get(cc, cc)}, cc)
            for cc in countries
        ]
    elif locale_param and locales:
        param_sets = [({**extra_params, locale_param: loc}, None) for loc in locales]
    else:
        param_sets = [(dict(extra_params), None)]

    for base_params, country_code in param_sets:
        if country_code:
            label = country_code
        elif locale_param:
            label = base_params.get(locale_param, "")
        else:
            label = ""
        prefix = f"generic [{name}]{f' ({label})' if label else ''}"

        if ptype == "none":
            jobs = fetch_page(session, list_url, base_params, cfg)
            print(f"{prefix}: single page → {len(jobs)} jobs", file=sys.stderr)
            if not jobs and _last_response is not None:
                print(
                    f"{prefix}:   empty page — {describe_response(_last_response)}",
                    file=sys.stderr,
                )
            new_jobs = [j for j in jobs if job_key(j) not in seen_keys]
            for j in new_jobs:
                seen_keys.add(job_key(j))
                if country_code:
                    j["country_code"] = country_code
            all_jobs.extend(new_jobs)
        else:
            param_name = pagination["param"]
            param_join = pagination.get("param_join")

            def _params_for(
                page_num: int,
                base_params: dict = base_params,
                param_name: str = param_name,
                param_join: str | None = param_join,
            ) -> dict:
                page_value = _page_param_value(pagination, page_num)
                # Some sites pack the refinement and the page number into one
                # parameter (WPP: qs_search_job=refine.country=spain&page=2).
                # param_join appends the page value to whatever the country
                # filter already put there instead of overwriting it.
                if param_join and (refinement := base_params.get(param_name)):
                    page_value = f"{refinement}{param_join}{page_value}"
                return {**base_params, param_name: page_value}

            # Pages come in batches of `workers`. The end of the list is still a
            # page that returns fewer than page_size rows, and results are
            # consumed in order, so a batch that overshoots the last page is
            # simply discarded — the job set is identical to fetching serially.
            # (Overshooting is harmless even where a past-the-end page wraps back
            # to page 1, as Carlsberg's does: those rows are dropped here anyway.)
            done = False
            for batch_start in range(0, max_pages, workers):
                page_nums = list(
                    range(batch_start, min(batch_start + workers, max_pages))
                )
                pages = _map_concurrently(
                    lambda n, sess, _p=_params_for: fetch_page(
                        sess, list_url, _p(n), cfg
                    ),
                    page_nums,
                    workers,
                    sessions,
                )
                for page_num, jobs in zip(page_nums, pages, strict=True):
                    print(
                        f"{prefix}: {param_name}={_params_for(page_num)[param_name]}"
                        f" → {len(jobs)} jobs",
                        file=sys.stderr,
                    )
                    if not jobs and _last_response is not None:
                        print(
                            f"{prefix}:   empty page — {describe_response(_last_response)}",
                            file=sys.stderr,
                        )
                    new_jobs = [j for j in jobs if job_key(j) not in seen_keys]
                    for j in new_jobs:
                        seen_keys.add(job_key(j))
                        if country_code:
                            j["country_code"] = country_code
                    all_jobs.extend(new_jobs)

                    if len(jobs) < page_size:
                        done = True
                        break
                if done:
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

    # A job's country is already known and trustworthy when it came from a
    # country_filter_param pass (country_code set explicitly per-request) —
    # trust that over is_tracked_location(), which returns False outright for
    # a blank/missing location string. Without this, a job whose listing card
    # has an empty location field (seen on Sweco: some postings render
    # <em class="vacancy__location"> with no text) gets silently excluded from
    # detail-page enrichment. Its description never gets fetched via desc_sel,
    # and the TS-side fallback then does an unfiltered full-page fetch instead —
    # picking up local-language nav/cookie-consent/footer text and producing
    # false native-language-requirement signals on an English-language posting.
    # Every English-titled job in a tracked country fetches its detail page, even
    # when the listing already carried a description. A listing teaser cannot
    # stand in for the real posting: the Python-side language heuristic here
    # fires on a single non-ASCII character, while the classifier downstream
    # counts native characters and needs far more of them. Allianz's ~300-char
    # German teasers sit between the two, so short-circuiting on them silently
    # classified plainly German postings as English-friendly.
    english_jobs = [
        j
        for j in all_jobs
        if not _title_appears_non_english_excluding_cities(j.get("title", ""))
        and (j.get("country_code") or is_tracked_location(j.get("location")))
    ]
    multi_loc_jobs = (
        [j for j in all_jobs if detail_loc_sel and _is_multi_location(j)]
        if detail_loc_sel
        else []
    )

    # Skip the detail fetch for jobs whose outcome the Node server has cached — the
    # cached classification is used instead. Multi-location jobs are always fetched:
    # the detail page is what resolves their countries. Caveat: skipped jobs are not
    # checked for expired detail pages ("gone"), so a stale listing entry stays.
    jobs_needing_detail = {
        j["url"]
        for j in english_jobs
        if j.get("url") and not j.get("descriptionHtml") and not is_cached_job(j)
    }
    jobs_needing_detail.update(j["url"] for j in multi_loc_jobs if j.get("url"))
    unique_urls = list(dict.fromkeys(jobs_needing_detail))
    cached_skipped = sum(
        1
        for j in english_jobs
        if is_cached_job(j) and j["url"] not in jobs_needing_detail
    )
    print(
        f"generic [{name}]: fetching details for {len(unique_urls)} jobs "
        f"({cached_skipped} skipped — outcome cached)",
        file=sys.stderr,
    )

    detail_results = _map_concurrently(
        lambda job_url, sess: _fetch_detail_page(
            sess, job_url, cfg, desc_sel, jf_sel, detail_loc_sel, json_desc_key
        ),
        unique_urls,
        workers,
        sessions,
    )
    detail_cache: dict[str, tuple[str, str | None, list[str] | None, bool]] = dict(
        zip(unique_urls, detail_results, strict=True)
    )

    gone_urls: set[str] = {u for u, (_, _, _, gone) in detail_cache.items() if gone}
    if gone_urls:
        before = len(all_jobs)
        all_jobs = [j for j in all_jobs if j.get("url") not in gone_urls]
        print(
            f"generic [{name}]: dropped {before - len(all_jobs)} jobs with expired detail pages",
            file=sys.stderr,
        )

    for job in english_jobs:
        url = job.get("url", "")
        if url in gone_urls:
            continue
        desc_html, job_function, _, _ = detail_cache.get(url, ("", None, None, False))
        if desc_html:
            job["descriptionHtml"] = desc_html
        if job_function and not job.get("jobFunction"):
            job["jobFunction"] = job_function

    # Fan out multi-location jobs into one entry per resolved COUNTRY — not one
    # per location. A posting open in five Swiss cities is one position offered in
    # Switzerland, and emitting a row per city inflated the country's count
    # fivefold. The extra cities ride along in job["cities"], which the TypeScript
    # side uses verbatim instead of re-deriving them from the location string.
    # Locations whose country can't be identified keep the old one-row-each
    # behaviour, since there is nothing to group them by.
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
            grouped: dict[str, list[str]] = {}
            for loc in locations:
                grouped.setdefault(_country_key(loc), []).append(loc)
            for locs in grouped.values():
                copy = dict(job)
                copy["location"] = locs[0]
                cities = [c for c in (_city_of(loc) for loc in locs) if c]
                if cities:
                    copy["cities"] = cities
                expanded.append(copy)
        if len(expanded) != len(all_jobs):
            print(
                f"generic [{name}]: expanded multi-location jobs: {len(all_jobs)} → {len(expanded)}",
                file=sys.stderr,
            )
        all_jobs = expanded

    print(f"generic [{name}]: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
