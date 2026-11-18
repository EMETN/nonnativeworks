import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from batch_run import (  # noqa: E402
    _build_upload_payload,
    _company_urls,
    _merge_scrape_results,
    _process_company,
    _run_companies_with_retry,
    _summary_row,
)


def _job(title: str, *cities: str) -> dict:
    return {"title": title, "city": list(cities), "category": "engineering"}


def _result(ats: str, countries: dict[str, list[dict]], **extra) -> dict:
    return {
        "ats": ats,
        "company_name": "SAP",
        "career_page_url": f"https://{ats}.example",
        "skipped_unknown_location": 1,
        "skipped_untracked_country": 2,
        "countries": [
            {
                "country": slug,
                "country_name": slug.title(),
                "country_code": slug[:2].upper(),
                "jobs": jobs,
            }
            for slug, jobs in countries.items()
        ],
        **extra,
    }


def _titles(merged: dict, slug: str) -> list[str]:
    group = next(g for g in merged["countries"] if g["country"] == slug)
    return [j["title"] for j in group["jobs"]]


class CompanyUrlsTest(unittest.TestCase):
    def test_url_then_extra_urls(self):
        company = {"url": " https://a ", "extra_urls": ["https://b", " "]}
        self.assertEqual(_company_urls(company), ["https://a", "https://b"])

    def test_missing_url(self):
        self.assertEqual(_company_urls({"name": "X"}), [])


class MergeScrapeResultsTest(unittest.TestCase):
    def test_single_result_is_unchanged(self):
        result = _result("python", {"germany": [_job("Dev", "Berlin")]})
        self.assertEqual(_merge_scrape_results([result]), (result, 0))

    def test_drops_later_source_job_matching_title_and_city(self):
        first = _result("smartrecruiters", {"germany": [_job("Dev (f/m/d)", "Berlin")]})
        second = _result(
            "python",
            {"germany": [_job("dev  (F/M/D)", "berlin"), _job("QA", "Berlin")]},
        )
        merged, dropped = _merge_scrape_results([first, second])
        self.assertEqual(dropped, 1)
        self.assertEqual(_titles(merged, "germany"), ["Dev (f/m/d)", "QA"])

    def test_html_entities_match_their_characters(self):
        first = _result("a", {"germany": [_job("R&D Lead", "Walldorf")]})
        second = _result("b", {"germany": [_job("R&amp;D Lead", "Walldorf")]})
        _, dropped = _merge_scrape_results([first, second])
        self.assertEqual(dropped, 1)

    def test_missing_city_counts_as_a_match(self):
        first = _result("a", {"germany": [_job("Dev")]})
        second = _result("b", {"germany": [_job("Dev", "Berlin")]})
        _, dropped = _merge_scrape_results([first, second])
        self.assertEqual(dropped, 1)

    def test_keeps_same_title_in_another_city_or_country(self):
        first = _result("a", {"germany": [_job("Dev", "Berlin")]})
        second = _result(
            "b",
            {"germany": [_job("Dev", "Walldorf")], "france": [_job("Dev", "Paris")]},
        )
        merged, dropped = _merge_scrape_results([first, second])
        self.assertEqual(dropped, 0)
        self.assertEqual(_titles(merged, "germany"), ["Dev", "Dev"])
        self.assertEqual(_titles(merged, "france"), ["Dev"])

    def test_keeps_repeats_within_one_source(self):
        first = _result(
            "a", {"germany": [_job("Dev", "Berlin"), _job("Dev", "Berlin")]}
        )
        second = _result("b", {"germany": [_job("QA", "Berlin"), _job("QA", "Berlin")]})
        merged, dropped = _merge_scrape_results([first, second])
        self.assertEqual(dropped, 0)
        self.assertEqual(_titles(merged, "germany"), ["Dev", "Dev", "QA", "QA"])

    def test_metadata_comes_from_first_source_and_counts_add_up(self):
        first = _result("smartrecruiters", {"germany": [_job("Dev", "Berlin")]})
        second = _result("python", {"poland": [_job("QA", "Warsaw")]})
        merged, _ = _merge_scrape_results([first, second])
        self.assertEqual(merged["career_page_url"], "https://smartrecruiters.example")
        self.assertEqual(merged["ats"], "smartrecruiters+python")
        self.assertEqual(merged["skipped_unknown_location"], 2)
        self.assertEqual(merged["skipped_untracked_country"], 4)
        self.assertEqual(
            [g["country"] for g in merged["countries"]], ["germany", "poland"]
        )


if __name__ == "__main__":
    unittest.main()


