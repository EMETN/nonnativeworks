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

import contextlib
import json as json_mod
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job, job_key, LOCATION_CLASS_PATTERNS
from title_language import _title_appears_non_english_excluding_cities
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
    fields = cfg.get("fields", {})
    script_key = cfg["script_key"]
    title_field = fields.get("title", "title")
    url_field = fields.get("url", "url")
    locations_field = fields.get("locations")
    loc_subfield = fields.get("location_subfield")
    ctry_subfield = fields.get("country_subfield")
    jf_field = fields.get("job_function")

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

        raw_url = _get_nested(item, url_field) if url_field else None
        job_url = urljoin(base_url, raw_url) if raw_url else None
        jf = _get_nested(item, jf_field) if jf_field else None
        loc_objs = _get_nested(item, locations_field) if locations_field else []
        if not isinstance(loc_objs, list):
            loc_objs = []

        if loc_objs and ctry_subfield:
            for loc_obj in loc_objs:
                if not isinstance(loc_obj, dict):
                    continue
                country = loc_obj.get(ctry_subfield)
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
        resp = session.get(url, timeout=30, headers=_HEADERS)
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
            # page structures would risk pulling in unrelated content.
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
    list_url = cfg.get("list_url", url)
    extra_params: dict = cfg.get("extra_params", {})
    country_filter_param: str | None = cfg.get("country_filter_param")
    countries: list[str] = cfg.get("countries", [])
    country_values: dict[str, str] = cfg.get("country_values", {})

    session = requests.Session()

    country_from_select = cfg.get("country_from_select")
    if country_from_select and country_filter_param:
        countries, country_values = _countries_from_select(
            session, list_url, country_from_select
        )
        print(
            f"generic [{name}]: resolved {len(countries)} countries from <select>",
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
    elif extract_mode == "teamtailor":
        fetch_page = _fetch_teamtailor_page
    else:
        fetch_page = _fetch_css_cards_page

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
                params = {
                    **base_params,
                    param_name: _page_param_value(pagination, page_num),
                }
                jobs = fetch_page(session, list_url, params, cfg)
                print(
                    f"{prefix}: {param_name}={params[param_name]} → {len(jobs)} jobs",
                    file=sys.stderr,
                )

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

    jobs_needing_detail = {j["url"] for j in english_jobs if j.get("url")}
    jobs_needing_detail.update(j["url"] for j in multi_loc_jobs if j.get("url"))
    unique_urls = list(dict.fromkeys(jobs_needing_detail))
    print(
        f"generic [{name}]: fetching details for {len(unique_urls)} jobs",
        file=sys.stderr,
    )

    detail_cache: dict[str, tuple[str, str | None, list[str] | None, bool]] = {}
    for i, job_url in enumerate(unique_urls):
        result = _fetch_detail_page(session, job_url, desc_sel, jf_sel, detail_loc_sel)
        detail_cache[job_url] = result
        if (i + 1) % 10 == 0:
            print(
                f"generic [{name}]: enriched {i + 1}/{len(unique_urls)}",
                file=sys.stderr,
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
            print(
                f"generic [{name}]: expanded multi-location jobs: {len(all_jobs)} → {len(expanded)}",
                file=sys.stderr,
            )
        all_jobs = expanded

    print(f"generic [{name}]: done — {len(all_jobs)} total jobs", file=sys.stderr)
    return all_jobs
