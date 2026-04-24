"""
File-backed cache for job description HTML, persisted via GitHub Actions cache between runs.
Populated by generic_paginated.py; the cache file lives at cache/descriptions.json
relative to the project root.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

CACHE_PATH = Path(__file__).parent.parent / "cache" / "descriptions.json"
TTL_DAYS = 14

_store: dict[str, dict] = {}
_dirty = False


def _load() -> None:
    global _store
    if not CACHE_PATH.exists():
        return
    try:
        _store = json.loads(CACHE_PATH.read_text())
        print(f"[description-cache] loaded {len(_store)} entries", file=sys.stderr)
    except Exception as e:
        print(f"[description-cache] failed to load: {e}", file=sys.stderr)


def get(url: str) -> tuple[str, str | None] | None:
    """Return (desc_html, job_function) if cached and fresh, else None."""
    global _dirty
    entry = _store.get(url)
    if not entry:
        return None
    fetched_at = datetime.fromisoformat(entry["fetchedAt"])
    if datetime.now(timezone.utc) - fetched_at > timedelta(days=TTL_DAYS):
        del _store[url]
        _dirty = True
        return None
    return entry["descHtml"], entry.get("jobFunction")


_STRIP_STYLE_RE = re.compile(r"<style[\s\S]*?</style>", re.IGNORECASE)
# Remove UI JS scripts — keep type="application/..." and id="..." (data payloads)
_STRIP_JS_RE = re.compile(r'<script(?![^>]*\btype=["\']application/)(?![^>]*\bid=)[^>]*>[\s\S]*?</script>', re.IGNORECASE)


def _strip(html: str) -> str:
    html = _STRIP_STYLE_RE.sub("", html)
    return _STRIP_JS_RE.sub("", html)


def set(url: str, desc_html: str, job_function: str | None) -> None:
    global _dirty
    _store[url] = {
        "descHtml": _strip(desc_html),
        "jobFunction": job_function,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }
    _dirty = True


def flush() -> None:
    global _dirty
    if not _dirty:
        return
    try:
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        CACHE_PATH.write_text(json.dumps(_store))
        print(f"[description-cache] saved {len(_store)} entries", file=sys.stderr)
        _dirty = False
    except Exception as e:
        print(f"[description-cache] failed to save: {e}", file=sys.stderr)


_load()
