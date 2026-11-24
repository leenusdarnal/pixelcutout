import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from evaluate_alpha import evaluate_manifest, score_case


class AlphaBenchmarkScorerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.mask_dir = self.root / "masks"
        self.predictions_dir = self.root / "predictions"
        self.mask_dir.mkdir()
        self.predictions_dir.mkdir()
        self.images_dir = self.root / "images"
        self.images_dir.mkdir()
        self.mask_path = self.mask_dir / "b01-alpha.png"
        self.prediction_path = self.predictions_dir / "B01.png"
        self.manifest_path = self.root / "manifest.json"

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self, mask, **case_overrides):
        mask.save(self.mask_path, format="PNG")
        image_path = self.images_dir / "b01.png"
        Image.new("RGB", mask.size, (40, 80, 120)).save(image_path, format="PNG")
        case = {
            "id": "B01",
            "filename": image_path.name,
            "image_sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
            "annotation_filename": self.mask_path.name,
            "annotation_type": "alpha",
            "annotation_sha256": hashlib.sha256(self.mask_path.read_bytes()).hexdigest(),
            **case_overrides,
        }
        self.manifest_path.write_text(
            json.dumps({"schema_version": 1, "cases": [case]}),
            encoding="utf-8",
        )
        return case

    def test_identical_soft_alpha_scores_perfectly(self):
        mask = Image.new("L", (4, 4), 0)
        mask.putpixel((1, 1), 64)
        mask.putpixel((2, 1), 128)
        mask.putpixel((2, 2), 255)
        self.write_manifest(mask)
        mask.save(self.prediction_path, format="PNG")

        result = evaluate_manifest(self.manifest_path, self.predictions_dir)

        metrics = result["cases"][0]["metrics"]
        self.assertEqual(metrics["mae"], 0)
        self.assertEqual(metrics["sad_x1000"], 0)
        self.assertEqual(metrics["mse"], 0)
        self.assertEqual(metrics["iou"], 1)
        self.assertEqual(metrics["f1"], 1)
        self.assertEqual(metrics["boundary_f1"], 1)
        self.assertEqual(result["summary"]["case_count"], 1)
        self.assertEqual(result["summary"]["pixel_count"], 16)

    def test_soft_alpha_error_is_not_binarised_for_mae_or_mse(self):
        mask = Image.new("L", (2, 2), 0)
        mask.putpixel((0, 0), 255)
        mask.putpixel((1, 1), 64)
        self.write_manifest(mask)
        prediction = Image.new("L", (2, 2), 0)
        prediction.putpixel((0, 0), 127)
        prediction.putpixel((1, 1), 64)
        prediction.save(self.prediction_path, format="PNG")

        result = evaluate_manifest(self.manifest_path, self.predictions_dir)
        metrics = result["cases"][0]["metrics"]

        self.assertAlmostEqual(metrics["mae"], 128 / (255 * 4))
        self.assertAlmostEqual(metrics["sad_x1000"], 0.128)
        self.assertAlmostEqual(metrics["mse"], (128 ** 2) / ((255 ** 2) * 4))
        self.assertEqual(metrics["iou"], 0)
        self.assertEqual(metrics["f1"], 0)
        self.assertEqual(metrics["boundary_f1"], 0)

    def test_rgba_prediction_uses_alpha_channel(self):
        mask = Image.new("L", (2, 2), 0)
        mask.putpixel((0, 0), 128)
        self.write_manifest(mask)
        prediction = Image.new("RGBA", (2, 2), (255, 0, 0, 0))
        prediction.putpixel((0, 0), (0, 255, 0, 128))
        prediction.save(self.prediction_path, format="PNG")

        result = evaluate_manifest(self.manifest_path, self.predictions_dir)

        self.assertEqual(result["cases"][0]["metrics"]["mae"], 0)

    def test_rejects_dimension_mismatch_without_resizing(self):
        mask = Image.new("L", (2, 2), 255)
        mask.putpixel((0, 0), 128)
        self.write_manifest(mask)
        Image.new("L", (3, 2), 255).save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "dimensions"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_rejects_rgb_prediction_without_alpha_channel(self):
        mask = Image.new("L", (2, 2), 128)
        self.write_manifest(mask)
        Image.new("RGB", (2, 2), (255, 0, 0)).save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "8-bit grayscale PNG or a PNG with an alpha channel"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_rejects_binary_annotations_from_alpha_scorecard(self):
        mask = Image.new("L", (2, 2), 255)
        case = self.write_manifest(mask, annotation_type="binary")
        mask.save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "must be 'alpha'"):
            score_case(case, self.mask_dir, self.predictions_dir)

    def test_rejects_binary_pixels_even_when_manifest_says_alpha(self):
        mask = Image.new("L", (4, 4), 0)
        mask.putpixel((1, 1), 255)
        self.write_manifest(mask)
        mask.save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "ground-truth annotation is binary"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_rejects_rgb_ground_truth_instead_of_converting_it_to_luminance(self):
        mask = Image.new("RGB", (2, 2), (255, 255, 255))
        mask_path = self.mask_dir / "rgb-mask.png"
        mask.save(mask_path, format="PNG")
        Image.new("L", (2, 2), 128).save(self.prediction_path, format="PNG")
        case = {
            "id": "B01",
            "annotation_filename": mask_path.name,
            "annotation_type": "alpha",
        }

        with self.assertRaisesRegex(ValueError, "8-bit grayscale PNG"):
            score_case(case, self.mask_dir, self.predictions_dir)

    def test_rejects_prediction_missing_from_local_folder(self):
        mask = Image.new("L", (2, 2), 0)
        mask.putpixel((0, 0), 128)
        self.write_manifest(mask)

        with self.assertRaisesRegex(FileNotFoundError, "predicted alpha"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_rejects_path_traversal_in_manifest(self):
        mask = Image.new("L", (2, 2), 255)
        case = self.write_manifest(mask, annotation_filename="../outside.png")
        mask.save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "must not contain a directory path"):
            score_case(case, self.mask_dir, self.predictions_dir)

    def test_rejects_ground_truth_hash_mismatch(self):
        mask = Image.new("L", (2, 2), 255)
        self.write_manifest(mask)
        Image.new("L", (2, 2), 0).save(self.mask_path)
        mask.save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "SHA-256"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_rejects_source_image_hash_mismatch(self):
        mask = Image.new("L", (2, 2), 128)
        self.write_manifest(mask)
        Image.new("RGB", (2, 2), (1, 2, 3)).save(self.images_dir / "b01.png")
        mask.save(self.prediction_path)

        with self.assertRaisesRegex(ValueError, "source image SHA-256"):
            evaluate_manifest(self.manifest_path, self.predictions_dir)

    def test_scorecard_records_verified_source_identity(self):
        mask = Image.new("L", (2, 2), 128)
        case = self.write_manifest(mask)
        mask.save(self.prediction_path)

        result = evaluate_manifest(self.manifest_path, self.predictions_dir)
        identity = result["cases"][0]["input_identity"]

        self.assertEqual(identity["image_sha256"], case["image_sha256"])
        self.assertEqual(identity["annotation_sha256"], case["annotation_sha256"])
        self.assertEqual(identity["image_filename"], "b01.png")
        self.assertEqual(identity["annotation_filename"], "b01-alpha.png")

    def test_writes_machine_readable_scorecard(self):
        mask = Image.new("L", (2, 2), 128)
        self.write_manifest(mask)
        mask.save(self.prediction_path)
        output = self.root / "results" / "scores.json"

        result = evaluate_manifest(
            self.manifest_path,
            self.predictions_dir,
            output_path=output,
        )

        self.assertTrue(output.is_file())
        saved = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(saved["schema_version"], 1)
        self.assertEqual(saved["summary"], result["summary"])
        self.assertIn("macro_average", saved["summary"])
        self.assertIn("pixel_weighted", saved["summary"])


if __name__ == "__main__":
    unittest.main()
