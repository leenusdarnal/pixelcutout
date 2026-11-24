import json
import tempfile
import unittest
from pathlib import Path

from compare_alpha_scorecards import compare_scorecards


def make_card(error=0.2, image_hash_override=None, annotation_hash_override=None, case_ids=("B01", "B02")):
    cases = []
    for index, case_id in enumerate(case_ids):
        image_hash = (("a" if index == 0 else "c") * 64)
        annotation_hash = (("b" if index == 0 else "d") * 64)
        if image_hash_override and index == 0:
            image_hash = image_hash_override
        if annotation_hash_override and index == 0:
            annotation_hash = annotation_hash_override
        case_error = error + index * 0.02
        cases.append({
            "id": case_id,
            "width": 2 if index == 0 else 3,
            "height": 2,
            "pixels": 4 if index == 0 else 6,
            "input_identity": {
                "image_filename": f"{case_id.lower()}-image.png",
                "image_sha256": image_hash,
                "annotation_filename": f"{case_id.lower()}-alpha.png",
                "annotation_sha256": annotation_hash,
            },
            "metrics": {
                "mae": case_error,
                "sad_x1000": case_error * 100,
                "mse": case_error * case_error,
                "iou": 1 - case_error,
                "f1": 1 - case_error / 2,
                "boundary_f1": 1 - case_error / 3,
            },
        })

    metric_names = ("mae", "sad_x1000", "mse", "iou", "f1", "boundary_f1")
    macro = {
        metric: sum(case["metrics"][metric] for case in cases) / len(cases)
        for metric in metric_names
    }
    return {
        "schema_version": 1,
        "annotation_type": "alpha",
        "configuration": {
            "foreground_threshold_8bit": 128,
            "boundary_tolerance_pixels": 2,
        },
        "summary": {
            "case_count": len(cases),
            "pixel_count": sum(case["pixels"] for case in cases),
            "macro_average": macro,
            "pixel_weighted": dict(macro),
        },
        "cases": cases,
    }


class MatchedAlphaScorecardComparisonTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.baseline = self.root / "modnet.json"
        self.candidate = self.root / "birefnet.json"
        self.baseline.write_text(json.dumps(make_card(0.22)), encoding="utf-8")
        self.candidate.write_text(json.dumps(make_card(0.12)), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def write_candidate(self, card):
        self.candidate.write_text(json.dumps(card), encoding="utf-8")

    def compare(self):
        return compare_scorecards([
            ("MODNet-WASM", self.baseline),
            ("BiRefNet-WASM", self.candidate),
        ])

    def test_compares_identical_inputs_and_selects_metric_winners(self):
        result = self.compare()

        self.assertEqual(result["matched_input_count"], 2)
        self.assertEqual(len(result["input_signature_sha256"]), 64)
        self.assertEqual(
            result["winners"]["macro_average"]["mae"]["best"],
            ["BiRefNet-WASM"],
        )
        self.assertEqual(
            result["winners"]["macro_average"]["iou"]["best"],
            ["BiRefNet-WASM"],
        )
        self.assertEqual(len(result["per_case"]), 2)

    def test_rejects_different_source_image_hash(self):
        self.write_candidate(make_card(0.12, image_hash_override="e" * 64))

        with self.assertRaisesRegex(ValueError, "source image, ground-truth"):
            self.compare()

    def test_rejects_different_ground_truth_hash(self):
        self.write_candidate(make_card(0.12, annotation_hash_override="f" * 64))

        with self.assertRaisesRegex(ValueError, "source image, ground-truth"):
            self.compare()

    def test_rejects_different_case_sets(self):
        self.write_candidate(make_card(0.12, case_ids=("B01",)))

        with self.assertRaisesRegex(ValueError, "case set differs"):
            self.compare()

    def test_rejects_different_metric_thresholds(self):
        card = make_card(0.12)
        card["configuration"]["foreground_threshold_8bit"] = 127
        self.write_candidate(card)

        with self.assertRaisesRegex(ValueError, "metric thresholds differ"):
            self.compare()

    def test_rejects_missing_source_hash(self):
        card = make_card(0.12)
        card["cases"][0]["input_identity"]["image_sha256"] = None
        self.write_candidate(card)

        with self.assertRaisesRegex(ValueError, "valid image_sha256"):
            self.compare()

    def test_rejects_duplicate_case_ids(self):
        card = make_card(0.12)
        duplicate = dict(card["cases"][0])
        card["cases"].append(duplicate)
        card["summary"]["case_count"] = 3
        self.write_candidate(card)

        with self.assertRaisesRegex(ValueError, "non-empty and unique"):
            self.compare()

    def test_rejects_non_finite_scorecard_values(self):
        card = make_card(0.12)
        card["cases"][0]["metrics"]["mae"] = float("nan")
        self.write_candidate(card)

        with self.assertRaisesRegex(ValueError, "invalid numeric value NaN"):
            self.compare()

    def test_writes_machine_readable_comparison(self):
        output = self.root / "reports" / "matched.json"

        result = compare_scorecards([
            ("MODNet-WASM", self.baseline),
            ("BiRefNet-WASM", self.candidate),
        ], output_path=output)

        self.assertTrue(output.is_file())
        saved = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(saved["input_signature_sha256"], result["input_signature_sha256"])
        self.assertEqual(saved["matched_input_count"], 2)

    def test_requires_at_least_two_candidates(self):
        with self.assertRaisesRegex(ValueError, "at least two"):
            compare_scorecards([("MODNet", self.baseline)])


if __name__ == "__main__":
    unittest.main()
