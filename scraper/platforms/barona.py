"""
Barona — Playwright scraper.

baronacareers.com uses Cloudflare bot protection, so plain HTTP requests
are blocked. Playwright provides a real browser TLS fingerprint that passes.

Strategy:
  1. One Playwright page load to establish Cloudflare clearance.
  2. All subsequent data fetching via page.evaluate(fetch(...)) — lightweight
     JSON API calls that reuse the browser session, no page rendering cost.
  3. Listing API (/api/v1/browse/jobs?country=fi&locale=en&page=N) returns
     job IDs and titles with pagination.
  4. Detail API (/api/v1/browse/jobs/{id}?country=fi&locale=en) returns the
     explicit "languages" array for English-titled jobs.
  5. Language determination is direct: if the languages array contains the
     local language for the country, requires_native_language will be set
     by the classifier reading the descriptionText we produce.
"""

import json
import sys
from urllib.parse import urlparse

from browser import _open_browser, _block_unnecessary_resources, _run_in_subprocess
from extract import build_job
from title_language import _title_appears_non_english

# Maps the country locale in the Barona URL to its local language name as
# returned in the API's languages array (e.g. ["Finnish", "Swedish"]).
BARONA_LOCAL_LANGUAGES: dict[str, str] = {
    "fi": "Finnish",
    "se": "Swedish",
    "no": "Norwegian",
    "dk": "Danish",
}


def _barona_requires_native(languages: list[str]) -> bool:
    """True when any language other than English is listed.
    Covers both 'Finnish' on a FI job and cross-country cases like
    'Danish' listed on a FI job — either signals a non-English requirement."""
    return any(lang.strip().lower() != "english" for lang in languages)


def scrape_barona_playwright(url: str) -> list[dict]:
    return _run_in_subprocess(_scrape_barona_playwright_inner, url)


def _barona_api_fetch(pw_page, path: str) -> dict | list | None:
    """Call a Barona API path via in-browser fetch, reusing the Cloudflare session."""
    return pw_page.evaluate(f"""async () => {{
        try {{
            const r = await fetch({json.dumps(path)});
            if (!r.ok) return null;
            return await r.json();
        }} catch (e) {{ return null; }}
    }}""")


