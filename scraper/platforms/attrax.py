"""
Attrax ATS — paginated static + Playwright scraper.

Used by: careers.tieto.com and other Attrax-based career sites.
"""

import re
import sys
from urllib.parse import urljoin, urlparse, urlencode, urlunparse, parse_qs

from browser import _open_browser, _block_unnecessary_resources, _run_in_subprocess
from extract import build_job, SKIP_LOCATION_PATTERNS


def scrape_attrax_static(url: str) -> list[dict]:
    """Iterate ?page=N with plain requests — works if Attrax renders server-side."""
    import requests
    from bs4 import BeautifulSoup

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
