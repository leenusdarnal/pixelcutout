#!/usr/bin/env python3
"""Acquire a deterministic, local-only AIM-500 candidate set for PixelCutout.

This script never uploads image pixels and never marks photo rights as approved.
It writes candidate images/mattes and a metadata report under ignored benchmark paths.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

DATASET_ID = "nobg/AIM-500"
DATASET_VERSION = "Hugging Face dataset snapshot; record revision when available"
DATASET_PAGE = "https://huggingface.co/datasets/nobg/AIM-500"
DATASET_AGREEMENT = "https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf"
TARGET_QUOTAS = {
    "animal": 3,
    "portrait": 3,
    "plant": 2,
    "furniture": 2,
    "toy": 2,
    "transparent": 2,
    "fruit": 2,
}
TYPE_ORDER = ("SO", "STM", "NS")


def safe_stem(value: str) -> str:
    """Return a stable, filesystem-safe filename stem."""
    stem = re.sub(r"[^A-Za-z0-9_-]+", "-", str(value)).strip("-_")
    if not stem:
        raise ValueError("Dataset image_name did not contain a safe filename token")
    return stem[:100]


def select_candidates(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Select 16 deterministic rows, meeting category quotas and mixing known types."""
    by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_names: set[str] = set()

    for row in rows:
        category = row.get("category")
        name = row.get("image_name")
        if category not in TARGET_QUOTAS or not isinstance(name, str) or not name:
            continue
        if name in seen_names:
            raise ValueError(f"Duplicate dataset image_name: {name}")
        seen_names.add(name)
        by_category[category].append(row)

    selected: list[dict[str, Any]] = []
    for category, quota in TARGET_QUOTAS.items():
        candidates = sorted(by_category.get(category, []), key=lambda item: item["image_name"])
        if len(candidates) < quota:
            raise ValueError(
                f"Dataset has only {len(candidates)} rows for {category}; need {quota}"
            )

        remaining = list(candidates)
        chosen: list[dict[str, Any]] = []
        # Prefer type diversity in a deterministic order, then fill any remaining slots.
        for wanted_type in TYPE_ORDER:
            match = next((item for item in remaining if item.get("type") == wanted_type), None)
            if match is not None and len(chosen) < quota:
                chosen.append(match)
                remaining.remove(match)
        chosen.extend(remaining[: quota - len(chosen)])
        selected.extend(chosen)

    return [
        {"case_id": f"B{index:02d}", **row}
        for index, row in enumerate(selected, start=1)
    ]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_candidate_set(output_root: Path, rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Write lossless RGB PNGs, 8-bit grayscale alpha PNGs, and pending metadata."""
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Install the local benchmark requirements: python -m pip install -r benchmarks/requirements.txt") from error

    image_dir = output_root / "images"
    mask_dir = output_root / "masks"
    image_dir.mkdir(parents=True, exist_ok=True)
    mask_dir.mkdir(parents=True, exist_ok=True)

    cases = []
    for row in rows:
        case_id = row["case_id"]
        upstream_id = str(row["image_name"])
        stem = f"{case_id.lower()}-{safe_stem(upstream_id)}"
        image_path = image_dir / f"{stem}.png"
        mask_path = mask_dir / f"{stem}-alpha.png"

        image = row["image"]
        mask = row["mask"]
        if image is None or mask is None:
            raise ValueError(f"{case_id}: source image or alpha matte is missing")

        # Convert decoded RGB pixels to PNG without lossy recompression.
        image_rgb = image.convert("RGB")
        alpha = mask.convert("L")
        if image_rgb.size != alpha.size:
            raise ValueError(
                f"{case_id}: image dimensions {image_rgb.size} do not match matte {alpha.size}"
            )
        image_rgb.save(image_path, format="PNG", optimize=False)
        alpha.save(mask_path, format="PNG", optimize=False)

        cases.append({
            "case_id": case_id,
            "dataset_item_id": upstream_id,
            "category": row["category"],
            "type": row["type"],
            "filename": image_path.name,
            "annotation_filename": mask_path.name,
            "width": image_rgb.width,
            "height": image_rgb.height,
            "annotation_type": "alpha",
            "image_sha256": sha256(image_path),
            "annotation_sha256": sha256(mask_path),
            "image_bytes": image_path.stat().st_size,
            "annotation_bytes": mask_path.stat().st_size,
            "rights_status": "pending",
            "rights_note": (
                "Dataset card does not provide per-image source/licence evidence. "
                "Verify original photograph rights before commercial benchmark use."
            ),
        })

    report = {
        "schema_version": 1,
        "dataset": DATASET_ID,
        "dataset_page": DATASET_PAGE,
        "dataset_agreement": DATASET_AGREEMENT,
        "split": "test",
        "selection": "deterministic category quotas; type diversity preferred",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "rights_status": "pending",
        "commercial_use_approved": False,
        "cases": cases,
    }
    report_path = output_root / "aim500-candidates.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("benchmarks/results/aim500"),
        help="Local output directory (default: benchmarks/results/aim500)",
    )
    args = parser.parse_args()

    try:
        from datasets import load_dataset
    except ImportError as error:
        parser.error(
            "Install local-only dependencies first: "
            "python -m pip install -r benchmarks/requirements.txt"
        )

    print(f"Loading {DATASET_ID} test split. This downloads dataset files locally.")
    dataset = load_dataset(DATASET_ID, split="test")
    rows = select_candidates(dataset)
    report = write_candidate_set(args.output, rows)
    print(f"Wrote {len(report['cases'])} candidate image/matte pairs to {args.output}")
    print(f"Metadata report: {args.output / 'aim500-candidates.json'}")
    print("Rights status: PENDING — this is not commercial-use clearance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
