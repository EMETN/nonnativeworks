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
import re
import sys
from urllib.parse import urljoin, urlparse


MIN_JOBS_STATIC = 3  # If static scrape finds fewer than this, try Playwright

PLATFORM_ATTRAX = "attrax"

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


def detect_platform(html: str) -> str | None:
    """Detect the ATS platform from page HTML."""
    if "attrax-vacancy-tile" in html:
        return PLATFORM_ATTRAX
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

    html, jobs = scrape_static(url)
    print(f"Static scrape found {len(jobs)} jobs", file=sys.stderr)

    platform = detect_platform(html)
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
            headers={"User-Agent": "Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)"},
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
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — run: pip install playwright && playwright install chromium", file=sys.stderr)
        return []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            user_agent="Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)"
        )
        try:
            page.goto(url, wait_until="networkidle", timeout=30_000)
            # Attempt to dismiss cookie banners / modals
            for selector in ["[id*='cookie'] button", "[class*='cookie'] button", "[aria-label='Accept']"]:
                try:
                    page.click(selector, timeout=2_000)
                except Exception:
                    pass
            html = page.content()
        finally:
            browser.close()

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    return extract_jobs(soup, url)


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
        browser = p.chromium.launch(headless=True)
        pw_page = browser.new_page(
            user_agent="Mozilla/5.0"
        )
        try:
            page_num = 1
            while True:
                target = page_url(url, page_num)
                print(f"Attrax: fetching page {page_num} ({target})", file=sys.stderr)
                pw_page.goto(target, wait_until="networkidle", timeout=30_000)

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
            browser.close()

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
