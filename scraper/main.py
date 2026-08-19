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

import contextlib
import json
import os
import sys

import yaml

from browser import _block_unnecessary_resources, _open_browser, _run_in_subprocess
from extract import extract_jobs
from platforms.academicwork import scrape_academicwork_static, site_for_url
from platforms.aiven import scrape_aiven_static
from platforms.arla import scrape_arla_static
from platforms.attrax import (
    enrich_attrax_descriptions,
    resolve_tracked_country_options,
    scrape_attrax_playwright,
    scrape_attrax_static,
)
from platforms.barona import scrape_barona
from platforms.generic_paginated import scrape_generic
from platforms.njoyn import scrape_njoyn_playwright
from platforms.rovio import scrape_rovio_static
from platforms.zalando import scrape_zalando_static


def _load_generic_configs() -> list[dict]:
    path = os.path.join(os.path.dirname(__file__), "generic_scrapers.yaml")
    try:
        with open(path) as f:
            data = yaml.safe_load(f)
        return data.get("scrapers", []) if data else []
    except Exception as e:
        print(f"Warning: could not load generic_scrapers.yaml: {e}", file=sys.stderr)
        return []


_GENERIC_CONFIGS = _load_generic_configs()


def _match_generic_config(url: str) -> dict | None:
    for cfg in _GENERIC_CONFIGS:
        if cfg.get("match", "") in url:
            return cfg
    return None


MIN_JOBS_STATIC = 3  # If static scrape finds fewer than this, try Playwright

PLATFORM_ACADEMICWORK = "academicwork"
PLATFORM_AIVEN = "aiven"
PLATFORM_ARLA = "arla"
PLATFORM_ATTRAX = "attrax"
PLATFORM_NJOYN = "njoyn"
PLATFORM_BARONA = "barona"
PLATFORM_ROVIO = "rovio"
PLATFORM_ZALANDO = "zalando"

# Attrax sites cap unfiltered results, so we pre-filter by country. Value: base jobs
# URL whose opaque country facet resolve_tracked_country_options reads at scrape time.
ATTRAX_COUNTRY_SITES: dict[str, str] = {
    "careers.tieto.com": "https://careers.tieto.com/jobs",
    "careers.deliveryhero.com": "https://careers.deliveryhero.com/jobs",
}


def detect_platform(html: str, url: str = "") -> str | None:
    """Detect the ATS platform from page HTML or URL."""
    if site_for_url(url) is not None:
        return PLATFORM_ACADEMICWORK
    if "aiven.io" in url:
        return PLATFORM_AIVEN
    if "jobs.arla.com" in url:
        return PLATFORM_ARLA
    if "attrax-vacancy-tile" in html:
        return PLATFORM_ATTRAX
    if "njoyn.com" in url:
        return PLATFORM_NJOYN
    if "baronacareers.com" in url or "barona.fi" in url:
        return PLATFORM_BARONA
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
        print(
            "playwright not installed — run: pip install playwright && playwright install chromium",
            file=sys.stderr,
        )
        return []

    with sync_playwright() as p:
        page, cleanup = _open_browser(p, user_agent="Mozilla/5.0")
        _block_unnecessary_resources(page)
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_timeout(2_000)
            for selector in [
                "[id*='cookie'] button",
                "[class*='cookie'] button",
                "[aria-label='Accept']",
            ]:
                with contextlib.suppress(Exception):
                    page.click(selector, timeout=2_000)
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

    for pattern, base_url in ATTRAX_COUNTRY_SITES.items():
        if pattern in url:
            options = resolve_tracked_country_options(base_url)
            if options:
                url = f"{base_url}?options={options}"
                print(f"Attrax country filter → {url}", file=sys.stderr)
            else:
                url = base_url
                print(
                    f"Attrax country filter unresolved — scraping {base_url} unfiltered",
                    file=sys.stderr,
                )
            break

    print(f"Scraping: {url}", file=sys.stderr)

    generic_cfg = _match_generic_config(url)
    if generic_cfg:
        print(
            f"generic scraper matched: {generic_cfg.get('name', url)}", file=sys.stderr
        )
        try:
            jobs = scrape_generic(url, generic_cfg)
        except Exception as e:
            print(f"generic scraper failed: {e}", file=sys.stderr)
            jobs = []
        print(json.dumps(jobs, ensure_ascii=False))
        return

    # Detect platform from URL alone before attempting a static fetch —
    # some platforms (e.g. njoyn) redirect plain HTTP requests to bot-detection
    # services, so a static scrape is both useless and counterproductive.
    platform = detect_platform("", url)
    jobs: list[dict] = []

    if platform == PLATFORM_ACADEMICWORK:
        print(
            "Academic Work site detected — using dedicated static scraper",
            file=sys.stderr,
        )
        try:
            jobs = scrape_academicwork_static(url)
            print(f"Academic Work static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Academic Work static failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_AIVEN:
        print("aiven.io detected — using dedicated static scraper", file=sys.stderr)
        try:
            jobs = scrape_aiven_static(url)
            print(f"Aiven static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Aiven static failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_ARLA:
        print(
            "jobs.arla.com detected — using dedicated static scraper", file=sys.stderr
        )
        try:
            jobs = scrape_arla_static(url)
            print(f"Arla static found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Arla static failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_NJOYN:
        print(
            "njoyn detected — skipping static scrape, going straight to Playwright",
            file=sys.stderr,
        )
        try:
            jobs = scrape_njoyn_playwright(url)
            print(f"njoyn Playwright found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"njoyn Playwright failed: {e}", file=sys.stderr)
        print(json.dumps(jobs, ensure_ascii=False))
        return

    if platform == PLATFORM_BARONA:
        print(
            "Barona detected — using hybrid scraper (WP API listing + selective Playwright enrichment)",
            file=sys.stderr,
        )
        try:
            jobs = scrape_barona(url)
            print(f"Barona hybrid found {len(jobs)} jobs", file=sys.stderr)
        except Exception as e:
            print(f"Barona hybrid scraper failed: {e}", file=sys.stderr)
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
        print(
            "jobs.zalando.com detected — using dedicated static scraper",
            file=sys.stderr,
        )
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
        print(
            f"Detected platform: {platform} — using dedicated Playwright scraper",
            file=sys.stderr,
        )

    if platform == PLATFORM_ATTRAX:
        try:
            jobs_static = scrape_attrax_static(url)
            print(
                f"Attrax static scrape found {len(jobs_static)} jobs", file=sys.stderr
            )
            jobs = jobs_static
        except Exception as e:
            print(f"Attrax static scrape failed: {e}", file=sys.stderr)
        if len(jobs) < MIN_JOBS_STATIC:
            print(
                "Attrax static yielded too few — trying Playwright...", file=sys.stderr
            )
            try:
                jobs_pw = scrape_attrax_playwright(url)
                print(f"Attrax Playwright found {len(jobs_pw)} jobs", file=sys.stderr)
                if len(jobs_pw) > len(jobs):
                    jobs = jobs_pw
            except Exception as e:
                print(f"Attrax Playwright failed: {e}", file=sys.stderr)
        import requests as _req

        _session = _req.Session()
        _session.headers["User-Agent"] = (
            "Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)"
        )
        enrich_attrax_descriptions(jobs, _session)
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
