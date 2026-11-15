"""Regression checks of the evidence parser, not a substitute for the live suite."""
import importlib.util
from pathlib import Path
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("compare_live", Path(__file__).with_name("compare-live.py"))
compare_live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compare_live)


class EvidenceParserTest(unittest.TestCase):
    def test_summary_is_not_a_test_and_multiline_assertions_are_kept(self):
        raw = "Running 2 tests...\n  FAIL: case A — first\nsecond\n\nlast\n  PASS: case B\n1/2 passed\nPASS: 0  FAIL: 1\n"
        result = compare_live.parse_tests(raw.encode())
        self.assertEqual(set(result), {"case A", "case B"})
        self.assertEqual(result["case A"]["assertions"], "first\nsecond\n\nlast")
        self.assertEqual(result["case B"]["status"], "PASS")

    def test_payload_difference_is_not_hidden_by_matching_failure_names(self):
        baseline = {"tests": {str(n): {"status": "PASS", "assertions": ""} for n in range(9)}}
        candidate = {"tests": {n: dict(value) for n, value in baseline["tests"].items()}}
        baseline["tests"]["0"] = {"status": "FAIL", "assertions": "echo: partial\nassertion"}
        candidate["tests"]["0"] = {"status": "FAIL", "assertions": "echo: longer partial\nassertion"}
        report = compare_live.comparison(baseline, candidate)
        self.assertTrue(report["complete_test_discovery"])
        self.assertFalse(report["exact_assertions_equal"])
        self.assertEqual(set(report["differences"]), {"0"})

    def test_incomplete_discovery_cannot_claim_equivalence(self):
        side = {"tests": {"one": {"status": "PASS", "assertions": ""}}}
        report = compare_live.comparison(side, side)
        self.assertFalse(report["complete_test_discovery"])
        self.assertFalse(report["exact_assertions_equal"])


if __name__ == "__main__":
    unittest.main()