class RunCompaniesTest(unittest.TestCase):
    def _process(self, outcomes: dict[str, list[str]]):
        calls: list[str] = []

        def process(company: dict) -> tuple[dict, str]:
            name = company["name"]
            calls.append(name)
            status = outcomes[name].pop(0)
            return {"url": name, "status": status, "error": None}, ""

        return process, calls

    def _by_url(self, entries: list[dict]) -> dict[str, dict]:
        return {e["url"]: e for e in entries}

    def test_retries_a_failed_company_once(self):
        process, calls = self._process(
            {"A": ["fail", "success"], "B": ["fail", "fail"], "C": ["success"]}
        )
        companies = [{"name": n} for n in "ABC"]
        with redirect_stdout(io.StringIO()):
            entries = self._by_url(
                _run_companies_with_retry(companies, process, max_workers=2)
            )

        self.assertEqual(entries["A"]["status"], "success")
        self.assertTrue(entries["A"]["retried"])
        self.assertEqual(entries["B"]["status"], "fail")
        self.assertTrue(entries["B"]["retried"])
        self.assertEqual(entries["C"]["status"], "success")
        self.assertNotIn("retried", entries["C"])
        self.assertEqual(sorted(calls), ["A", "A", "B", "B", "C"])

    def test_does_not_retry_warnings(self):
        process, calls = self._process({"A": ["warning"]})
        with redirect_stdout(io.StringIO()):
            entries = _run_companies_with_retry([{"name": "A"}], process, max_workers=1)
        self.assertEqual(entries[0]["status"], "warning")
        self.assertEqual(calls, ["A"])


class SummaryRowTest(unittest.TestCase):
    def test_marks_a_retried_company(self):
        entry = {"url": "https://a", "status": "success", "retried": True}
        self.assertIn("ok (after retry)", _summary_row(entry))


class BuildUploadPayloadTest(unittest.TestCase):
    def _result(self, *jobs: dict) -> dict:
        return {
            "company_name": "A",
            "career_page_url": "https://a",
            "countries": [
                {
                    "country": "finland",
                    "country_name": "Finland",
                    "country_code": "FI",
                    "jobs": list(jobs),
                }
            ],
        }

    def test_payload_keeps_unplaced_location(self):
        flagged = {**_job("A"), "requires_native_language": False}
        flagged["unplaced_location"] = "Remote - Region 4"
        plain = {**_job("B"), "requires_native_language": False}
        positions = _build_upload_payload(self._result(flagged, plain), True)[0][
            "positions"
        ]
        self.assertEqual(positions[0]["unplaced_location"], "Remote - Region 4")
        self.assertNotIn("unplaced_location", positions[1])


class SummaryUnplacedTest(unittest.TestCase):
    def test_summary_counts_unplaced_jobs(self):
        flagged = {**_job("A"), "unplaced_location": "Remote - Region 4"}
        other = {**_job("B"), "unplaced_location": "Remote (GMT+5:30)"}
        plain = _job("C")
        result = _result("greenhouse", {"europe": [flagged, plain], "finland": [other]})
        company = {"name": "SAP", "url": "https://sap.example"}
        with mock.patch("batch_run._scrape", return_value=result):
            _, text = _process_company(company, "http://api", "s", True, 10)
        self.assertIn("unplaced=2", text)

    def test_summary_entry_has_unplaced_count_and_distinct_texts(self):
        flagged = {**_job("A"), "unplaced_location": "Remote - Region 4"}
        again = {**_job("B"), "unplaced_location": "Remote - Region 4"}
        other = {**_job("C"), "unplaced_location": "Remote (GMT+5:30)"}
        result = _result(
            "greenhouse", {"europe": [flagged, again, _job("D")], "finland": [other]}
        )
        company = {"name": "SAP", "url": "https://sap.example"}
        with mock.patch("batch_run._scrape", return_value=result):
            entry, text = _process_company(company, "http://api", "s", True, 10)
        self.assertEqual(entry["unplaced"], 3)
        self.assertIn(
            "  unplaced_locations=['Remote (GMT+5:30)', 'Remote - Region 4']", text
        )

    def test_no_unplaced_line_without_unplaced_jobs(self):
        result = _result("greenhouse", {"finland": [_job("A")]})
        company = {"name": "SAP", "url": "https://sap.example"}
        with mock.patch("batch_run._scrape", return_value=result):
            entry, text = _process_company(company, "http://api", "s", True, 10)
        self.assertEqual(entry["unplaced"], 0)
        self.assertNotIn("unplaced_locations", text)
