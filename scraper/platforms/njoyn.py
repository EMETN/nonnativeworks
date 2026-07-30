"""
njoyn ATS — Playwright scraper.

Used by: cgi.njoyn.com and other njoyn-based career sites.
njoyn is a classic ASP app that tracks bots — Playwright is required to
establish a real browser session before any listing data is returned.
Pagination is driven by clicking the "Next" button rather than raw POSTs.
"""

import re
import sys
from urllib.parse import urljoin

from browser import _open_browser, _block_unnecessary_resources, _run_in_subprocess
from extract import build_job
from title_language import _title_appears_non_english

# ISO alpha-2 codes for countries tracked by NonNativeWorks.
# Used to filter njoyn results instead of scraping all ~3000 global jobs.
NJOYN_TRACKED_COUNTRIES = ["FI", "SE", "NO", "DK", "NL", "DE", "EE", "LV", "LT", "PL", "FR", "BE", "LU", "CH"]

# Country names (lowercase) expected for each tracked country code.
# Used to validate tombstone Country values against the active filter — some companies
# (e.g. CGI) list "any office location" jobs under every country, so the filter alone
# is not sufficient to exclude jobs whose primary location is elsewhere.
NJOYN_COUNTRY_NAMES: dict[str, list[str]] = {
    "FI": ["finland", "suomi"],
    "SE": ["sweden", "sverige"],
    "NO": ["norway", "norge"],
    "DK": ["denmark", "danmark"],
    "NL": ["netherlands", "nederland"],
    "DE": ["germany", "deutschland"],
    "EE": ["estonia", "eesti"],
    "LV": ["latvia", "latvija"],
    "LT": ["lithuania", "lietuva"],
    "PL": ["poland", "polska"],
    "FR": ["france"],
    "BE": ["belgium", "belgique", "belgië"],
    "LU": ["luxembourg"],
    "CH": ["switzerland", "schweiz", "suisse"],
}

# njoyn listing + description enrichment can take 30+ min for large companies.
NJOYN_SUBPROCESS_TIMEOUT = 3600


def scrape_njoyn_playwright(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_njoyn_playwright_inner, url, timeout=NJOYN_SUBPROCESS_TIMEOUT)