def _scrape_barona_playwright_inner(url: str) -> list[dict]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed", file=sys.stderr)
        return []

    parsed = urlparse(url)
    path_parts = [p for p in parsed.path.split("/") if p]
    locale = path_parts[0] if path_parts else "fi"
    # Preserve the language segment from the input URL (e.g. "en" or "fi")
    lang = path_parts[1] if len(path_parts) > 1 else "en"

    country_map = {"fi": "Finland", "se": "Sweden", "no": "Norway", "dk": "Denmark"}
    location = country_map.get(locale, "Finland")
    listing_base = f"{parsed.scheme}://{parsed.netloc}/{locale}/{lang}/job"

    jobs: list[dict] = []
    seen_ids: set[str] = set()

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
            # ── Phase 1: collect all jobs from paginated listing pages ───────────
            # Playwright renders each page; job titles + URLs come from JSON-LD.
            page_num = 1
            while True:
                listing_url = f"{listing_base}?page={page_num}"
                print(f"barona: listing page={page_num}: {listing_url}", file=sys.stderr)
                pw_page.goto(listing_url, wait_until="domcontentloaded", timeout=30_000)
                pw_page.wait_for_timeout(1_500)

                if page_num == 1:
                    for selector in ["[id*='cookie'] button", "[class*='cookie'] button", "[aria-label='Accept']"]:
                        try:
                            pw_page.click(selector, timeout=2_000)
                        except Exception:
                            pass

                    # ── Diagnostic: intercept API call to find job ID ─────────────
                    # Remove this block once the structure is confirmed.
                    # Get the first English-titled job URL from JSON-LD on this page
                    first_job_url = pw_page.evaluate("""() => {
                        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                            try {
                                const d = JSON.parse(s.textContent);
                                if (d['@type'] === 'ItemList' && Array.isArray(d.itemListElement)) {
                                    return d.itemListElement[0]?.url || null;
                                }
                            } catch (e) {}
                        }
                        return null;
                    }""")
                    if first_job_url:
                        intercepted: list = []
                        def _capture(route, request):
                            if "/api/v1/browse/jobs/" in request.url:
                                intercepted.append(request.url)
                            route.continue_()
                        pw_page.route("**/api/v1/browse/jobs/**", _capture)
                        try:
                            pw_page.goto(first_job_url, wait_until="domcontentloaded", timeout=20_000)
                            pw_page.wait_for_timeout(2_000)
                        except Exception:
                            pass
                        pw_page.unroute("**/api/v1/browse/jobs/**", _capture)
                        print(f"barona: intercepted API calls: {intercepted}", file=sys.stderr)
                        # Navigate back to listing
                        pw_page.goto(listing_url, wait_until="domcontentloaded", timeout=30_000)
                        pw_page.wait_for_timeout(1_500)

                items = pw_page.evaluate("""() => {
                    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                    for (const s of scripts) {
                        try {
                            const d = JSON.parse(s.textContent);
                            if (d['@type'] === 'ItemList' && Array.isArray(d.itemListElement)) {
                                return d.itemListElement;
                            }
                        } catch (e) {}
                    }
                    return [];
                }""")

                if not items:
                    print(f"barona: no JSON-LD items at page={page_num} — stopping", file=sys.stderr)
                    break

                new_count = 0
                for item in items:
                    item_url = item.get("url") or ""
                    if not item_url or item_url in seen_ids:
                        continue
                    seen_ids.add(item_url)
                    jobs.append(build_job(item.get("name", ""), item_url, location))
                    new_count += 1

                print(f"barona: page={page_num} → {new_count} new jobs (total {len(jobs)})", file=sys.stderr)
                if new_count == 0:
                    break
                page_num += 1

            print(f"barona: collected {len(jobs)} jobs total", file=sys.stderr)

            # ── Phase 2: enrich English-titled jobs via detail API ───────────────
            # For each English-titled job we fetch the page HTML cheaply via an
            # in-browser fetch() (no rendering cost), extract the numeric job ID
            # from __NEXT_DATA__, then call the JSON detail API for the languages
            # array. This avoids full Playwright page navigations for every job.
            english_jobs = [j for j in jobs if not _title_appears_non_english(j.get("title", ""))]
            print(f"barona: fetching language data for {len(english_jobs)} English-titled jobs", file=sys.stderr)

            for i, job in enumerate(english_jobs):
                job_url = job.get("url")
                if not job_url:
                    continue

                # Extract the slug from the job page URL (last path segment)
                slug = job_url.rstrip("/").split("/")[-1]

                # Try the detail API with the slug first — many REST APIs accept
                # either a numeric ID or the slug used in the page URL.
                result = _barona_api_fetch(
                    pw_page, f"/api/v1/browse/jobs/{slug}?country={locale}&locale={lang}"
                )

                # Fallback: fetch the page HTML and extract the numeric ID from
                # __NEXT_DATA__ (Next.js embeds full page props there).
                if not result:
                    job_id = pw_page.evaluate(f"""async () => {{
                        try {{
                            const r = await fetch({json.dumps(job_url)});
                            if (!r.ok) return null;
                            const html = await r.text();
                            const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\\s\\S]*?)<\\/script>/);
                            if (!m) return null;
                            const d = JSON.parse(m[1]);
                            return d?.props?.pageProps?.job?.id ?? null;
                        }} catch (e) {{ return null; }}
                    }}""")

                    if job_id:
                        result = _barona_api_fetch(
                            pw_page, f"/api/v1/browse/jobs/{job_id}?country={locale}&locale={lang}"
                        )
                    else:
                        print(f"barona: could not resolve ID for {job_url}", file=sys.stderr)

                if result:
                    languages: list[str] = result.get("job", {}).get("languages") or []
                    if languages:
                        job["descriptionText"] = "Language skills: " + ", ".join(languages)
                        job["requires_native_language"] = _barona_requires_native(languages)

                if (i + 1) % 10 == 0:
                    print(f"barona: enriched {i + 1}/{len(english_jobs)} jobs", file=sys.stderr)

            print(f"barona: done — {len(jobs)} total jobs", file=sys.stderr)

        finally:
            cleanup()

    return jobs
