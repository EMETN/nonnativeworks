import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from preview_diagnostics import (  # noqa: E402
    blocks_for,
    failed_urls,
    scraper_blocks,
    source_urls,
)

OUTPUT = """\
Scraping: WPP  (https://wpp.careersitecloud.com/search)
FAIL — validation: Only 0 positions found, expected >= 10
Scraping: Multi  (https://a.example/jobs, https://b.example/jobs)
FAIL — scrape error
════════════════════════════════════════════════════════════
Results: 1 succeeded, 0 warnings, 2 failed

Failed companies:
  https://wpp.careersitecloud.com/search — Only 0 positions found, expected >= 10
  https://a.example/jobs — 500 Server Error: boom — retry

Slowest companies:
      25s  WPP
"""

LOG = """\
[astro] server started
[python-scraper] exit code: 0
[python-scraper] stderr: Scraping: https://ok.example/jobs
generic: found 40 jobs
[python-scraper] stdout (10 chars): []
[python-scraper] exit code: 0
[python-scraper] stderr: Scraping: https://wpp.careersitecloud.com/search
generic: fetch error: 403 Client Error: Forbidden
[python-scraper] stdout (2 chars): []
[python-scraper] exit code: 0
[python-scraper] stderr: Scraping: https://b.example/jobs
bmw: fetch error: Read timed out
"""


class PreviewDiagnosticsTest(unittest.TestCase):
    def test_failed_urls_reads_the_summary_section(self):
        self.assertEqual(
            failed_urls(OUTPUT),
            ["https://wpp.careersitecloud.com/search", "https://a.example/jobs"],
        )

    def test_no_failed_section(self):
        self.assertEqual(failed_urls("Results: 3 succeeded, 0 warnings, 0 failed"), [])

    def test_source_urls_includes_extra_urls(self):
        self.assertEqual(
            source_urls(OUTPUT, "https://a.example/jobs"),
            ["https://a.example/jobs", "https://b.example/jobs"],
        )
        self.assertEqual(
            source_urls(OUTPUT, "https://x.example"), ["https://x.example"]
        )

    def test_blocks_split_on_exit_code_lines(self):
        self.assertEqual(len(scraper_blocks(LOG)), 3)

    def test_only_the_failed_company_block_is_selected(self):
        blocks = blocks_for(LOG, ["https://wpp.careersitecloud.com/search"])
        self.assertEqual(len(blocks), 1)
        text = "\n".join(blocks[0])
        self.assertIn("403 Client Error", text)
        self.assertNotIn("found 40 jobs", text)

    def test_extra_url_block_is_found(self):
        blocks = blocks_for(LOG, ["https://a.example/jobs", "https://b.example/jobs"])
        self.assertEqual(len(blocks), 1)
        self.assertIn("Read timed out", "\n".join(blocks[0]))

    def test_unrelated_url_matches_nothing(self):
        self.assertEqual(blocks_for(LOG, ["https://nope.example"]), [])


if __name__ == "__main__":
    unittest.main()