def _scrape_njoyn_playwright_inner(url: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        print("playwright not installed", file=sys.stderr)
        return []

    from bs4 import BeautifulSoup

    jobs: list[dict] = []
    seen: set[str] = set()

    with sync_playwright() as p:
        pw_page, cleanup = _open_browser(
            p,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )
        _block_unnecessary_resources(pw_page)

        try:
            print(f"njoyn: navigating to {url}", file=sys.stderr)
            pw_page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            pw_page.wait_for_timeout(2_000)

            for selector in ["[id*='cookie'] button", "[class*='cookie'] button", "[aria-label='Accept']", "#onetrust-accept-btn-handler"]:
                try:
                    pw_page.click(selector, timeout=2_000)
                except Exception:
                    pass

            # The country filter is hidden behind an "Advanced Search Parameters" button.
            # Click it to reveal the dropdown before checking for it.
            for selector in [
                "a:has-text('Advanced Search Parameters')",
                "button:has-text('Advanced Search Parameters')",
                "a:has-text('Advanced Search')",
                "button:has-text('Advanced Search')",
                "input[value*='Advanced Search']",
                "[id*='advanced' i]",
            ]:
                try:
                    pw_page.click(selector, timeout=3_000)
                    pw_page.wait_for_timeout(1_000)
                    break
                except Exception:
                    pass

            # Check if the page has a country filter dropdown (Inp_country).
            # If so, scrape each tracked country separately to avoid fetching
            # all ~3000 global jobs.
            country_select = pw_page.query_selector(
                "select[name='Inp_country'], select#Inp_country, "
                "select[name*='country' i], select[id*='country' i]"
            )
            # Fall back: find a <select> near a label whose text contains "Country"
            if not country_select:
                for label in pw_page.query_selector_all("label, td, th, span"):
                    try:
                        if "country" in (label.inner_text() or "").lower():
                            # Look for a sibling or nearby select
                            sel = label.query_selector("select") or pw_page.query_selector(
                                f"select[id='{label.get_attribute('for')}']"
                            )
                            if sel:
                                country_select = sel
                                break
                    except Exception:
                        pass

            if country_select:
                select_name = country_select.get_attribute("name") or country_select.get_attribute("id") or "country"
                available = [
                    o.get_attribute("value")
                    for o in country_select.query_selector_all("option")
                    if o.get_attribute("value")
                ]
                countries_to_scrape = [c for c in NJOYN_TRACKED_COUNTRIES if c in available]
                print(f"njoyn: country filter found — scraping {countries_to_scrape}", file=sys.stderr)
            else:
                countries_to_scrape = [None]  # None = no filter, scrape all
                print("njoyn: no country filter found — scraping all", file=sys.stderr)

            for country_code in countries_to_scrape:
                if country_code:
                    print(f"njoyn: selecting country {country_code}", file=sys.stderr)

                    # Navigate back to page 1 of the listing before applying filter
                    pw_page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                    pw_page.wait_for_timeout(1_500)

                    # Re-open Advanced Search if needed
                    for adv_sel in ["a:has-text('Advanced Search Parameters')", "a:has-text('Advanced Search')", "input[value*='Advanced Search']"]:
                        try:
                            pw_page.click(adv_sel, timeout=2_000)
                            pw_page.wait_for_timeout(800)
                            break
                        except Exception:
                            pass

                    # Re-query the select on every iteration — the element handle
                    # goes stale after each page navigation
                    current_select = pw_page.query_selector(
                        "select[name='Inp_country'], select#Inp_country, "
                        "select[name*='country' i], select[id*='country' i]"
                    )
                    if not current_select:
                        print(f"njoyn: country dropdown not found for {country_code}, skipping", file=sys.stderr)
                        continue

                    current_select.select_option(country_code)
                    submit = (
                        pw_page.query_selector("input[value*='Search' i]")
                        or pw_page.query_selector("button:has-text('Search')")
                        or pw_page.query_selector("input[type='submit']")
                        or pw_page.query_selector("button[type='submit']")
                    )
                    if submit:
                        submit.click()
                    else:
                        current_select.press("Enter")
                    try:
                        pw_page.wait_for_load_state("domcontentloaded", timeout=15_000)
                        pw_page.wait_for_timeout(1_500)
                    except PWTimeout:
                        print(f"njoyn: timed out loading country {country_code}", file=sys.stderr)
                        continue

                page_num = 1
                while True:
                    print(f"njoyn: extracting page {page_num}" + (f" [{country_code}]" if country_code else ""), file=sys.stderr)

                    # Retry page.content() once — it can fail if the page is mid-navigation
                    try:
                        html = pw_page.content()
                    except Exception:
                        pw_page.wait_for_timeout(2_000)
                        html = pw_page.content()

                    # Use the actual current URL (after any redirects) as base for link resolution
                    page_base_url = pw_page.url or url

                    soup = BeautifulSoup(html, "html.parser")
                    page_jobs = extract_njoyn_jobs(soup, page_base_url)

                    new_count = 0
                    for job in page_jobs:
                        key = job.get("url") or job["title"].lower()
                        if key not in seen:
                            seen.add(key)
                            if country_code:
                                # Validate tombstone Country against the filter to exclude
                                # "any office location" jobs whose primary location is elsewhere.
                                tc = (job.pop("tombstone_country", None) or "").lower()
                                if tc:
                                    expected = NJOYN_COUNTRY_NAMES.get(country_code, [])
                                    if expected and not any(name in tc for name in expected):
                                        print(f"njoyn: skipping '{job['title']}' — tombstone country '{tc}' doesn't match filter {country_code}", file=sys.stderr)
                                        continue
                                job["country_code"] = country_code
                            else:
                                job.pop("tombstone_country", None)
                            jobs.append(job)
                            new_count += 1

                    print(f"njoyn: page {page_num} — {new_count} new jobs ({len(jobs)} total)", file=sys.stderr)

                    next_el = (
                        pw_page.query_selector("a[title='Next']")
                        or pw_page.query_selector("a:has-text('Next')")
                        or pw_page.query_selector("input[value='Next']")
                        or pw_page.query_selector("button:has-text('Next')")
                    )
                    if not next_el or new_count == 0:
                        break

                    try:
                        next_el.click()
                        pw_page.wait_for_load_state("domcontentloaded", timeout=15_000)
                        pw_page.wait_for_timeout(1_500)
                        page_num += 1
                    except PWTimeout:
                        print("njoyn: timed out waiting for next page", file=sys.stderr)
                        break

            # Enrich English-titled jobs with description HTML fetched through the
            # existing browser session (njoyn blocks plain static fetches via bot detection).
            _enrich_njoyn_descriptions(pw_page, jobs)
            jobs = [j for j in jobs if not j.pop("_placeholder", False)]

        finally:
            cleanup()

    return jobs


_NJOYN_DESC_SELECTORS = [
    # njoyn/classic-ASP detail page — most specific first
    "#divJobDescription",
    "#JobDescription",
    "#jobDescription",
    "#job-description",
    ".job-description",
    "#divJobDetails",
    "#JobDetails",
    # Generic fallbacks: any block-level element whose id/class contains "description"
    "div[id*='escription']",
    "div[class*='escription']",
    "td[id*='escription']",
    # CGI njoyn pages
    ".job-posting-content",
]


_BOILERPLATE_HEADING_RE = re.compile(
    r"what you can expect from us|about cgi|about us|why join us|who we are",
    re.IGNORECASE,
)


def _strip_boilerplate_sections(el) -> None:
    """Remove job-info-row divs whose heading matches known boilerplate patterns.

    CGI njoyn pages append a localised "What you can expect from us" section
    after the English job description. This section is written in the country's
    local language and causes the language classifier to incorrectly flag the
    position as requiring that language.
    """
    for div in el.find_all("div", class_="job-info-row"):
        heading = div.find(["h1", "h2", "h3", "h4"])
        if heading and _BOILERPLATE_HEADING_RE.search(heading.get_text()):
            div.decompose()


def _extract_description_html(full_html: str) -> str:
    """Return the description section HTML from a njoyn detail page.

    Tries known container selectors in order; falls back to the full page only
    when none match. Keeping only the relevant section reduces per-job memory
    from ~100 KB to ~5–15 KB, which matters when enriching hundreds of jobs.
    Boilerplate sections are stripped from the soup before selector matching so
    they are removed regardless of whether a specific selector matches.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(full_html, "html.parser")
    _strip_boilerplate_sections(soup)
    for selector in _NJOYN_DESC_SELECTORS:
        el = soup.select_one(selector)
        if el:
            return str(el)
    return str(soup)


_MIN_DESCRIPTION_TEXT_LENGTH = 30


def _enrich_njoyn_descriptions(pw_page, jobs: list[dict]) -> None:
    """Fetch individual job detail pages for English-titled jobs via the existing browser session.

    Jobs whose description text is shorter than _MIN_DESCRIPTION_TEXT_LENGTH after stripping
    HTML are marked with _placeholder=True so the caller can filter them out.
    """
    targets = [j for j in jobs if j.get("url") and not _title_appears_non_english(j.get("title", ""))]
    if not targets:
        return

    import re as _re
    _strip_tags = _re.compile(r"<[^>]+>")

    print(f"njoyn: fetching descriptions for {len(targets)} English-titled jobs", file=sys.stderr)
    for i, job in enumerate(targets):
        try:
            pw_page.goto(job["url"], wait_until="domcontentloaded", timeout=20_000)
            pw_page.wait_for_timeout(500)
            html = _extract_description_html(pw_page.content())
            plain = _strip_tags.sub(" ", html).strip()
            if len(plain) < _MIN_DESCRIPTION_TEXT_LENGTH:
                print(f"njoyn: skipping '{job['title']}' — placeholder description ({len(plain)} chars)", file=sys.stderr)
                job["_placeholder"] = True
            else:
                job["descriptionHtml"] = html
        except Exception as e:
            print(f"njoyn: description fetch failed for {job['url']}: {e}", file=sys.stderr)
        if (i + 1) % 5 == 0:
            print(f"njoyn: enriched {i + 1}/{len(targets)} descriptions", file=sys.stderr)


def extract_njoyn_jobs(soup, base_url: str) -> list[dict]:
    """Extract jobs from a njoyn/xweb listing page.

    The page uses a jQuery accordion: each job is an <h2> followed by a <div>
    containing tombstone rows (Category, City, Country) and a detail link.

    <div id="accordion">
      <h2>J0326-1532 - ITSM-arkkitehti</h2>
      <div>
        <div class="row">
          <span class="tombstonelabel">City</span>
          <span class="tombstonevalue">Helsinki</span>
        </div>
        <div class="row">
          <a href="XWeb.asp?...&Page=JobDetails&Jobid=J0326-1532...">View Job Details</a>
        </div>
      </div>
    """
    jobs = []
    accordion = soup.find(id="accordion") or soup

    for h2 in accordion.find_all("h2"):
        raw_heading = h2.get_text(strip=True)
        # Strip job ID prefix: "J0326-1532 - ITSM-arkkitehti" → "ITSM-arkkitehti"
        if " - " in raw_heading:
            title = raw_heading.split(" - ", 1)[1].strip()
        else:
            title = raw_heading

        if not title or len(title) < 2 or len(title) > 120:
            continue

        # The details div is the next sibling of the h2
        detail_div = h2.find_next_sibling("div")
        if not detail_div:
            continue

        # Extract tombstone values by label. Captures the loop variable `detail_div`,
        # but is only ever called synchronously within this same iteration (never
        # stored/deferred), so it can't observe a later h2's value.
        def tombstone(label: str) -> str | None:  # noqa: B023
            for row in detail_div.find_all(class_="tombstonelabel"):
                if label.lower() in row.get_text(strip=True).lower():
                    val = row.find_next_sibling(class_="tombstonevalue")
                    if val:
                        return val.get_text(strip=True) or None
            return None

        city = tombstone("City")
        tombstone_country = tombstone("Country")

        # URL from the "View Job Details" link
        link = detail_div.find("a", href=re.compile(r"JobDetails|jobdetails|Jobid", re.I))
        href = link.get("href", "") if link else ""
        job_url = urljoin(base_url, href) if href else None

        job = build_job(title, job_url, city)
        if tombstone_country:
            job["tombstone_country"] = tombstone_country
        jobs.append(job)

    return jobs
