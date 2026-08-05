"""
Barona — Hybrid scraper.

Phase 1 (no browser): Fetch the full job listing from the barona.fi WordPress
    AJAX endpoint using plain HTTP requests. Fast and reliable — barona.fi has
    no Cloudflare protection. Each item in the response includes the job title,
    inline description HTML, city, country (ISO2) and applyUrl.

Phase 2 (Playwright): For English-titled jobs only — open a single Playwright
    browser session, navigate to baronacareers.com once to establish Cloudflare
    clearance, then call the per-job page_info API via page.evaluate(fetch(...))
    for each target job. Reads requirements.languages to set
    requires_native_language directly, and appends requirements.education to
    descriptionHtml so the TypeScript extractEducationRequirement can parse it.

baronacareers.com uses Cloudflare bot protection; plain HTTP requests are
blocked. All calls to that domain must go through the browser session.
barona.fi does not have this restriction, which is why Phase 1 uses requests.
"""

import json
import re
import sys

from browser import _open_browser, _block_unnecessary_resources, _run_in_subprocess
from title_language import _title_appears_non_english_excluding_cities

# barona.fi WP AJAX listing endpoint
_LISTING_BASE = (
    "https://www.barona.fi/wp-admin/admin-ajax.php"
    "?action=barona_job_feed&per_page=100&lang=en&keyword=&published=&search="
)
_LISTING_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.barona.fi/en/jobs/",
}
_MAX_PAGES = 50
_ENRICH_BATCH = 5  # concurrent in-browser fetches per tick


def _fetch_barona_listing() -> list[dict]:
    """Fetch all jobs from barona.fi WP AJAX API using plain HTTP (no browser)."""
    try:
        import requests as req
    except ImportError:
        print("requests not installed", file=sys.stderr)
        return []

    jobs: list[dict] = []
    seen_ids: set = set()

    for page in range(1, _MAX_PAGES + 1):
        url = f"{_LISTING_BASE}&page={page}"
        print(f"barona: listing page={page}", file=sys.stderr)
        try:
            resp = req.get(url, headers=_LISTING_HEADERS, timeout=20)
            resp.raise_for_status()
            items = resp.json()
        except Exception as e:
            print(f"barona: listing fetch failed at page={page}: {e}", file=sys.stderr)
            break

        if not items:
            print(f"barona: empty response at page={page} — stopping", file=sys.stderr)
            break

        new_count = 0
        for item in items:
            job_id = item.get("id")
            if job_id in seen_ids:
                continue
            seen_ids.add(job_id)
            jobs.append(
                {
                    "title": item.get("title", ""),
                    "url": item.get("applyUrl", ""),
                    "location": item.get("country", ""),  # ISO2 code e.g. "FI"
                    "city": item.get("city", ""),
                    "descriptionHtml": item.get("description", ""),
                }
            )
            new_count += 1

        print(
            f"barona: page={page} → {new_count} new jobs (total {len(jobs)})",
            file=sys.stderr,
        )

    print(f"barona: listing complete — {len(jobs)} jobs total", file=sys.stderr)
    return jobs


def _page_info_url(apply_url: str) -> str | None:
    """
    Derive the baronacareers.com page_info API URL from an applyUrl.

    Input:  "https://www.baronacareers.com/fi/fi/jobs/some-slug"
    Output: "https://www.baronacareers.com/api/v1/browse/page_info
             ?path=/fi/en/jobs/some-slug&filters[job_id]=&locale=en"

    The locale segment is forced to "en" so the API returns English-language
    metadata regardless of which locale the listing used.
    """
    m = re.match(r"https://www\.baronacareers\.com(/\w+)/\w+(/jobs/.+)", apply_url)
    if not m:
        return None
    path = f"{m.group(1)}/en{m.group(2)}"
    return (
        f"https://www.baronacareers.com/api/v1/browse/page_info"
        f"?path={path}&filters[job_id]=&locale=en"
    )


def _browser_fetch(pw_page, url: str) -> dict | list | None:
    """Call a URL via in-browser fetch, reusing the active Cloudflare session."""
    return pw_page.evaluate(f"""async () => {{
        try {{
            const r = await fetch({json.dumps(url)});
            if (!r.ok) return null;
            return await r.json();
        }} catch (e) {{ return null; }}
    }}""")


def scrape_barona(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_barona_inner, url)


def _scrape_barona_inner(url: str) -> list[dict]:
    # ── Phase 1: full listing via barona.fi WP AJAX (no browser) ────────────
    jobs = _fetch_barona_listing()
    if not jobs:
        return []

    # ── Phase 2: language + education enrichment via Playwright ─────────────
    # Only English-titled jobs need enrichment — non-English titles already
    # signal a native-language requirement via Phase 1a of the TS classifier.
    enrich_targets = [
        j for j in jobs
        if j.get("url") and not _title_appears_non_english_excluding_cities(j.get("title", ""))
    ]
    skipped = len(jobs) - len(enrich_targets)
    print(
        f"barona: {len(enrich_targets)} jobs need language enrichment "
        f"({skipped} non-English titles skipped)",
        file=sys.stderr,
    )

    if not enrich_targets:
        return jobs

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed — language enrichment skipped", file=sys.stderr)
        return jobs

    with sync_playwright() as p:
        pw_page, cleanup = _open_browser(
            p,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/146.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
        )
        _block_unnecessary_resources(pw_page)

        try:
            # One page load to establish Cloudflare clearance.
            print(
                "barona: opening baronacareers.com for Cloudflare clearance…",
                file=sys.stderr,
            )
            pw_page.goto(
                "https://www.baronacareers.com/fi/en/jobs",
                wait_until="domcontentloaded",
                timeout=30_000,
            )
            pw_page.wait_for_timeout(2_000)

            enriched = 0
            failed = 0
            for i, job in enumerate(enrich_targets):
                api_url = _page_info_url(job["url"])
                if not api_url:
                    failed += 1
                    continue

                result = _browser_fetch(pw_page, api_url)
                if not result:
                    failed += 1
                    print(
                        f"barona: page_info fetch returned null for {job['url']}",
                        file=sys.stderr,
                    )
                    continue

                requirements = (
                    result.get("page_info", {}).get("job", {}).get("requirements", {})
                )

                # Languages → requires_native_language
                # True when any language other than English is listed.
                languages: list[str] = requirements.get("languages") or []
                if languages:
                    job["requires_native_language"] = any(
                        lang.strip().lower() != "english" for lang in languages
                    )

                # Education → append to descriptionHtml so TypeScript's
                # extractEducationRequirement can parse it alongside the body.
                education = requirements.get("education")
                if education and isinstance(education, str) and education.strip():
                    job["descriptionHtml"] = (
                        job.get("descriptionHtml", "")
                        + f"<p>Education requirement: {education.strip()}</p>"
                    )

                enriched += 1
                if (i + 1) % 10 == 0:
                    print(
                        f"barona: enriched {i + 1}/{len(enrich_targets)}",
                        file=sys.stderr,
                    )

            print(
                f"barona: enrichment done — enriched: {enriched}, failed: {failed}",
                file=sys.stderr,
            )

        finally:
            cleanup()

    return jobs
