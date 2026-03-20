#!/usr/bin/env python3
"""
Layer 2 scraper for NonNativeWorks.

Usage:
    python3 main.py <career-page-url>

Outputs a JSON array of RawJob objects to stdout.
Errors and progress messages go to stderr.

Two-stage strategy:
  1. Static HTTP fetch + BeautifulSoup
  2. Playwright headless Chromium (if static yields too few results)
"""

import json
import re
import sys
from urllib.parse import urljoin, urlparse


MIN_JOBS_STATIC = 3  # If static scrape finds fewer than this, try Playwright


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 main.py <url>", file=sys.stderr)
        sys.exit(1)

    url = sys.argv[1]
    print(f"Scraping: {url}", file=sys.stderr)

    jobs = scrape_static(url)
    print(f"Static scrape found {len(jobs)} jobs", file=sys.stderr)

    if len(jobs) < MIN_JOBS_STATIC:
        print("Falling back to Playwright...", file=sys.stderr)
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

def scrape_static(url: str) -> list[dict]:
    try:
        import requests
        from bs4 import BeautifulSoup
    except ImportError:
        print("requests/beautifulsoup4 not installed", file=sys.stderr)
        return []

    try:
        resp = requests.get(
            url,
            timeout=20,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NonNativeWorks-Scraper/1.0)"},
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"HTTP error: {e}", file=sys.stderr)
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    return extract_jobs(soup, url)


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
