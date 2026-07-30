"""
Generic job extraction from parsed HTML.

Provides heuristic extractors that work across arbitrary career pages,
plus shared helpers (build_job, deduplicate) used by platform-specific scrapers.
"""

import re
from urllib.parse import urljoin, urlparse

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

LOCATION_CLASS_PATTERNS = re.compile(
    r"(location|city|country|office|place|region|area)",
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

    # Narrow to elements with matching class or id — avoids full-tree scan
    candidates = list(
        dict.fromkeys(
            soup.find_all(class_=JOB_CLASS_PATTERNS)
            + soup.find_all(id=JOB_CLASS_PATTERNS)
        )
    )
    for tag in candidates:
        # Avoid deeply nested matches (only pick leaf-ish containers)
        if len(list(tag.find_all(class_=JOB_CLASS_PATTERNS))) > 2:
            continue

        title, url = extract_title_and_url(tag, base_url)
        if not title or len(title) < 2 or len(title) > 120:
            continue
        location = extract_location(tag)
        key = job_key(build_job(title, url, location))
        if key in seen_titles:
            continue

        seen_titles.add(key)
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
            if not title or len(title) < 2 or len(title) > 120:
                continue
            location = extract_location(li)
            candidate_jobs.append(build_job(title, url, location))

        # Only accept lists where most items look like jobs (have URLs)
        with_url = sum(1 for j in candidate_jobs if j.get("url"))
        if with_url < max(2, len(candidate_jobs) // 2):
            continue

        for job in candidate_jobs:
            key = job_key(job)
            if key not in seen_titles:
                seen_titles.add(key)
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
        location = extract_location(a.parent or a)
        key = job_key(build_job(title, abs_url, location))
        if key in seen:
            continue
        seen.add(key)
        jobs.append(build_job(title, abs_url, location))

    return jobs


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


def job_key(job: dict) -> str:
    return job.get("url") or f"{job['title'].lower()}|{job.get('location', '')}"


def deduplicate(jobs: list[dict]) -> list[dict]:
    seen: set[str] = set()
    result = []
    for job in jobs:
        key = job_key(job)
        if key not in seen:
            seen.add(key)
            result.append(job)
    return result
