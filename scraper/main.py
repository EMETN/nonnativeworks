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
import sys
from urllib.parse import urljoin

from browser import _open_browser, _block_unnecessary_resources, _run_in_subprocess
from extract import extract_jobs
from platforms.attrax import scrape_attrax_static, scrape_attrax_playwright
from platforms.barona import scrape_barona_playwright
from platforms.neste import scrape_neste_static
from platforms.njoyn import scrape_njoyn_playwright
from platforms.rovio import scrape_rovio_static
from platforms.zalando import scrape_zalando_static

MIN_JOBS_STATIC = 3  # If static scrape finds fewer than this, try Playwright

PLATFORM_ATTRAX = "attrax"
PLATFORM_NJOYN = "njoyn"
PLATFORM_BARONA = "barona"
PLATFORM_NESTE = "neste"
PLATFORM_ROVIO = "rovio"
PLATFORM_ZALANDO = "zalando"

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
    if "baronacareers.com" in url:
        return PLATFORM_BARONA
    if "jobs.neste.com" in url:
        return PLATFORM_NESTE
    if "rovio.com" in url:
        return PLATFORM_ROVIO
    if "jobs.zalando.com" in url:
        return PLATFORM_ZALANDO
    return None


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

    if platform == PLATFORM_BARONA:
        print("baronacareers.com detected — skipping static scrape, going straight to Playwright", file=sys.stderr)
        try:
            jobs = scrape_barona_playwright(url)
            print(f"Barona Playwright found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Barona Playwright failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_NESTE:
        print("jobs.neste.com detected — using dedicated static scraper", file=sys.stderr)
        try:
            jobs = scrape_neste_static(url)
            print(f"Neste static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Neste static failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_ROVIO:
        print("rovio.com detected — using dedicated static scraper", file=sys.stderr)
        try:
            jobs = scrape_rovio_static(url)
            print(f"Rovio static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Rovio static failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_ZALANDO:
        print("jobs.zalando.com detected — using dedicated static scraper", file=sys.stderr)
        try:
            jobs = scrape_zalando_static(url)
            print(f"Zalando static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Zalando static failed: {e}", file=sys.stderr)
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


if __name__ == "__main__":
    main()
