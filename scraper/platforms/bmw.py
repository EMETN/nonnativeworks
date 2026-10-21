"""
BMW Group — static scraper.

www.bmwgroup.jobs is an AEM site whose job listing is a client-side widget, but
the widget's data is a server-rendered fragment that can be fetched directly:

    /en/_jcr_content/.../jobfinder30.jobfinder_table.content.html

One request returns the whole board — all vacancies worldwide, no pagination —
with every field already in data attributes on each row (title, location, job
field, posting date, job id, and the detail-page link). So no browser is needed.

The catch is the location: rows carry a bare city ("Munich", "Athens") with no
country, which CITY_MAP resolves for only about two thirds of them and has to
guess at for the ambiguous ones (Athens, Greece vs Athens, Georgia — BMW means
Greece). The page's own location filter settles it: a two-level checkbox list
whose values are "DE" at level 1 and "DE/Munich" at level 2, i.e. an
authoritative city -> ISO country map maintained by BMW itself. Reading it live
means a newly opened site resolves without a code change, the same trick the
Sweco config uses for its country <select>.

BMW is not consistent about how it spells a city between the two places
("DEBRECEN" vs "Debrecen", "MexicoCity" vs "Mexico City", "Spartanburg" vs
"Spartanburg, SC"), hence the normalising join in _city_key.

Descriptions are fetched here rather than left to the TypeScript side, which
would store the whole page: BMW serves local-language postings under English
chrome (a Breda job titled "Account manager binnendienst" has a fully Dutch
body), so the surrounding English nav and footer would dilute the very signal
the classifier needs. Only English-titled jobs in tracked countries are
fetched — a non-English title is already decisive, and an untracked country is
dropped downstream regardless.
"""

import html as html_mod
import re
import sys
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from extract import build_job, is_cached_job
from title_language import _title_appears_non_english_excluding_cities
from tracked_countries import is_tracked_location

LIST_URL = "https://www.bmwgroup.jobs/en.html"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
}

# The posting body. Everything else on the page is site chrome in the page's
# language, which must not reach the language classifier.
_DESCRIPTION_SELECTOR = ".grp-jobdescription__content"

_TIMEOUT = 30

# www.bmwgroup.jobs sits behind Akamai, whose edge IPs rotate on a short TTL. A
# single dropped connection on the landing page would otherwise read as an empty
# board and end the run at zero, so the two listing fetches are worth retrying.
_MAX_RETRIES = 3


def _get(session: requests.Session, url: str, retries: int = 0) -> requests.Response:
    """session.get with a short exponential backoff on connection errors."""
    for attempt in range(retries + 1):
        try:
            resp = session.get(url, timeout=_TIMEOUT, headers=_HEADERS)
            resp.raise_for_status()
            return resp
        except Exception:
            if attempt == retries:
                raise
            print(f"bmw: retrying {url} ({attempt + 1}/{retries})", file=sys.stderr)
            time.sleep(2**attempt)
    raise RuntimeError("unreachable")


def _city_key(city: str) -> str:
    """Normalise a city name for joining the job rows to the location filter.

    Case, spacing and punctuation differ between the two ("DEBRECEN"/"Debrecen",
    "MexicoCity"/"Mexico City"), and job rows add a US state suffix the filter
    omits ("Spartanburg, SC"/"Spartanburg").
    """
    key = city.strip().lower()
    key = re.sub(r",\s*[a-z]{2}$", "", key)
    return re.sub(r"[^a-z0-9]", "", key)


def _location_map(soup: BeautifulSoup) -> dict[str, str]:
    """Build {normalised city -> ISO country code} from the location filter.

    The filter renders one <div class="grp-dd-item level-N" data-value="..."> per
    option: level 1 is a country ("DE"), level 2 a city within it ("DE/Munich").
    Only the location dropdown is read — the job-field and job-type dropdowns use
    the same markup, and their values would otherwise pollute the map.
    """
    dropdown = soup.select_one(".grp-jobfinder-filter-dropdown.location")
    if dropdown is None:
        print("bmw: location filter not found", file=sys.stderr)
        return {}

    mapping: dict[str, str] = {}
    for item in dropdown.select(".grp-dd-item.level-2[data-value]"):
        value = item["data-value"]
        if "/" not in value:
            continue
        country_code, city = value.split("/", 1)
        if city:
            mapping[_city_key(city)] = country_code
    return mapping


