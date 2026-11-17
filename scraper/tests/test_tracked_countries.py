import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tracked_countries import (  # noqa: E402
    COUNTRY_NAME_BY_CODE,
    TRACKED_CODES,
    TRACKED_NAMES,
    is_tracked_location,
)


class TrackedCountriesTest(unittest.TestCase):
    def test_codes_come_from_name_map(self):
        self.assertIsInstance(TRACKED_CODES, set)
        self.assertEqual(len(TRACKED_CODES), 25)
        self.assertEqual(TRACKED_CODES, set(COUNTRY_NAME_BY_CODE))

    def test_names_cover_every_code_plus_czech_variants(self):
        self.assertIsInstance(TRACKED_NAMES, set)
        for name in COUNTRY_NAME_BY_CODE.values():
            self.assertIn(name.lower(), TRACKED_NAMES)
        self.assertTrue({"czech", "czech republic", "czechia"} <= TRACKED_NAMES)
        self.assertEqual(len(TRACKED_NAMES), 27)

    def test_czech_republic_is_tracked(self):
        self.assertTrue(is_tracked_location("Prague, Czech Republic"))
        self.assertFalse(is_tracked_location("Pune, India"))


if __name__ == "__main__":
    unittest.main()
