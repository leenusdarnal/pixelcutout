import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from acquire_aim500 import (
    DATASET_REVISION,
    MIT_LICENSE_TEXT,
    PAPER_CITATION,
    TARGET_QUOTAS,
    safe_stem,
    select_candidates,
    write_candidate_set,
)


def row(category, image_name, item_type="SO"):
    return {
        "category": category,
        "image_name": image_name,
        "type": item_type,
        "image": None,
        "mask": None,
    }


class SafeStemTests(unittest.TestCase):
    def test_sanitizes_untrusted_upstream_names(self):
        self.assertEqual(safe_stem("../../a b/猫"), "a-b")

    def test_rejects_empty_stem(self):
        with self.assertRaises(ValueError):
            safe_stem("../")


class CandidateSelectionTests(unittest.TestCase):
    def setUp(self):
        self.rows = []
        for category, quota in TARGET_QUOTAS.items():
            for index in range(quota + 3):
                self.rows.append(row(category, f"{category}-{index:02d}", ("SO", "STM", "NS")[index % 3]))

    def test_selects_sixteen_deterministic_cases_with_category_quotas(self):
        first = select_candidates(self.rows)
        second = select_candidates(reversed(self.rows))
        self.assertEqual([r["image_name"] for r in first], [r["image_name"] for r in second])
        self.assertEqual(len(first), 16)
        self.assertEqual([r["case_id"] for r in first], [f"B{i:02d}" for i in range(1, 17)])
        counts = {category: 0 for category in TARGET_QUOTAS}
        for item in first:
            counts[item["category"]] += 1
        self.assertEqual(counts, TARGET_QUOTAS)

    def test_type_diversity_is_preferred_within_category(self):
        selected = select_candidates(self.rows)
        animal_types = {item["type"] for item in selected if item["category"] == "animal"}
        self.assertEqual(animal_types, {"SO", "STM", "NS"})

    def test_rejects_insufficient_category_quota(self):
        with self.assertRaisesRegex(ValueError, "need 3"):
            select_candidates([r for r in self.rows if r["category"] != "animal"])

    def test_rejects_duplicate_upstream_ids(self):
        duplicate = self.rows + [self.rows[0]]
        with self.assertRaisesRegex(ValueError, "Duplicate dataset image_name"):
            select_candidates(duplicate)


class MitComplianceTests(unittest.TestCase):
    def test_candidate_report_carries_mit_notice_and_required_citation(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "aim500"
            candidate = {
                "case_id": "B01",
                "image_name": "fixture-001",
                "category": "portrait",
                "type": "SO",
                "image": Image.new("RGB", (8, 6), (20, 40, 60)),
                "mask": Image.new("L", (8, 6), 128),
            }
            report = write_candidate_set(output, [candidate])

            self.assertEqual(report["schema_version"], 2)
            self.assertEqual(report["dataset_revision"], DATASET_REVISION)
            self.assertEqual(report["dataset_license"]["spdx"], "MIT")
            self.assertTrue(report["dataset_license"]["notice_included"])
            self.assertFalse(report["raw_image_redistribution_approved"])
            self.assertFalse(report["acquisition"]["pixels_uploaded"])
            self.assertIn("original owners", report["release_agreement"]["photo_copyright_statement"])
            self.assertTrue((output / "LICENSE-AIM-500.txt").is_file())
            self.assertEqual(
                (output / "LICENSE-AIM-500.txt").read_text(encoding="utf-8"),
                MIT_LICENSE_TEXT,
            )
            citation_file = (output / "CITATION-AIM-500.txt").read_text(encoding="utf-8")
            self.assertIn(PAPER_CITATION, citation_file)
            self.assertTrue(report["citation"]["required"])

            case = report["cases"][0]
            self.assertEqual(case["rights_status"], "dataset_mit_terms_applied_local_benchmark_only")
            self.assertEqual(case["photo_copyright"], "Original image owners; no transfer or re-licensing is claimed")
            self.assertEqual(case["annotation_type"], "alpha")
            self.assertTrue((output / "images" / case["filename"]).is_file())
            self.assertTrue((output / "masks" / case["annotation_filename"]).is_file())

    def test_report_records_mirror_revision_not_floating_main(self):
        self.assertRegex(DATASET_REVISION, r"^[0-9a-f]{40}$")


if __name__ == "__main__":
    unittest.main()
