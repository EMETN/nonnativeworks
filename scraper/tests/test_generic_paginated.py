import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from platforms.generic_paginated import (  # noqa: E402
    _extract_phenom_description,
    _extract_script_json,
    _extract_script_var_json,
    _fetch_phenom_api_page,
    _jobs_from_items,
    _phenom_tracked_countries,
    _rsc_text_rows,
)

BASE_URL = "https://careers.example.com/global/en/search-results"


def _listing_html(*jobs: dict) -> str:
    payload = {"status": 200, "hits": len(jobs), "totalHits": len(jobs)}
    payload["data"] = {"jobs": list(jobs)}
    return f"<script>phApp.ddo = {json.dumps(payload)};</script>"


class ExtractScriptVarJsonTest(unittest.TestCase):
    def test_location_subfield_groups_by_country_past_a_trailing_postcode(self):
        cfg = {
            "fields": {
                "title": "title",
                "url": "url",
                "location": "cityStateCountry",
                "locations": "multi_location_array",
                "location_subfield": "cityStateCountry",
            },
        }
        item = {
            "title": "Head of Invoicing",
            "url": "/job/1",
            "cityStateCountry": "Munich, Germany",
            "multi_location": ["Munich, Germany, 80333"],
            "multi_location_array": [
                {"cityStateCountry": "Munich, Germany"},
                {"cityStateCountry": "Saint-Ouen, Seine-Saint-Denis, France"},
                {"cityStateCountry": "Paris, France"},
            ],
        }

        jobs = _jobs_from_items([item], cfg, BASE_URL)

        self.assertEqual(
            [(j["location"], j.get("cities")) for j in jobs],
            [
                ("Munich, Germany", ["Munich"]),
                (
                    "Saint-Ouen, Seine-Saint-Denis, France; Paris, France",
                    ["Saint-Ouen", "Paris"],
                ),
            ],
        )

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


def _rsc_html(*pushes: str) -> str:
    return "".join(
        f"<script>self.__next_f.push([1,{json.dumps(p)}])</script>" for p in pushes
    )


DEEL_CFG = {
    "script_key": "jobPostings",
    "url_template": "/acme/job-details/{id}/overview",
    "fields": {
        "title": "title",
        "locations": "job.jobLocations",
        "location_subfield": "location.name",
        "job_function": "job.jobDepartments.0.department.name",
        "description": "richtextDescription",
    },
}


def _deel_posting(id_: str, title: str, cities: list[str], desc: str) -> dict:
    return {
        "id": id_,
        "title": title,
        "richtextDescription": desc,
        "job": {
            "jobLocations": [{"location": {"name": c}} for c in cities],
            "jobDepartments": [{"department": {"name": "Engineering"}}],
        },
    }


class ExtractScriptJsonTest(unittest.TestCase):
    def test_deel_board_fans_out_cities_and_resolves_descriptions(self):
        postings = [
            _deel_posting("a1", "Engineer", ["Stockholm", "London"], "$1a"),
            _deel_posting("b2", "Analyst", ["Milan"], "$1b"),
        ]
        page = 'f:{"jobPostings":' + json.dumps(postings) + "}\n"
        # Row header ending a push, adjacent rows, and a multi-byte char in the length.
        html = _rsc_html(page + "1a:Ta,", "<p>é!</p>1b:T9,<p>Hi</p>")

        jobs = _extract_script_json(html, DEEL_CFG, "https://jobs.example.com/acme")

        url_a = "https://jobs.example.com/acme/job-details/a1/overview"
        self.assertEqual(
            jobs,
            [
                {
                    "title": "Engineer",
                    "url": url_a,
                    "location": "Stockholm",
                    "jobFunction": "Engineering",
                    "descriptionHtml": "<p>é!</p>",
                },
                {
                    "title": "Engineer",
                    "url": url_a,
                    "location": "London",
                    "jobFunction": "Engineering",
                    "descriptionHtml": "<p>é!</p>",
                },
                {
                    "title": "Analyst",
                    "url": "https://jobs.example.com/acme/job-details/b2/overview",
                    "location": "Milan",
                    "jobFunction": "Engineering",
                    "descriptionHtml": "<p>Hi</p>",
                },
            ],
        )

    def test_unresolved_description_reference_is_dropped(self):
        posting = _deel_posting("a1", "Engineer", ["Stockholm"], "$ff")
        html = _rsc_html('f:{"jobPostings":' + json.dumps([posting]) + "}\n")

        jobs = _extract_script_json(html, DEEL_CFG, "https://jobs.example.com/acme")

        self.assertNotIn("descriptionHtml", jobs[0])

    def test_text_rows_ignore_non_text_rows(self):
        html = _rsc_html('0:{"a":1}\n2a:Tc,<h1>Hey</h1>3:["$","div"]\n')

        self.assertEqual(_rsc_text_rows(html), {"2a": "<h1>Hey</h1>"})


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
