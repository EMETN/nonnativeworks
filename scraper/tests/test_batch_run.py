import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from batch_run import _company_urls, _merge_scrape_results  # noqa: E402


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
