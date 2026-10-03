import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from platforms.generic_paginated import (  # noqa: E402
    _extract_phenom_description,
    _extract_script_var_json,
    _fetch_phenom_api_page,
    _jobs_from_items,
    _phenom_tracked_countries,
)

BASE_URL = "https://careers.example.com/global/en/search-results"


def _listing_html(*jobs: dict) -> str:
    payload = {"status": 200, "hits": len(jobs), "totalHits": len(jobs)}
    payload["data"] = {"jobs": list(jobs)}
    return f"<script>phApp.ddo = {json.dumps(payload)};</script>"


class ExtractScriptVarJsonTest(unittest.TestCase):
    def test_url_template_and_one_job_per_country(self):
        cfg = {
            "url_template": "/global/en/job/{jobId}",
            "fields": {
                "title": "title",
                "location": "location",
                "locations": "multi_location",
            },
        }
        html = _listing_html(
            {
                "title": "Engineer",
                "jobId": "P-1",
                "location": "Erlangen, Bavaria, Germany",
                "multi_location": [
                    "Erlangen, Germany",
                    "An d. Lände 3, 91301 Forchheim, Germany",
                    "Oxfordshire, UK",
                ],
            },
            {"title": "Analyst", "jobId": "R-2", "location": "Vienna, Austria"},
        )

        jobs = _extract_script_var_json(html, cfg, BASE_URL)

        self.assertEqual(
            jobs,
            [
                {
                    "title": "Engineer",
                    "url": "https://careers.example.com/global/en/job/P-1",
                    "location": "Erlangen, Germany; An d. Lände 3, 91301 Forchheim, Germany",
                    "cities": ["Erlangen", "Forchheim"],
                },
                {
                    "title": "Engineer",
                    "url": "https://careers.example.com/global/en/job/P-1",
                    "location": "Oxfordshire, UK",
                    "cities": ["Oxfordshire"],
                },
                {
                    "title": "Analyst",
                    "url": "https://careers.example.com/global/en/job/R-2",
                    "location": "Vienna, Austria",
                },
            ],
        )

    def test_url_field_without_template(self):
        cfg = {"fields": {"title": "title", "url": "applyUrl", "location": "city"}}
        html = _listing_html(
            {"title": "Actuary", "applyUrl": "https://ats.example/1", "city": "Munich"}
        )

        jobs = _extract_script_var_json(html, cfg, BASE_URL)

        self.assertEqual(
            jobs,
            [
                {
                    "title": "Actuary",
                    "url": "https://ats.example/1",
                    "location": "Munich",
                }
            ],
        )

    def test_missing_template_key_leaves_url_unset(self):
        cfg = {"url_template": "/job/{jobId}", "fields": {"title": "title"}}

        jobs = _extract_script_var_json(
            _listing_html({"title": "Nurse"}), cfg, BASE_URL
        )

        self.assertEqual(jobs, [{"title": "Nurse"}])


class PhenomApiTest(unittest.TestCase):
    CFG = {
        "api_body": {"refNum": "TENANT"},
        "url_template": "/global/en/job/{jobId}",
        "country_filter_param": "country",
        "pagination": {"type": "offset", "param": "from", "page_size": 100},
        "fields": {"title": "title", "locations": "multi_location"},
    }

    def test_keeps_only_the_queried_countrys_locations(self):
        items = [
            {
                "title": "Global Trainer",
                "jobId": "R-1",
                "multi_location": ["Cary, NC, United States", "Erlangen, Germany"],
            },
            {"title": "Start-up Engineer", "jobId": "R-2", "multi_location": ["UK"]},
        ]

        jobs = _jobs_from_items(items, self.CFG, BASE_URL, country="Germany")

        self.assertEqual(
            [(j["title"], j["location"], j.get("cities")) for j in jobs],
            [
                ("Global Trainer", "Erlangen, Germany", ["Erlangen"]),
                ("Start-up Engineer", "Germany", None),
            ],
        )

    def test_tracked_countries_and_filtered_page_requests(self):
        session = _FakeSession(
            [
                {
                    "aggregations": [
                        {
                            "field": "country",
                            "value": {"United States of America": 9, "Finland": 1},
                        }
                    ]
                },
                {
                    "jobs": [
                        {
                            "title": "Engineer",
                            "jobId": "R-3",
                            "multi_location": ["Espoo, Finland"],
                        }
                    ]
                },
            ]
        )

        countries = _phenom_tracked_countries(session, BASE_URL, self.CFG)
        jobs = _fetch_phenom_api_page(
            session, BASE_URL, {"country": "Finland", "from": 0}, self.CFG
        )

        self.assertEqual(countries, ["Finland"])
        self.assertEqual(
            jobs,
            [
                {
                    "title": "Engineer",
                    "url": "https://careers.example.com/global/en/job/R-3",
                    "location": "Espoo, Finland",
                    "cities": ["Espoo"],
                }
            ],
        )
        url, body = session.calls[1]
        self.assertEqual(url, "https://careers.example.com/widgets")
        self.assertEqual(body["refNum"], "TENANT")
        self.assertEqual(body["selected_fields"], {"country": ["Finland"]})
        self.assertEqual((body["from"], body["size"]), (0, 100))


class _FakeSession:
    def __init__(self, responses: list[dict]):
        self.responses = responses
        self.calls: list[tuple[str, dict]] = []

    def post(self, url, json, **_):
        self.calls.append((url, json))
        data = self.responses[len(self.calls) - 1]
        return _FakeResponse({"refineSearch": {"data": data}})


class _FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self.payload


class ExtractPhenomDescriptionTest(unittest.TestCase):
    def test_reads_job_detail_description(self):
        detail = {"status": 200, "data": {"job": {"description": "<p>Hello</p>"}}}
        html = f'<script>phApp.ddo = {{"jobDetail":{json.dumps(detail)}}};</script>'

        self.assertEqual(_extract_phenom_description(html), "<p>Hello</p>")

    def test_returns_empty_without_payload(self):
        self.assertEqual(_extract_phenom_description("<main>No payload</main>"), "")


if __name__ == "__main__":
    unittest.main()
