import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bs4 import BeautifulSoup  # noqa: E402

from platforms.generic_paginated import (  # noqa: E402
    _extract_card,
    _extract_next_data,
    _extract_phenom_description,
    _extract_script_json,
    _extract_script_var_json,
    _extract_teamtailor_card,
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


class ExtractNextDataTest(unittest.TestCase):
    CFG = {
        "data_path": "props.pageProps.list",
        "full_description": True,
        "url_template": "/positions/{id}",
        "fields": {
            "title": "jobTitle",
            "locations": "officeLocations",
            "location_subfield": "title",
            "country_subfield": "country.name",
            "job_function": "typesOfWork.0",
            "description": ["highLevelDescription", "requirements", "responsibilities"],
        },
    }

    @staticmethod
    def _page(items):
        data = {"props": {"pageProps": {"list": items}}}
        return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(data)}</script>'

    def test_builds_one_job_per_country_with_full_description(self):
        item = {
            "id": "abc",
            "jobTitle": "Product manager",
            "typesOfWork": ["Product & Marketing"],
            "officeLocations": [
                {"title": "Milan (Italy)", "country": {"name": "Italy"}},
                {"title": "Madrid (Spain)", "country": {"name": "Spain"}},
            ],
            "highLevelDescription": "<span>About us</span>",
            "requirements": [{"title": "Reasoning", "description": "Solve problems"}],
            "responsibilities": ["<span>Investigate</span>"],
        }

        jobs = _extract_next_data(self._page([item]), self.CFG, "https://x.example/")

        self.assertEqual(
            [j["location"] for j in jobs], ["Milan, Italy", "Madrid, Spain"]
        )
        self.assertEqual(jobs[0]["url"], "https://x.example/positions/abc")
        self.assertEqual(jobs[0]["jobFunction"], "Product & Marketing")
        # Stored as descriptionHtml so the per-job detail fetch is skipped.
        self.assertNotIn("descriptionText", jobs[0])
        for part in ("About us", "Reasoning", "Solve problems", "Investigate"):
            self.assertIn(part, jobs[0]["descriptionHtml"])

    def test_returns_empty_without_payload_or_array(self):
        self.assertEqual(
            _extract_next_data("<main>none</main>", self.CFG, "https://x/"), []
        )
        self.assertEqual(_extract_next_data(self._page({}), self.CFG, "https://x/"), [])


class ExtractPhenomDescriptionTest(unittest.TestCase):
    def test_reads_job_detail_description(self):
        detail = {"status": 200, "data": {"job": {"description": "<p>Hello</p>"}}}
        html = f'<script>phApp.ddo = {{"jobDetail":{json.dumps(detail)}}};</script>'

        self.assertEqual(_extract_phenom_description(html), "<p>Hello</p>")

    def test_skips_earlier_job_detail_config_mentions(self):
        # GE HealthCare pages mention "jobDetail" in widget config before the
        # real payload; the first mention must not end the search.
        detail = {"status": 200, "data": {"job": {"description": "<p>Real</p>"}}}
        html = (
            '<script>cfg = {"jobDetail":"data.job"},{"other":{"trait14":"key"}};'
            f'phApp.ddo = {{"jobDetail":{json.dumps(detail)}}};</script>'
        )

        self.assertEqual(_extract_phenom_description(html), "<p>Real</p>")

    def test_returns_empty_without_payload(self):
        self.assertEqual(_extract_phenom_description("<main>No payload</main>"), "")


class ExtractTeamtailorCardTest(unittest.TestCase):
    def _card(self, location_span: str):
        html = (
            '<li><a href="/jobs/1-dev">Dev</a><div class="text-md mt-4">'
            "<span>Engineering</span><span>&middot;</span>"
            f"{location_span}</div></li>"
        )
        return BeautifulSoup(html, "html.parser").li

    def test_multiple_locations_label_uses_title_attribute(self):
        card = self._card(
            '<span title="Helsinki, Oulu, Tampere">Multiple locations</span>'
        )

        job = _extract_teamtailor_card(card, "https://careers.example.com/jobs", {})

        self.assertEqual(job["location"], "Helsinki, Oulu, Tampere")
        self.assertEqual(job["jobFunction"], "Engineering")

    def test_single_location_is_unchanged(self):
        job = _extract_teamtailor_card(
            self._card("<span>Stockholm</span>"), "https://careers.example.com/jobs", {}
        )

        self.assertEqual(job["location"], "Stockholm")