def _fragment_url(page_url: str, soup: BeautifulSoup) -> str | None:
    """Resolve the jobfinder fragment URL from the page's own data attribute.

    The path embeds AEM's authoring structure (.../layoutcontainer_5337/...),
    which is not ours to predict — reading it keeps a re-authored page working.
    """
    node = soup.select_one(".grp-jobfinder[data-jobfinder-path]")
    if node is None:
        print("bmw: data-jobfinder-path not found", file=sys.stderr)
        return None
    # The path is relative to the page resource, i.e. the URL without ".html".
    return urljoin(
        page_url, re.sub(r"\.html$", "", page_url) + node["data-jobfinder-path"]
    )


def _parse_jobs(
    fragment: bytes, base_url: str, city_to_country: dict[str, str]
) -> list[dict]:
    soup = BeautifulSoup(fragment, "html.parser")
    jobs: list[dict] = []
    unmapped: set[str] = set()

    for wrapper in soup.select(".grp-jobfinder__wrapper[data-job-id]"):
        cell = wrapper.select_one("[data-job-title]")
        link = wrapper.select_one("a[href]")
        if cell is None:
            continue

        # The fragment double-escapes entities, so a single unescape leaves
        # "&amp;" sitting in the title ("Incident &amp; Investigation").
        title = html_mod.unescape(
            html_mod.unescape(cell.get("data-job-title", ""))
        ).strip()
        if not title:
            continue

        city = (cell.get("data-job-location") or "").strip()
        job = build_job(
            title,
            urljoin(base_url, link["href"]) if link else None,
            city or None,
        )

        country_code = city_to_country.get(_city_key(city)) if city else None
        if country_code:
            # Authoritative, so it takes priority over the city lookup downstream.
            job["country_code"] = country_code
            job["city"] = city
        elif city:
            unmapped.add(city)

        if job_field := (cell.get("data-job-field") or "").strip():
            job["jobFunction"] = job_field

        jobs.append(job)

    if unmapped:
        print(
            f"bmw: {len(unmapped)} location(s) missing from the filter map, "
            f"falling back to city lookup: {sorted(unmapped)}",
            file=sys.stderr,
        )
    return jobs


def _enrich_descriptions(session: requests.Session, jobs: list[dict]) -> None:
    targets = [
        job
        for job in jobs
        if job.get("url")
        and not _title_appears_non_english_excluding_cities(job["title"])
        and is_tracked_location(job.get("country_code") or job.get("location"))
        and not is_cached_job(job)
    ]
    print(
        f"bmw: fetching descriptions for {len(targets)} of {len(jobs)} jobs",
        file=sys.stderr,
    )

    for i, job in enumerate(targets):
        try:
            resp = _get(session, job["url"])
        except Exception as e:
            print(f"bmw: detail fetch failed ({job['url']}): {e}", file=sys.stderr)
            continue
        content = BeautifulSoup(resp.content, "html.parser").select_one(
            _DESCRIPTION_SELECTOR
        )
        if content is not None:
            job["descriptionHtml"] = str(content)
        if (i + 1) % 50 == 0:
            print(f"bmw: enriched {i + 1}/{len(targets)}", file=sys.stderr)


def scrape_bmw_static(url: str) -> list[dict]:
    session = requests.Session()
    try:
        resp = _get(session, LIST_URL, retries=_MAX_RETRIES)
    except Exception as e:
        print(f"bmw: fetch error ({LIST_URL}): {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.content, "html.parser")
    city_to_country = _location_map(soup)
    fragment_url = _fragment_url(LIST_URL, soup)
    if not fragment_url:
        return []
    print(
        f"bmw: {len(city_to_country)} cities in the location filter; "
        f"fragment {fragment_url}",
        file=sys.stderr,
    )

    try:
        fragment = _get(session, fragment_url, retries=_MAX_RETRIES)
    except Exception as e:
        print(f"bmw: fetch error ({fragment_url}): {e}", file=sys.stderr)
        return []

    jobs = _parse_jobs(fragment.content, LIST_URL, city_to_country)
    print(f"bmw: parsed {len(jobs)} jobs", file=sys.stderr)
    _enrich_descriptions(session, jobs)
    return jobs
