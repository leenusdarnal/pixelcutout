#!/usr/bin/env python3
"""Acquire a deterministic, local-only AIM-500 benchmark candidate set.

The official agreement requires the user to read and agree to its terms before
access. The runner must explicitly pass --accept-release-terms; this tool does
not accept legal terms on anyone's behalf.

The dataset is loaded through Hugging Face Datasets' supported default branch
path because supplying revision= disables the exported-Parquet path in the
installed Datasets loader. We resolve and compare both main and
refs/convert/parquet SHAs before and after loading. If either branch changes
during loading, acquisition stops before writing selected cases.
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
DATASET_REVISION_REF = "refs/convert/parquet"
DATASET_PAGE = "https://huggingface.co/datasets/nobg/AIM-500"
OFFICIAL_PROJECT = "https://github.com/JizhiziLi/AIM"
UPSTREAM_LICENSE_URL = "https://github.com/JizhiziLi/AIM/blob/master/LICENSE"
DATASET_AGREEMENT = "https://jizhizili.github.io/files/aim_dataset_agreement/AIM-500_Dataset_Release_Agreement.pdf"
PAPER_URL = "https://doi.org/10.24963/ijcai.2021/111"
PAPER_CITATION = (
    "Li, Jizhizi, Jing Zhang, and Dacheng Tao. "
    "Deep Automatic Natural Image Matting. Proceedings of the 30th "
    "International Joint Conference on Artificial Intelligence (IJCAI), 2021, "
    "pp. 800–806. https://doi.org/10.24963/ijcai.2021/111"
)
MIT_LICENSE_TEXT = """MIT License

Copyright (c) 2021 Jizhizi_Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
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
        candidates = sorted(
            by_category.get(category, []),
            key=lambda item: item["image_name"],
        )
        if len(candidates) < quota:
            raise ValueError(
                f"Dataset has only {len(candidates)} rows for {category}; need {quota}"
            )

        remaining = list(candidates)
        chosen: list[dict[str, Any]] = []
        for wanted_type in TYPE_ORDER:
            match = next(
                (item for item in remaining if item.get("type") == wanted_type),
                None,
            )
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


def resolve_revisions(api: Any) -> tuple[str, str]:
    """Return immutable main and generated-Parquet commit SHAs."""
    main_revision = api.dataset_info(
        repo_id=DATASET_ID,
        revision="main",
    ).sha
    parquet_revision = api.dataset_info(
        repo_id=DATASET_ID,
        revision=DATASET_REVISION_REF,
    ).sha
    for label, revision in (
        ("main", main_revision),
        (DATASET_REVISION_REF, parquet_revision),
    ):
        if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
            raise RuntimeError(
                f"Hugging Face did not return a full immutable commit SHA for {label}"
            )
    return main_revision, parquet_revision


def write_compliance_files(
    output_root: Path,
    main_revision: str,
    parquet_revision: str,
) -> None:
    """Keep the upstream MIT notice and required dataset citation with local pixels."""
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "LICENSE-AIM-500.txt").write_text(
        MIT_LICENSE_TEXT,
        encoding="utf-8",
    )
    citation = (
        "AIM-500 dataset citation\n\n"
        f"{PAPER_CITATION}\n\n"
        f"Official project: {OFFICIAL_PROJECT}\n"
        f"Dataset release agreement: {DATASET_AGREEMENT}\n"
        f"Dataset main snapshot: {DATASET_ID}@{main_revision}\n"
        f"Dataset Parquet snapshot: {DATASET_ID}@{parquet_revision} "
        f"({DATASET_REVISION_REF})\n"
        "The official release agreement states the dataset is under MIT and that "
        "the photographs were collected from websites with free-use licences; "
        "it also states that photograph copyright remains with the original owners.\n"
    )
    (output_root / "CITATION-AIM-500.txt").write_text(
        citation,
        encoding="utf-8",
    )


