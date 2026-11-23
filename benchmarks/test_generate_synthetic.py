import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from generate_synthetic import CASES, SIZE, generate


class SyntheticBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name) / "first"
        cls.manifest = generate(cls.root)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_generates_sixteen_project_owned_pairs(self):
        self.assertEqual(len(self.manifest["cases"]), 16)
        self.assertEqual([case["id"] for case in self.manifest["cases"]], [row[0] for row in CASES])
        self.assertIn("no third-party images", self.manifest["rights_notice"].lower())

        for case in self.manifest["cases"]:
            image_path = self.root / "images" / case["filename"]
            mask_path = self.root / "masks" / case["annotation_filename"]
            self.assertTrue(image_path.is_file())
            self.assertTrue(mask_path.is_file())
            with Image.open(image_path) as image, Image.open(mask_path) as mask:
                self.assertEqual(image.mode, "RGB")
                self.assertEqual(mask.mode, "L")
                self.assertEqual(image.size, (SIZE, SIZE))
                self.assertEqual(mask.size, image.size)
            self.assertEqual(case["origin"], "project-authored-procedural")
            self.assertEqual(case["rights_status"], "project-owned")
            self.assertEqual(case["external_image_inputs"], [])

    def test_mattes_have_antialiased_edges_and_glass_has_partial_opacity(self):
        for case in self.manifest["cases"]:
            mask_path = self.root / "masks" / case["annotation_filename"]
            with Image.open(mask_path) as image:
                values = set(image.getdata())
                self.assertIn(0, values, case["id"])
                self.assertGreater(len(values), 2, case["id"])
                if case["id"] == "B09":
                    self.assertGreater(max(values), 0)
                    self.assertLess(max(values), 255)

    def test_generation_is_deterministic(self):
        second_root = Path(self.temp.name) / "second"
        second = generate(second_root)
        first_hashes = [
            (case["sha256"], case["annotation_sha256"]) for case in self.manifest["cases"]
        ]
        second_hashes = [
            (case["sha256"], case["annotation_sha256"]) for case in second["cases"]
        ]
        self.assertEqual(first_hashes, second_hashes)
        self.assertEqual(
            (self.root / "manifest.json").read_bytes(),
            (second_root / "manifest.json").read_bytes()
        )

    def test_manifest_hashes_match_generated_files(self):
        for case in self.manifest["cases"]:
            for folder, filename_key, hash_key in (
                ("images", "filename", "sha256"),
                ("masks", "annotation_filename", "annotation_sha256"),
            ):
                path = self.root / folder / case[filename_key]
                actual = hashlib.sha256(path.read_bytes()).hexdigest()
                self.assertEqual(actual, case[hash_key])


if __name__ == "__main__":
    unittest.main()
