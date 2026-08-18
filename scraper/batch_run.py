#!/usr/bin/env python3
"""
Batch scrape job — reads companies.yaml and uploads results to the database.

Designed to run inside GitHub Actions alongside a locally-started Astro server.
All scraping and classification is delegated to the existing TypeScript API routes
so there is no logic duplication.

Usage:
    python scraper/batch_run.py [--dry-run] [--api-url URL] [--slice INDEX TOTAL]
                                [--companies-file PATH]

Options:
    --dry-run         Scrape and validate but do not upload to the database.
    --api-url         Base URL of the Astro server.
                      Default: http://localhost:4321 (local server in GitHub Actions).
    --slice INDEX TOTAL
                      Process only the INDEX-th slice of companies (0-based), where
                      the full list is split into TOTAL slices by round-robin.
                      Used by GitHub Actions matrix jobs to run companies in parallel.
                      Default: 0 1 (all companies).
    --companies-file  Path to a companies YAML file.
                      Default: scraper/companies.yaml.
                      Pass a temp file to preview a subset of companies (e.g. only
                      newly added ones) without modifying the main list.

Environment:
    SCRAPER_SECRET   Must match the SCRAPER_SECRET set on the Astro server.
                     Used as the X-Scraper-Secret request header to bypass auth.

─── Moving to Render in the future ──────────────────────────────────────────────
If you add a Render-hosted Python scraper service (scraper/app.py), you can
replace the local-server approach with a two-step HTTP flow:

1. Change --api-url to point at the Render service for the /api/admin/scrape call
   (e.g. https://your-scraper.onrender.com), so the scraping runs on Render
   instead of inside the GitHub Actions runner (avoids installing Playwright here).

2. Keep the /api/admin/upload call pointing at the Vercel deployment
   (e.g. https://your-app.vercel.app), since uploading is a lightweight DB write.

3. Remove the "Install Node dependencies", "Build Astro app", and "Start server"
   steps from .github/workflows/scheduled-scrape.yml — they are only needed
   while the scraping runs locally.

Concretely, pass two separate --api-url-like flags:
    SCRAPER_SERVICE_URL  for /api/admin/scrape  → Render
    APP_URL              for /api/admin/upload  → Vercel

Then update _scrape() and _upload() below to use the right base URL each.
──────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests
import yaml

COMPANIES_FILE = Path(__file__).parent / "companies.yaml"

# Timeout for the scrape call — njoyn scrapes 9 countries sequentially (~10 min).
SCRAPE_TIMEOUT_S = 700


def _load_companies(path: Path | None = None) -> list[dict]:
    with open(path or COMPANIES_FILE) as f:
        data = yaml.safe_load(f)
    companies = (data or {}).get("companies") or []
    return [c for c in companies if c]  # drop nulls from empty yaml list


def _slice_companies(companies: list[dict], index: int, total: int) -> list[dict]:
    """Round-robin partition: slice INDEX takes every TOTAL-th company starting at INDEX."""
    return [c for i, c in enumerate(companies) if i % total == index]


def _wait_for_server(api_url: str, max_wait: int = 30) -> None:
    """Poll until the server is accepting connections."""
    print(f"Waiting for server at {api_url} ...", flush=True)
    for i in range(max_wait):
        try:
            requests.get(f"{api_url}/", timeout=2)
            print(f"  Server ready after {i + 1}s")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"Server at {api_url} did not become ready within {max_wait}s")


def _scrape(
    api_url: str, secret: str, url: str, timeout: int = SCRAPE_TIMEOUT_S
) -> dict:
    resp = requests.post(
        f"{api_url}/api/admin/scrape",
        json={"url": url},
        headers={"x-scraper-secret": secret},
        timeout=timeout,
    )
    resp.raise_for_status()
    return resp.json()


def _build_upload_payload(scrape_result: dict, is_english_company: bool) -> list[dict]:
    """
    Convert a ScrapeResult (from /api/admin/scrape) into a CompanyEntry[]
    (the format expected by /api/admin/upload).
    """
    entries = []
    for country_group in scrape_result.get("countries", []):
        positions = []
        for job in country_group.get("jobs", []):
            position: dict = {
                "title": job["title"],
                "city": job.get("city") or [],
                "category": job["category"],
                "requires_native_language": job["requires_native_language"],
                "local_language_advantage": job.get("local_language_advantage", False),
                "required_languages": job.get("requiredLanguages", []),
                "preferred_languages": job.get("preferredLanguages", []),
            }
            # Omit optional fields when absent — Zod's .optional() rejects JSON null
            if job.get("url"):
                position["url"] = job["url"]
            if job.get("work_model"):
                position["work_model"] = job["work_model"]
            positions.append(position)
        if not positions:
            continue
        entries.append(
            {
                "company_name": scrape_result["company_name"],
                "career_page_url": scrape_result["career_page_url"],
                "country": country_group["country"],
                "country_name": country_group["country_name"],
                "country_code": country_group["country_code"],
                "is_english_company": is_english_company,
                "positions": positions,
            }
        )
    return entries


def _upload(api_url: str, secret: str, payload: list[dict]) -> dict:
    resp = requests.post(
        f"{api_url}/api/admin/upload",
        json=payload,
        headers={"x-scraper-secret": secret},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _cleanup_stale_countries(
    api_url: str, secret: str, company_name: str, keep_countries: list[str]
) -> None:
    """Remove DB entries for countries where the company no longer has any jobs."""
    resp = requests.post(
        f"{api_url}/api/admin/cleanup-stale-countries",
        json={"company_name": company_name, "keep_countries": keep_countries},
        headers={"x-scraper-secret": secret},
        timeout=30,
    )
    resp.raise_for_status()


def _process_company(
    company: dict, api_url: str, secret: str, dry_run: bool, scrape_timeout: int
) -> tuple[dict, str]:
    """Scrape, validate, and upload one company. Returns (summary_entry, log_output)."""
    out: list[str] = []

    url = company.get("url", "").strip()
    min_positions = company.get("min_positions", 1)
    is_english_company = company.get("is_english_company", False)
    display_name = company.get("name") or url

    out.append(f"\n{'─' * 60}")
    out.append(f"Scraping: {display_name}  ({url})")

    summary_entry: dict = {
        "url": url,
        "status": "unknown",
        # Seed with the YAML name so a scrape failure still shows it (the scrape-derived
        # name isn't available until the scrape succeeds).
        "company_name": company.get("name"),
        "total_positions": 0,
        "countries": [],
        "skipped_unknown_location": 0,
        "skipped_untracked_country": 0,
        "error": None,
    }

    # ── Scrape ────────────────────────────────────────────────────────────
    try:
        result = _scrape(api_url, secret, url, scrape_timeout)
    except requests.HTTPError as e:
        msg = f"HTTP {e.response.status_code}: {e.response.text[:1000]}"
        out.append(f"FAIL — scrape error: {msg}")
        summary_entry.update({"status": "fail", "error": msg})
        return summary_entry, "\n".join(out)
    except Exception as e:
        msg = str(e)
        out.append(f"FAIL — scrape error: {msg}")
        summary_entry.update({"status": "fail", "error": msg})
        return summary_entry, "\n".join(out)

    # companies.yaml is authoritative for the name; the scrape endpoint only derives
    # one from the URL slug (e.g. "Abb", "Storaenso") which loses correct casing.
    if company.get("name"):
        result["company_name"] = company["name"]

    total_positions = sum(len(cg.get("jobs", [])) for cg in result.get("countries", []))
    country_names = [cg["country_name"] for cg in result.get("countries", [])]
    out.append(
        f"  company={result.get('company_name')!r}  ats={result.get('ats')}  "
        f"positions={total_positions}  countries={country_names}"
    )
    out.append(
        f"  skipped_unknown_location={result.get('skipped_unknown_location', 0)}  "
        f"skipped_untracked_country={result.get('skipped_untracked_country', 0)}"
    )

    summary_entry.update(
        {
            "company_name": result.get("company_name"),
            "total_positions": total_positions,
            "countries": country_names,
            "skipped_unknown_location": result.get("skipped_unknown_location", 0),
            "skipped_untracked_country": result.get("skipped_untracked_country", 0),
        }
    )

    # ── Validate ──────────────────────────────────────────────────────────
    # min_positions: 0 opts a company into warning-on-empty (verify, don't fail).
    if total_positions == 0 and min_positions == 0:
        msg = f"0 positions found — verify manually: {url}"
        out.append(f"WARN — {msg}")
        summary_entry.update({"status": "warning", "error": msg})
        return summary_entry, "\n".join(out)

    if total_positions < min_positions:
        msg = f"Only {total_positions} positions found, expected >= {min_positions}"
        out.append(f"FAIL — validation: {msg}")
        summary_entry.update({"status": "fail", "error": msg})
        return summary_entry, "\n".join(out)

    if dry_run:
        out.append(f"  [dry-run] would upload {total_positions} positions — skipping")
        summary_entry["status"] = "success"
        return summary_entry, "\n".join(out)

    # ── Upload ────────────────────────────────────────────────────────────
    payload = _build_upload_payload(result, is_english_company)
    try:
        upload_result = _upload(api_url, secret, payload)
        out.append(f"  uploaded ok: {upload_result.get('results', upload_result)}")
        if upload_result.get("errors"):
            out.append(f"  partial errors: {upload_result['errors']}")
        summary_entry["status"] = "success"
    except requests.HTTPError as e:
        msg = f"HTTP {e.response.status_code}: {e.response.text[:1000]}"
        out.append(f"FAIL — upload error: {msg}")
        summary_entry.update({"status": "fail", "error": msg})
        return summary_entry, "\n".join(out)
    except Exception as e:
        msg = str(e)
        out.append(f"FAIL — upload error: {msg}")
        summary_entry.update({"status": "fail", "error": msg})
        return summary_entry, "\n".join(out)

    # ── Cleanup stale country entries ─────────────────────────────────────
    # If the company previously had jobs in e.g. Germany but this scrape found
    # none, the old Germany company row (and its positions) would linger.
    # Delete any country entries not present in this upload.
    company_name_for_cleanup = result.get("company_name")
    if company_name_for_cleanup and payload:
        scraped_country_slugs = [entry["country"] for entry in payload]
        try:
            _cleanup_stale_countries(
                api_url, secret, company_name_for_cleanup, scraped_country_slugs
            )
            out.append(f"  stale-country cleanup ok (kept: {scraped_country_slugs})")
        except Exception as e:
            out.append(f"  WARN — stale-country cleanup failed (non-fatal): {e}")

    return summary_entry, "\n".join(out)


TABLE_HEADER = "| Company | Countries | Positions | Skipped | Status |\n| --- | --- | --- | --- | --- |"


def _summary_row(e: dict) -> str:
    company = e.get("company_name") or e["url"]
    countries = ", ".join(e.get("countries", [])) or "—"
    positions = str(e.get("total_positions", "—"))
    skipped = e.get("skipped_unknown_location", 0) + e.get(
        "skipped_untracked_country", 0
    )
    if e["status"] == "success":
        status = "✅ ok"
    elif e["status"] == "warning":
        status = "⚠️ 0 positions — verify"
    else:
        status = f"❌ {e.get('error', 'unknown error')[:80]}"
    # Link problem rows (warnings + failures) straight to the career page for verification.
    if e["status"] != "success":
        company = f"[{company}]({e['url']})"
    return f"| {company} | {countries} | {positions} | {skipped} | {status} |"


def _write_github_summary(entries: list[dict]) -> None:
    """Append a Markdown results summary to $GITHUB_STEP_SUMMARY if set.

    Failures and warnings are listed first (what needs attention), OK companies after.
    """
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary_path:
        return

    failures = [e for e in entries if e["status"] == "fail"]
    warnings = [e for e in entries if e["status"] == "warning"]
    successes = [e for e in entries if e["status"] == "success"]

    lines = [
        "## Scrape results\n",
        f"**{len(successes)} succeeded, {len(warnings)} warnings, {len(failures)} failed**\n",
    ]

    attention = failures + warnings
    if attention:
        lines += [f"### Needs attention ({len(attention)})\n", TABLE_HEADER]
        lines += [_summary_row(e) for e in attention]
        lines.append("")

    if successes:
        lines += [f"### OK ({len(successes)})\n", TABLE_HEADER]
        lines += [_summary_row(e) for e in successes]

    with open(summary_path, "a") as f:
        f.write("\n".join(lines) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch scrape and upload job")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Scrape and validate but skip the upload step",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:4321",
        help="Base URL of the Astro server (default: http://localhost:4321)",
    )
    parser.add_argument(
        "--slice",
        nargs=2,
        type=int,
        metavar=("INDEX", "TOTAL"),
        default=[0, 1],
        help="Process only slice INDEX of TOTAL (0-based, round-robin). "
        "Default: 0 1 (all companies).",
    )
    parser.add_argument(
        "--companies-file",
        default=None,
        help="Path to a companies YAML file (default: scraper/companies.yaml).",
    )
    parser.add_argument(
        "--scrape-timeout",
        type=int,
        default=None,
        help="HTTP read timeout in seconds for each scrape call (default: 700).",
    )
    args = parser.parse_args()

    if args.scrape_timeout is not None:
        global SCRAPE_TIMEOUT_S
        SCRAPE_TIMEOUT_S = args.scrape_timeout

    slice_index, slice_total = args.slice
    if slice_total < 1 or not (0 <= slice_index < slice_total):
        print(f"ERROR: invalid --slice {slice_index} {slice_total}", file=sys.stderr)
        return 1

    secret = os.environ.get("SCRAPER_SECRET", "")
    if not secret:
        print("ERROR: SCRAPER_SECRET environment variable is not set", file=sys.stderr)
        return 1

    companies_file = Path(args.companies_file) if args.companies_file else None
    all_companies = _load_companies(companies_file)
    companies = _slice_companies(all_companies, slice_index, slice_total)

    if not companies:
        print("No companies assigned to this slice — nothing to do.")
        return 0

    slice_label = f"slice {slice_index + 1}/{slice_total}" if slice_total > 1 else "all"
    print(
        f"Batch scrape: {len(companies)} companies ({slice_label}) | "
        f"api={args.api_url} | dry_run={args.dry_run}"
    )

    _wait_for_server(args.api_url)

    summary_entries: list[dict] = []
    failures: list[dict] = []
    warnings: list[dict] = []
    successes: list[dict] = []

    valid_companies = [c for c in companies if c.get("url", "").strip()]
    skipped = len(companies) - len(valid_companies)
    if skipped:
        print(
            f"WARNING: {skipped} company entries missing 'url', skipping",
            file=sys.stderr,
        )

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(
                _process_company,
                company,
                args.api_url,
                secret,
                args.dry_run,
                SCRAPE_TIMEOUT_S,
            ): company
            for company in valid_companies
        }
        for future in as_completed(futures):
            entry, output = future.result()
            print(output, flush=True)
            summary_entries.append(entry)
            if entry["status"] == "success":
                successes.append(
                    {"url": entry["url"], "positions": entry["total_positions"]}
                )
            elif entry["status"] == "warning":
                warnings.append({"url": entry["url"], "error": entry["error"]})
            else:
                failures.append({"url": entry["url"], "error": entry["error"]})

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'═' * 60}")
    print(
        f"Results: {len(successes)} succeeded, {len(warnings)} warnings, {len(failures)} failed"
    )

    if warnings:
        print("\nWarnings (0 positions — verify manually):")
        for w in warnings:
            print(f"  {w['url']} — {w['error']}")
            # ::warning:: renders as a yellow annotation on the run without failing it.
            print(f"::warning::{w['url']} returned 0 positions — verify manually")

    if failures:
        print("\nFailed companies:", file=sys.stderr)
        for f in failures:
            print(f"  {f['url']} — {f['error']}", file=sys.stderr)

    _write_github_summary(summary_entries)

    # Signal to CI whether anything actually reached the database. A scrape that
    # found nothing new should not spend build minutes rebuilding identical HTML.
    uploaded = not args.dry_run and any(
        entry["status"] == "success" and entry["total_positions"] > 0
        for entry in summary_entries
    )

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as out:
            out.write(f"uploaded={'true' if uploaded else 'false'}\n")

    return 1 if failures else 0  # warnings don't fail the run


if __name__ == "__main__":
    sys.exit(main())
