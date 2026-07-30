#!/usr/bin/env python3
import json
import re

import requests

BASE = "https://careers.allianz.com/global/en/search-results"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "text/html,*/*",
}

decoder = json.JSONDecoder()


def extract_jobs(html):
    # find all JSON objects in page

    for match in re.finditer(r"\{", html):
        pos = match.start()
        try:
            obj, _ = decoder.raw_decode(html, pos)
        except Exception:
            continue

        if not isinstance(obj, dict):
            continue

        data = obj.get("data")
        if isinstance(data, dict) and isinstance(data.get("jobs"), list):
            return data["jobs"]

    return None


def probe(offset):
    url = f"{BASE}?from={offset}&s=1"
    r = requests.get(url, headers=HEADERS, timeout=30)

    jobs = extract_jobs(r.text)

    if not jobs:
        print(f"from={offset}: no jobs found")
        return

    sample = [(j.get("reqId"), j.get("title")) for j in jobs[:3]]

    print(f"from={offset}: {len(jobs)} jobs | sample={sample}")


for o in [0, 10, 20, 30, 40]:
    probe(o)
