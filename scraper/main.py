#!/usr/bin/env python3
"""
Layer 2 scraper for NonNativeWorks.

Usage:
    python3 main.py <career-page-url>

Outputs a JSON array of RawJob objects to stdout.
Errors and progress messages go to stderr.

Two-stage strategy:
  1. Static HTTP fetch + BeautifulSoup (+ platform detection)
  2. Playwright headless Chromium — site-specific handler if known platform,
     otherwise generic fallback (if static yields too few results)
"""

import json
import multiprocessing
import os
import queue
import re
import sys
from urllib.parse import urljoin, urlparse

PLAYWRIGHT_TIMEOUT_SECONDS = 600  # hard wall-clock limit for any Playwright scrape

# Set PLAYWRIGHT_CDP_URL to connect to a browser running outside the container
# instead of launching Chromium locally (recommended on WSL2 devcontainers).
#
# How to start Chrome on Windows with remote debugging:
#   chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
#
# Then set in your shell before running the scraper:
#   export PLAYWRIGHT_CDP_URL=http://host.docker.internal:9222
PLAYWRIGHT_CDP_URL = os.environ.get("PLAYWRIGHT_CDP_URL")


def _open_browser(p, *, user_agent: str | None = None, viewport: dict | None = None):
    """
    Returns (page, cleanup_fn).
    If PLAYWRIGHT_CDP_URL is set, connects to an existing browser via CDP —
    no Chromium process is spawned inside the container.
    Otherwise falls back to launching a local headless Chromium.
    """
    if PLAYWRIGHT_CDP_URL:
        _log(f"CDP: connecting to browser at {PLAYWRIGHT_CDP_URL}")
        browser = p.chromium.connect_over_cdp(PLAYWRIGHT_CDP_URL)
        ctx_kwargs: dict = {}
        if user_agent:
            ctx_kwargs["user_agent"] = user_agent
        if viewport:
            ctx_kwargs["viewport"] = viewport
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        def cleanup():
            context.close()
            # Don't close the shared browser — just disconnect

        return page, cleanup
    else:
        _log("No CDP URL set — launching local Chromium (may be unstable on WSL2)")
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-default-apps",
                "--no-first-run",
            ],
        )
        context = browser.new_context(
            **({"user_agent": user_agent} if user_agent else {}),
            **({"viewport": viewport} if viewport else {}),
        )
        page = context.new_page()

        def cleanup():
            browser.close()

        return page, cleanup


# Resource types that are never needed for job listing extraction.
# Blocking them prevents the firewall from being flooded with REJECT responses
# for CDN/tracker domains and keeps Chromium's memory footprint small.
_BLOCK_RESOURCE_TYPES = {"image", "media", "font", "websocket", "other"}

