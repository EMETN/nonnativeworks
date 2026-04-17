"""
Browser/subprocess utilities shared across all scrapers.
"""

import multiprocessing
import os
import queue
import sys

PLAYWRIGHT_TIMEOUT_SECONDS = 600  # default hard wall-clock limit for any Playwright scrape

# Set PLAYWRIGHT_CDP_URL to connect to a browser running outside the container
# instead of launching Chromium locally (recommended on WSL2 devcontainers).
#
# How to start Chrome on Windows with remote debugging:
#   chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0
#
# Then set in your shell before running the scraper:
#   export PLAYWRIGHT_CDP_URL=http://host.docker.internal:9222
PLAYWRIGHT_CDP_URL = os.environ.get("PLAYWRIGHT_CDP_URL")

# Resource types that are never needed for job listing extraction.
# Blocking them prevents the firewall from being flooded with REJECT responses
# for CDN/tracker domains and keeps Chromium's memory footprint small.
_BLOCK_RESOURCE_TYPES = {"image", "media", "font", "websocket", "other"}


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _mem_mb() -> int:
    """Read available memory from /proc/meminfo (Linux only)."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return -1


def _open_browser(p, *, user_agent: str | None = None, viewport: dict | None = None):
    """
    Returns (page, cleanup_fn).
    If PLAYWRIGHT_CDP_URL is set, connects to an existing browser via CDP —
    no Chromium process is spawned inside the container.
    Otherwise falls back to launching a local headless Chromium.
    """
    if PLAYWRIGHT_CDP_URL:
        _log(f"CDP: connecting to browser at {PLAYWRIGHT_CDP_URL}")
        browser = p.chromium.connect_over_cdp(PLAYWRIGHT_CDP_URL)
        ctx_kwargs: dict = {}
        if user_agent:
            ctx_kwargs["user_agent"] = user_agent
        if viewport:
            ctx_kwargs["viewport"] = viewport
        context = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        def cleanup():
            context.close()
            # Don't close the shared browser — just disconnect

        return page, cleanup
    else:
        _log("No CDP URL set — launching local Chromium (may be unstable on WSL2)")
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-default-apps",
                "--no-first-run",
            ],
        )
        context = browser.new_context(
            **({"user_agent": user_agent} if user_agent else {}),
            **({"viewport": viewport} if viewport else {}),
        )
        page = context.new_page()

        def cleanup():
            browser.close()

        return page, cleanup


def _block_unnecessary_resources(page) -> None:
    """Abort requests for resource types that aren't needed to scrape job listings."""
    def _handle(route):
        if route.request.resource_type in _BLOCK_RESOURCE_TYPES:
            route.abort()
        else:
            route.continue_()
    page.route("**/*", _handle)


def _run_in_subprocess(fn, *args, timeout: int = PLAYWRIGHT_TIMEOUT_SECONDS) -> list[dict]:
    """
    Run fn(*args) in a child process with a hard timeout.
    If the child crashes or times out it cannot kill the parent,
    so VS Code keeps its connection to the container.
    Pass timeout= to override the default per-scraper (e.g. njoyn needs much longer).
    """
    result_q: multiprocessing.Queue = multiprocessing.Queue()

    def worker():
        try:
            jobs = fn(*args)
            result_q.put(("ok", jobs))
        except Exception as e:
            result_q.put(("err", str(e)))

    proc = multiprocessing.Process(target=worker, daemon=True)
    _log(f"[subprocess] starting {fn.__name__} (available RAM: {_mem_mb()} MB, timeout: {timeout}s)")
    proc.start()

    # Read from the queue BEFORE joining — if the result is large it fills the
    # pipe buffer and the child blocks, causing a deadlock with proc.join().
    try:
        status, data = result_q.get(timeout=timeout)
    except queue.Empty:
        _log(f"[subprocess] {fn.__name__} exceeded {timeout}s — killing")
        proc.kill()
        proc.join()
        return []

    proc.join()
    exit_code = proc.exitcode
    if exit_code != 0:
        _log(f"[subprocess] {fn.__name__} exited with code {exit_code} (crash/OOM?)")
        return []

    if status == "err":
        _log(f"[subprocess] {fn.__name__} error: {data}")
        return []

    _log(f"[subprocess] {fn.__name__} done (available RAM after: {_mem_mb()} MB)")
    return data
