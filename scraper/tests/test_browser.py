import multiprocessing
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from browser import _run_in_subprocess


def _return_jobs(url: str) -> list[dict]:
    return [{"title": "Engineer", "url": url}]


def _raise_error(url: str) -> list[dict]:
    raise ValueError(url)


class RunInSubprocessTests(unittest.TestCase):
    def setUp(self) -> None:
        # macOS defaults to spawn, which pickles the process target.
        ctx = multiprocessing.get_context("spawn")
        for name in ("Process", "Queue"):
            patcher = mock.patch.object(multiprocessing, name, getattr(ctx, name))
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_returns_jobs_under_spawn(self) -> None:
        self.assertEqual(
            _run_in_subprocess(_return_jobs, "https://example.com", timeout=60),
            [{"title": "Engineer", "url": "https://example.com"}],
        )

    def test_returns_empty_when_target_raises_under_spawn(self) -> None:
        self.assertEqual(
            _run_in_subprocess(_raise_error, "https://example.com", timeout=60), []
        )


if __name__ == "__main__":
    unittest.main()