def _block_unnecessary_resources(page) -> None:
    """Abort requests for resource types that aren't needed to scrape job listings."""
    def _handle(route):
        if route.request.resource_type in _BLOCK_RESOURCE_TYPES:
            route.abort()
        else:
            route.continue_()
    page.route("**/*", _handle)


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _mem_mb() -> int:
    """Read available memory from /proc/meminfo (Linux only)."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return -1


def _run_in_subprocess(fn, *args) -> list[dict]:
    """
    Run fn(*args) in a child process with a hard timeout.
    If the child crashes or times out it cannot kill the parent,
    so VS Code keeps its connection to the container.
    """
    result_q: multiprocessing.Queue = multiprocessing.Queue()

    def worker():
        try:
            jobs = fn(*args)
            result_q.put(("ok", jobs))
        except Exception as e:
            result_q.put(("err", str(e)))

    proc = multiprocessing.Process(target=worker, daemon=True)
    _log(f"[subprocess] starting {fn.__name__} (available RAM: {_mem_mb()} MB)")
    proc.start()

    # Read from the queue BEFORE joining — if the result is large it fills the
    # pipe buffer and the child blocks, causing a deadlock with proc.join().
    try:
        status, data = result_q.get(timeout=PLAYWRIGHT_TIMEOUT_SECONDS)
    except queue.Empty:
        _log(f"[subprocess] {fn.__name__} exceeded {PLAYWRIGHT_TIMEOUT_SECONDS}s — killing")
        proc.kill()
        proc.join()
        return []

    proc.join()
    exit_code = proc.exitcode
    if exit_code != 0:
        _log(f"[subprocess] {fn.__name__} exited with code {exit_code} (crash/OOM?)")
        return []

    if status == "err":
        _log(f"[subprocess] {fn.__name__} error: {data}")
        return []

    _log(f"[subprocess] {fn.__name__} done (available RAM after: {_mem_mb()} MB)")
    return data


MIN_JOBS_STATIC = 3  # If static scrape finds fewer than this, try Playwright

PLATFORM_ATTRAX = "attrax"
PLATFORM_NJOYN = "njoyn"

# Some career sites cap unfiltered results (e.g. 250 of 400+ jobs).
# These overrides replace the input URL with a pre-filtered one that
# covers only tracked countries, ensuring full coverage.
URL_OVERRIDES: dict[str, tuple[str, str]] = {
    # key: matched against the input URL (substring)
    # value: (replacement_url, human-readable note for terminal output)
    "careers.tieto.com": (
        "https://careers.tieto.com/jobs?options=283%2C286%2C288%2C305%2C313%2C316%2C320%2C354",
        "Tieto caps unfiltered results at 250 — filtering by tracked countries (FI, SE, NO, DK, NL, DE, EST, LAT, LIT)",
    ),
}


def detect_platform(html: str, url: str = "") -> str | None:
    """Detect the ATS platform from page HTML or URL."""
    if "attrax-vacancy-tile" in html:
        return PLATFORM_ATTRAX
    if "njoyn.com" in url:
        return PLATFORM_NJOYN
    return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 main.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]

    for pattern, (override_url, note) in URL_OVERRIDES.items():
        if pattern in url:
            print(f"URL override: {note}", file=sys.stderr)
            url = override_url
            break

    print(f"Scraping: {url}", file=sys.stderr)

    # Detect platform from URL alone before attempting a static fetch —
    # some platforms (e.g. njoyn) redirect plain HTTP requests to bot-detection
    # services, so a static scrape is both useless and counterproductive.
    platform = detect_platform("", url)
    jobs: list[dict] = []

    if platform == PLATFORM_NJOYN:
        print("njoyn detected — skipping static scrape, going straight to Playwright", file=sys.stderr)
        try:
            jobs = scrape_njoyn_playwright(url)
            print(f"njoyn Playwright found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"njoyn Playwright failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    html, jobs = scrape_static(url)
    print(f"Static scrape found {len(jobs)} jobs", file=sys.stderr)

    platform = detect_platform(html, url)
    if platform:
        print(f"Detected platform: {platform} — using dedicated Playwright scraper", file=sys.stderr)

    if platform == PLATFORM_ATTRAX:
        try:
            jobs_static = scrape_attrax_static(url)
            print(f"Attrax static scrape found {len(jobs_static)} jobs", file=sys.stderr)
            if len(jobs_static) > len(jobs):
                jobs = jobs_static
        except Exception as e:
            print(f"Attrax static scrape failed: {e}", file=sys.stderr)
        if len(jobs) < MIN_JOBS_STATIC:
            print("Attrax static yielded too few — trying Playwright...", file=sys.stderr)
            try:
                jobs_pw = scrape_attrax_playwright(url)
                print(f"Attrax Playwright found {len(jobs_pw)} jobs", file=sys.stderr)
                if len(jobs_pw) > len(jobs):
                    jobs = jobs_pw
            except Exception as e:
                print(f"Attrax Playwright failed: {e}", file=sys.stderr)
    elif len(jobs) < MIN_JOBS_STATIC:
        print("Falling back to generic Playwright...", file=sys.stderr)
        try:
            jobs_pw = scrape_playwright(url)
            print(f"Playwright found {len(jobs_pw)} jobs", file=sys.stderr)
            if len(jobs_pw) > len(jobs):
                jobs = jobs_pw
        except Exception as e:
            print(f"Playwright failed: {e}", file=sys.stderr)

    print(json.dumps(jobs, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Static scraper
# ---------------------------------------------------------------------------

def scrape_static(url: str) -> tuple[str, list[dict]]:
    """Returns (raw_html, jobs). raw_html is used for platform detection."""
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("requests/beautifulsoup4 not installed", file=sys.stderr)
        return "", []

    try:
        resp = requests.get(
            url,
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"HTTP error: {e}", file=sys.stderr)
        return "", []

    soup = BeautifulSoup(resp.content, "html.parser")
    return soup.decode(), extract_jobs(soup, url)


# ---------------------------------------------------------------------------
# Playwright scraper
# ---------------------------------------------------------------------------

def scrape_playwright(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_playwright_inner, url)


def _scrape_playwright_inner(url: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — run: pip install playwright && playwright install chromium", file=sys.stderr)
        return []

    with sync_playwright() as p:
        page, cleanup = _open_browser(
            p, user_agent="Mozilla/5.0"
        )
        _block_unnecessary_resources(page)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_timeout(2_000)
            for selector in ["[id*='cookie'] button", "[class*='cookie'] button", "[aria-label='Accept']"]:
                try:
                    page.click(selector, timeout=2_000)
                except Exception:
                    pass
            html = page.content()
        finally:
            cleanup()

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    return extract_jobs(soup, url)


# ---------------------------------------------------------------------------
# njoyn ATS — Playwright scraper
# Used by: cgi.njoyn.com and other njoyn-based career sites
# njoyn is a classic ASP app that tracks bots — Playwright is required to
# establish a real browser session before any listing data is returned.
# Pagination is driven by clicking the "Next" button rather than raw POSTs.
# ---------------------------------------------------------------------------

def scrape_njoyn_playwright(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_njoyn_playwright_inner, url)


# ISO alpha-2 codes for countries tracked by NonNativeWorks.
# Used to filter njoyn results instead of scraping all ~3000 global jobs.
NJOYN_TRACKED_COUNTRIES = ["FI", "SE", "NO", "DK", "NL", "DE", "EE", "LV", "LT"]


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
                                job["country_code"] = country_code
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

        finally:
            cleanup()

    return jobs


def _enrich_njoyn_descriptions(pw_page, jobs: list[dict]) -> None:
    """Fetch individual job detail pages for English-titled jobs via the existing browser session."""
    import re as _re

    _NON_ASCII = _re.compile(r"[äöüåéèêëàâîïôùûçñßãõøæœ]", _re.IGNORECASE)

    targets = [j for j in jobs if j.get("url") and not _NON_ASCII.search(j.get("title", ""))]
    if not targets:
        return

    print(f"njoyn: fetching descriptions for {len(targets)} English-titled jobs", file=sys.stderr)
    for i, job in enumerate(targets):
        try:
            pw_page.goto(job["url"], wait_until="domcontentloaded", timeout=20_000)
            pw_page.wait_for_timeout(500)
            job["descriptionHtml"] = pw_page.content()
        except Exception as e:
            print(f"njoyn: description fetch failed for {job['url']}: {e}", file=sys.stderr)
        if (i + 1) % 10 == 0:
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

        if not title or len(title) > 120:
            continue

        # The details div is the next sibling of the h2
        detail_div = h2.find_next_sibling("div")
        if not detail_div:
            continue

        # Extract tombstone values by label
        def tombstone(label: str) -> str | None:
            for row in detail_div.find_all(class_="tombstonelabel"):
                if label.lower() in row.get_text(strip=True).lower():
                    val = row.find_next_sibling(class_="tombstonevalue")
                    if val:
                        return val.get_text(strip=True) or None
            return None

        city = tombstone("City")

        # URL from the "View Job Details" link
        link = detail_div.find("a", href=re.compile(r"JobDetails|jobdetails|Jobid", re.I))
        href = link.get("href", "") if link else ""
        job_url = urljoin(base_url, href) if href else None

        jobs.append(build_job(title, job_url, city))

    return jobs


# ---------------------------------------------------------------------------
# Attrax ATS — paginated Playwright scraper
# Used by: careers.tieto.com and other Attrax-based career sites
# ---------------------------------------------------------------------------

def scrape_attrax_static(url: str) -> list[dict]:
    """Iterate ?page=N with plain requests — works if Attrax renders server-side."""
    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urlparse, urlencode, urlunparse, parse_qs

    def page_url(base: str, n: int) -> str:
        parsed = urlparse(base)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params["page"] = [str(n)]
        return urlunparse(parsed._replace(query=urlencode(params, doseq=True)))

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)"

    jobs: list[dict] = []
    seen: set[str] = set()
    page_num = 1

    while True:
        target = page_url(url, page_num)
        print(f"Attrax static: fetching page {page_num} ({target})", file=sys.stderr)
        try:
            resp = session.get(target, timeout=20)
            resp.raise_for_status()
        except Exception as e:
            print(f"Attrax static: HTTP error on page {page_num}: {e}", file=sys.stderr)
            break

        soup = BeautifulSoup(resp.content, "html.parser")
        page_jobs = extract_attrax_jobs(soup, url)

        if not page_jobs:
            break

        new_count = 0
        for job in page_jobs:
            key = job.get("url") or f"{job['title'].lower()}|{job.get('location', '')}"
            if key not in seen:
                seen.add(key)
                jobs.append(job)
                new_count += 1

        print(f"Attrax static: page {page_num} — {new_count} new jobs ({len(jobs)} total)", file=sys.stderr)

        if new_count == 0:
            break

        page_num += 1

    return jobs


def scrape_attrax_playwright(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_attrax_playwright_inner, url)


def _scrape_attrax_playwright_inner(url: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed", file=sys.stderr)
        return []

    from bs4 import BeautifulSoup
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

    def page_url(base: str, n: int) -> str:
        parsed = urlparse(base)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params["page"] = [str(n)]
        return urlunparse(parsed._replace(query=urlencode(params, doseq=True)))

    jobs: list[dict] = []
    seen: set[str] = set()

    with sync_playwright() as p:
        pw_page, cleanup = _open_browser(p, user_agent="Mozilla/5.0")
        _block_unnecessary_resources(pw_page)
        try:
            page_num = 1
            while True:
                target = page_url(url, page_num)
                print(f"Attrax: fetching page {page_num} ({target})", file=sys.stderr)
                pw_page.goto(target, wait_until="domcontentloaded", timeout=30_000)
                pw_page.wait_for_timeout(1_500)

                # Dismiss cookie banners on first page only
                if page_num == 1:
                    for selector in ["[id*='cookie'] button", "[class*='cookie'] button", "[aria-label='Accept']"]:
                        try:
                            pw_page.click(selector, timeout=2_000)
                        except Exception:
                            pass

                soup = BeautifulSoup(pw_page.content(), "html.parser")
                page_jobs = extract_attrax_jobs(soup, url)

                if not page_jobs:
                    break

                new_count = 0
                for job in page_jobs:
                    key = job.get("url") or f"{job['title'].lower()}|{job.get('location', '')}"
                    if key not in seen:
                        seen.add(key)
                        jobs.append(job)
                        new_count += 1

                print(f"Attrax: page {page_num} — {new_count} new jobs ({len(jobs)} total)", file=sys.stderr)

                # Stop if no new jobs were found (dedup guard against infinite loops)
                if new_count == 0:
                    break

                page_num += 1

        finally:
            cleanup()

    return jobs


def _clean_text(tag) -> str:
    """Join child text nodes with a space, then fix spaces before punctuation."""
    text = tag.get_text(separator=" ", strip=True)
    # Remove space inserted before comma/period/semicolon by the separator
    return re.sub(r'\s+([,;.])', r'\1', text)


def extract_attrax_jobs(soup, base_url: str) -> list[dict]:
    """Extract jobs from an Attrax ATS listing page."""
    jobs = []
    for tile in soup.find_all(class_="attrax-vacancy-tile"):
        # Title + URL from the title anchor
        title_tag = tile.find(class_="attrax-vacancy-tile__title")
        if not title_tag:
            continue
        if title_tag.name == "a":
            title = _clean_text(title_tag)
            href = title_tag.get("href")
        else:
            title = _clean_text(title_tag)
            a = title_tag.find("a", href=True) or tile.find("a", href=True)
            href = a["href"] if a else None

        if not title:
            continue

        job_url = urljoin(base_url, href) if href else None

        # Location: prefer free-text field ("Tampere, Finland"), fall back to structured city
        location = None
        for loc_class in ("attrax-vacancy-tile__location-freetext", "attrax-vacancy-tile__option-location"):
            loc_tag = tile.find(class_=loc_class)
            if loc_tag:
                val = loc_tag.find(class_="attrax-vacancy-tile__item-value")
                if val:
                    text = val.get_text(strip=True)
                    if text and not SKIP_LOCATION_PATTERNS.match(text):
                        location = text
                        break

        jobs.append(build_job(title, job_url, location))

    return jobs


# ---------------------------------------------------------------------------
# Job extraction from parsed HTML
# ---------------------------------------------------------------------------

JOB_CLASS_PATTERNS = re.compile(
    r"(job|position|opening|vacancy|career|role|listing|posting)",
    re.IGNORECASE,
)

SKIP_LOCATION_PATTERNS = re.compile(
    r"^(remote|worldwide|global|anywhere|wfh|work from home|home office|europe|emea|apac)$",
    re.IGNORECASE,
)

APPLY_URL_PATTERNS = re.compile(
    r"(apply|job|position|career|opening|role|vacancy|posting)",
    re.IGNORECASE,
)


def extract_jobs(soup, base_url: str) -> list[dict]:
    """Try several heuristics and return whichever finds the most jobs."""
    candidates = [
        extract_from_job_containers(soup, base_url),
        extract_from_lists(soup, base_url),
        extract_from_links(soup, base_url),
    ]
    best = max(candidates, key=len)
    return deduplicate(best)


def extract_from_job_containers(soup, base_url: str) -> list[dict]:
    """Find elements whose class/id suggests they are job listings."""
    jobs = []
    seen_titles: set[str] = set()

    for tag in soup.find_all(True):
        classes = " ".join(tag.get("class", []))
        tag_id = tag.get("id", "")
        if not JOB_CLASS_PATTERNS.search(classes) and not JOB_CLASS_PATTERNS.search(tag_id):
            continue
        # Avoid deeply nested matches (only pick leaf-ish containers)
        if len(list(tag.find_all(class_=JOB_CLASS_PATTERNS))) > 2:
            continue

        title, url = extract_title_and_url(tag, base_url)
        if not title or title.lower() in seen_titles:
            continue
        if len(title) > 120:
            continue

        seen_titles.add(title.lower())
        location = extract_location(tag)
        jobs.append(build_job(title, url, location))

    return jobs


def extract_from_lists(soup, base_url: str) -> list[dict]:
    """Find <ul>/<ol> where each <li> looks like a job listing."""
    jobs = []
    seen_titles: set[str] = set()

    for ul in soup.find_all(["ul", "ol"]):
        items = ul.find_all("li", recursive=False)
        if len(items) < 3:
            continue

        candidate_jobs = []
        for li in items:
            title, url = extract_title_and_url(li, base_url)
            if not title or len(title) > 120:
                continue
            location = extract_location(li)
            candidate_jobs.append(build_job(title, url, location))

        # Only accept lists where most items look like jobs (have URLs)
        with_url = sum(1 for j in candidate_jobs if j.get("url"))
        if with_url < max(2, len(candidate_jobs) // 2):
            continue

        for job in candidate_jobs:
            if job["title"].lower() not in seen_titles:
                seen_titles.add(job["title"].lower())
                jobs.append(job)

    return jobs


def extract_from_links(soup, base_url: str) -> list[dict]:
    """Collect <a> links that look like job postings."""
    jobs = []
    seen: set[str] = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        abs_url = urljoin(base_url, href)
        # Only consider links whose href path suggests a job posting
        path = urlparse(abs_url).path
        if not APPLY_URL_PATTERNS.search(path):
            continue
        title = a.get_text(separator=" ", strip=True)
        if not title or len(title) < 4 or len(title) > 120:
            continue
        if title.lower() in seen:
            continue
        seen.add(title.lower())
        # Try to find location text near the link
        location = extract_location(a.parent or a)
        jobs.append(build_job(title, abs_url, location))

    return jobs


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_title_and_url(tag, base_url: str) -> tuple[str, str | None]:
    """Extract (title, absolute_url) from a tag. Title comes from the first link or heading."""
    # Prefer explicit heading
    for heading in tag.find_all(["h1", "h2", "h3", "h4"]):
        text = heading.get_text(separator=" ", strip=True)
        if text:
            link = tag.find("a", href=True)
            url = urljoin(base_url, link["href"]) if link else None
            return text, url

    # Fall back to first link
    link = tag.find("a", href=True)
    if link:
        text = link.get_text(separator=" ", strip=True)
        if text:
            return text, urljoin(base_url, link["href"])

    # Plain text of the tag itself
    text = tag.get_text(separator=" ", strip=True)
    if text:
        return text, None

    return "", None


LOCATION_CLASS_PATTERNS = re.compile(
    r"(location|city|country|office|place|region|area)",
    re.IGNORECASE,
)


def extract_location(tag) -> str | None:
    """Try to find a location string near the job title tag."""
    # Look for a child element with a location-like class
    for child in tag.find_all(True):
        child_classes = " ".join(child.get("class", []))
        if LOCATION_CLASS_PATTERNS.search(child_classes):
            text = child.get_text(strip=True)
            if text and not SKIP_LOCATION_PATTERNS.match(text):
                return text
    return None


def build_job(title: str, url: str | None, location: str | None) -> dict:
    job: dict = {"title": title}
    if url:
        job["url"] = url
    if location:
        job["location"] = location
    return job


def deduplicate(jobs: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for job in jobs:
        key = job["title"].lower()
        if key not in seen:
            seen.add(key)
            result.append(job)
    return result


if __name__ == "__main__":
    main()
