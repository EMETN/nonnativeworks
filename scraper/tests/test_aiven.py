import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from platforms.aiven import scrape_aiven_static  # noqa: E402

LISTING_HTML = """
<html><head>
<script type="application/ld+json">{"@type":"ItemList","itemListElement":[
  {"@type":"ListItem","position":1,"name":"Backend Engineer",
   "url":"https://careers.aiven.io/openings/4902719101"}
]}</script>
</head><body>
<a href="/careers">Careers</a>
<ul aria-label="job-list">
  <li><div><a class="group" href="https://careers.aiven.io/openings/4902719101">
    <div><div class="mb-3"><p>Backend Engineer, ClickHouse</p></div>
    <div><p>Finland</p></div></div>
  </a></div></li>
  <li><div><a class="group" href="https://careers.aiven.io/openings/5000767101">
    <div><div class="mb-3"><p>Weâre Hiring: Sales &amp; Marketing</p></div>
    <div><p>United Kingdom</p></div></div>
  </a></div></li>
</ul>
</body></html>
""".encode()


class ScrapeAivenStaticTest(unittest.TestCase):
    def _scrape(self, html: bytes) -> list[dict]:
        resp = MagicMock(content=html)
        with patch("platforms.aiven.requests.get", return_value=resp):
            return scrape_aiven_static("https://aiven.io/careers/job")

    def test_reads_title_location_and_url_from_job_cards(self):
        self.assertEqual(
            self._scrape(LISTING_HTML),
            [
                {
                    "title": "Backend Engineer, ClickHouse",
                    "url": "https://careers.aiven.io/openings/4902719101",
                    "location": "Finland",
                },
                {
                    "title": "Weâre Hiring: Sales & Marketing",
                    "url": "https://careers.aiven.io/openings/5000767101",
                    "location": "United Kingdom",
                },
            ],
        )

    def test_page_without_job_cards_yields_no_jobs(self):
        self.assertEqual(self._scrape(b"<html><body></body></html>"), [])


if __name__ == "__main__":
    unittest.main()