class ExtractCardTest(unittest.TestCase):
    BASE = "https://careers.example.com/en/careers"

    def _card(self, html: str):
        return BeautifulSoup(html, "html.parser").select_one("a, li")

    def test_card_that_is_the_link_supplies_the_url(self):
        card = self._card('<a href="/en/careers/dev"><h3>Developer</h3></a>')

        job = _extract_card(card, self.BASE, {"title_selector": "h3"})

        self.assertEqual(job["url"], "https://careers.example.com/en/careers/dev")

    def test_default_location_fills_a_missing_location(self):
        card = self._card('<a href="/en/careers/dev"><h3>Developer</h3></a>')

        job = _extract_card(card, self.BASE, {"default_location": "Finland"})

        self.assertEqual(job["location"], "Finland")

    def test_default_location_does_not_override_a_found_location(self):
        card = self._card(
            '<li><a href="/j/1">Dev</a><span class="location">Oulu</span></li>'
        )

        job = _extract_card(card, self.BASE, {"default_location": "Finland"})

        self.assertEqual(job["location"], "Oulu")

    def test_work_model_selector_prefixes_the_location(self):
        card = self._card(
            '<a href="/j/1"><h3>Dev</h3><i class="loc">Warsaw</i>'
            '<i class="wm"> Hybrid </i></a>'
        )
        cfg = {"location_selector": ".loc", "work_model_selector": ".wm"}

        job = _extract_card(card, self.BASE, cfg)

        self.assertEqual(job["location"], "Hybrid - Warsaw")

    def test_work_model_selector_reads_on_site(self):
        card = self._card(
            '<a href="/j/1"><h3>Dev</h3><i class="loc">Berlin</i>'
            '<i class="wm">On-site</i></a>'
        )
        cfg = {"location_selector": ".loc", "work_model_selector": ".wm"}

        job = _extract_card(card, self.BASE, cfg)

        self.assertEqual(job["location"], "On-site - Berlin")

    def test_work_model_selector_ignores_a_label_that_is_not_a_work_model(self):
        card = self._card(
            '<a href="/j/1"><h3>Dev</h3><i class="loc">Warsaw</i>'
            '<i class="wm">Finance</i></a>'
        )
        cfg = {"location_selector": ".loc", "work_model_selector": ".wm"}

        job = _extract_card(card, self.BASE, cfg)

        self.assertEqual(job["location"], "Warsaw")


if __name__ == "__main__":
    unittest.main()


def test_jsonld_location_reads_address():
    from platforms.generic_paginated import _jsonld_location

    html = (
        '<script type="application/ld+json">{"jobLocation":[{"@type":"Place",'
        '"address":{"addressLocality":"Madrid","addressCountry":"ES"}}]}</script>'
    )
    assert _jsonld_location(html) == "Madrid, ES"


def test_jsonld_location_empty_address_is_none():
    from platforms.generic_paginated import _jsonld_location

    html = (
        '<script type="application/ld+json">{"jobLocation":[{"@type":"Place",'
        '"address":{}}]}</script>'
    )
    assert _jsonld_location(html) is None


def test_new_session_upgrades_http_redirect():
    from unittest import mock

    import requests

    from platforms.generic_paginated import _new_session

    hop = requests.Response()
    hop.status_code = 301
    hop.headers["location"] = "http://ckw.ch/careers/jobs/1"
    hop.url = "https://ckw.teamtailor.com/jobs/1"
    final = requests.Response()
    final.status_code = 200
    final.url = "https://ckw.ch/careers/jobs/1"
    seen = []

    def fake_send(self, request, **kw):
        seen.append(request.url)
        resp = hop if len(seen) == 1 else final
        resp.request = request
        return resp

    with mock.patch.object(requests.adapters.HTTPAdapter, "send", fake_send):
        _new_session().get("https://ckw.teamtailor.com/jobs/1")
    assert seen[1] == "https://ckw.ch/careers/jobs/1"


def test_card_work_model():
    from platforms.generic_paginated import _card_work_model

    assert _card_work_model("Hybrid") == "Hybrid"
    assert _card_work_model("Fully Remote") == "Remote"
    assert _card_work_model("Baden") is None
    assert _card_work_model(None) is None
