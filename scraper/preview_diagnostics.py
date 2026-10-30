#!/usr/bin/env python3
"""Print the Python scraper's diagnostics for the companies that failed.

The scrape-preview workflow runs batch_run.py against a local Astro server. The
scraper's own stderr (per-page job counts, fetch errors, what an empty page
contained) is logged by that server, not by batch_run.py, and the server log
holds every company's output. This picks out only the blocks that belong to the
companies batch_run.py reported as failed.

Usage: preview_diagnostics.py SCRAPE_OUTPUT SERVER_LOG [--max-lines N]
"""

import argparse
import re
import sys

# scrape.ts logs these three together, synchronously, when the Python process
# closes, so one scrape's output is contiguous and starts at the exit-code line.
_BLOCK_START = "[python-scraper] exit code:"
# The first stderr line shares a line with this prefix; the rest follow bare.
_STDERR_PREFIX = "[python-scraper] stderr: "

_FAILED_HEADER = "Failed companies:"
_FAILED_LINE = re.compile(r"^\s+(\S+) — ")
_SCRAPING_LINE = re.compile(r"^Scraping: .*?\((.*)\)\s*$")


def failed_urls(output: str) -> list[str]:
    """URLs listed under "Failed companies:" in batch_run.py's output."""
    urls: list[str] = []
    in_section = False
    for line in output.splitlines():
        if line.strip() == _FAILED_HEADER:
            in_section = True
            continue
        if not in_section:
            continue
        if m := _FAILED_LINE.match(line):
            urls.append(m.group(1))
        elif line.strip():
            break
    return urls


def source_urls(output: str, url: str) -> list[str]:
    """A company's full URL list (url plus extra_urls), read from its
    "Scraping: Name (url1, url2)" header — the failure may have come from any of
    them, and only the first is reported in the failure summary."""
    for line in output.splitlines():
        if m := _SCRAPING_LINE.match(line):
            urls = [u.strip() for u in m.group(1).split(",")]
            if url in urls:
                return urls
    return [url]


def scraper_blocks(server_log: str) -> list[list[str]]:
    """Split the server log into one block per Python scrape."""
    blocks: list[list[str]] = []
    for line in server_log.splitlines():
        if line.startswith(_BLOCK_START):
            blocks.append([line])
        elif blocks:
            blocks[-1].append(line)
    return blocks


def blocks_for(server_log: str, urls: list[str]) -> list[list[str]]:
    wanted = {f"Scraping: {u}" for u in urls}
    return [
        block
        for block in scraper_blocks(server_log)
        if any(line.removeprefix(_STDERR_PREFIX).strip() in wanted for line in block)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scrape_output")
    parser.add_argument("server_log")
    parser.add_argument("--max-lines", type=int, default=150)
    args = parser.parse_args()

    with open(args.scrape_output, errors="replace") as f:
        output = f.read()
    try:
        with open(args.server_log, errors="replace") as f:
            server_log = f.read()
    except FileNotFoundError:
        server_log = ""

    failed = failed_urls(output)
    if not failed:
        print("No failed companies.")
        return 0

    for url in failed:
        print(f"::group::Scraper diagnostics — {url}")
        blocks = blocks_for(server_log, source_urls(output, url))
        if not blocks:
            # ATS API layers (Greenhouse, Workday, ...) run inside the server and
            # never spawn the Python scraper, so there is no such block.
            print("No Python scraper output for this URL (an ATS or custom API?).")
        for i, block in enumerate(blocks, 1):
            if len(blocks) > 1:
                print(f"--- attempt {i} of {len(blocks)} ---")
            clipped = block[-args.max_lines :]
            if len(clipped) < len(block):
                print(f"[... {len(block) - len(clipped)} earlier lines omitted]")
            print("\n".join(line[:400] for line in clipped))
        print("::endgroup::")
    return 0


if __name__ == "__main__":
    sys.exit(main())