def write_candidate_set(
    output_root: Path,
    rows: Iterable[dict[str, Any]],
    main_revision: str,
    parquet_revision: str,
    release_terms_accepted: bool = False,
) -> dict[str, Any]:
    """Write lossless RGB PNGs, alpha PNGs, compliance notices, and metadata."""
    if not release_terms_accepted:
        raise ValueError(
            "Read the AIM-500 release agreement and pass "
            "--accept-release-terms before acquiring or using these files."
        )
    for label, revision in (
        ("main", main_revision),
        (DATASET_REVISION_REF, parquet_revision),
    ):
        if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
            raise ValueError(
                f"Dataset {label} revision must be a full 40-character commit SHA"
            )

    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError(
            "Install the local benchmark requirements: "
            "python -m pip install -r benchmarks/requirements.txt"
        ) from error

    image_dir = output_root / "images"
    mask_dir = output_root / "masks"
    image_dir.mkdir(parents=True, exist_ok=True)
    mask_dir.mkdir(parents=True, exist_ok=True)
    write_compliance_files(output_root, main_revision, parquet_revision)

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
            "dataset_license": "MIT",
            "dataset_license_copyright": "Copyright (c) 2021 Jizhizi_Li",
            "photo_copyright": "Original image owners; no transfer or re-licensing is claimed",
            "photo_source_license_note": (
                "The official release agreement says dataset images were collected "
                "from websites with free-use licences. The mirror does not supply "
                "original per-photo landing-page or licence URLs."
            ),
            "rights_status": "dataset_mit_terms_applied_local_benchmark_only",
            "redistribution_status": "not_redistributed_by_this_workflow",
            "attribution": PAPER_CITATION,
        })

    report = {
        "schema_version": 2,
        "dataset": DATASET_ID,
        "dataset_revision": main_revision,
        "dataset_parquet_revision": parquet_revision,
        "dataset_parquet_revision_ref": DATASET_REVISION_REF,
        "dataset_page": DATASET_PAGE,
        "official_project": OFFICIAL_PROJECT,
        "upstream_license_url": UPSTREAM_LICENSE_URL,
        "dataset_license": {
            "spdx": "MIT",
            "copyright": "Copyright (c) 2021 Jizhizi_Li",
            "notice_file": "LICENSE-AIM-500.txt",
            "notice_included": True,
            "terms_source": UPSTREAM_LICENSE_URL,
        },
        "release_agreement": {
            "url": DATASET_AGREEMENT,
            "dataset_license_statement": "The Dataset is under MIT license.",
            "image_source_statement": (
                "All the images in the Dataset are collected from websites with free use licenses."
            ),
            "photo_copyright_statement": (
                "The copyright of the images in the Dataset belongs to the original owners."
            ),
            "citation_required_for_research_documents": True,
            "indemnification_clause_present": True,
            "access_terms_acknowledged": True,
            "acknowledgement_method": (
                "Explicit user-supplied --accept-release-terms flag"
            ),
        },
        "citation": {
            "required": True,
            "file": "CITATION-AIM-500.txt",
            "text": PAPER_CITATION,
            "url": PAPER_URL,
        },
        "acquisition": {
            "split": "test",
            "selection": "deterministic category quotas; type diversity preferred",
            "dataset_revision_pinned": main_revision,
            "mirror_revision_ref": DATASET_REVISION_REF,
            "mirror_revision_pinned": parquet_revision,
            "pixels_uploaded": False,
            "raw_pixels_redistributed": False,
            "source_image_level_metadata": (
                "The mirror does not include original per-photo landing-page "
                "URLs or individual source licence URLs."
            ),
            "intended_use": (
                "Local model evaluation; preserve source copyright and include "
                "MIT notice/citation."
            ),
        },
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "rights_status": "dataset_mit_terms_applied_local_benchmark_only",
        "raw_image_redistribution_approved": False,
        "cases": cases,
    }
    report_path = output_root / "aim500-candidates.json"
    report_path.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("benchmarks/results/aim500"),
        help="Local output directory (default: benchmarks/results/aim500)",
    )
    parser.add_argument(
        "--accept-release-terms",
        action="store_true",
        help=(
            "Confirm that you personally read and agree to the official AIM-500 "
            "release agreement, including its access conditions and indemnification clause."
        ),
    )
    args = parser.parse_args()
    if not args.accept_release_terms:
        parser.error(
            "Download blocked. Read the AIM-500 release agreement and rerun with "
            "--accept-release-terms only if you agree to its terms."
        )

    try:
        from datasets import load_dataset
        from huggingface_hub import HfApi
    except ImportError as error:
        parser.error(
            "Install local-only dependencies first: "
            "python -m pip install -r benchmarks/requirements.txt"
        )

    api = HfApi()
    print("Resolving immutable AIM-500 main and Parquet snapshot SHAs.")
    main_before, parquet_before = resolve_revisions(api)

    # Important: don't pass revision= here. Datasets 4.x uses its exported
    # Parquet path only for the normal main branch and disables that path when
    # a custom revision is supplied. The library internally pins the Parquet
    # branch to a commit SHA while constructing the Dataset.
    dataset = load_dataset(DATASET_ID, split="test")

    main_after, parquet_after = resolve_revisions(api)
    if (main_before, parquet_before) != (main_after, parquet_after):
        raise RuntimeError(
            "AIM-500 main or Parquet snapshot changed while loading. "
            "No candidates were written; rerun to obtain a stable snapshot."
        )

    rows = select_candidates(dataset)
    report = write_candidate_set(
        args.output,
        rows,
        main_before,
        parquet_before,
        release_terms_accepted=True,
    )
    print(f"Wrote {len(report['cases'])} image/matte pairs to {args.output}")
    print("Included upstream MIT notice and IJCAI 2021 citation.")
    print("Pixels remain local; original photo copyrights remain with their owners.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
