import unittest

from acquire_aim500 import TARGET_QUOTAS, safe_stem, select_candidates


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


if __name__ == "__main__":
    unittest.main()
