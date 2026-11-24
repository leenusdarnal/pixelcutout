#!/usr/bin/env python3
"""Compare local alpha scorecards only when they cover identical verified inputs.

The comparison is deliberately strict: every case must carry the source-image
and ground-truth SHA-256 values recorded by the scorer, and the metric
configuration and complete case set must match across candidates.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

METRICS = ("mae", "sad_x1000", "mse", "iou", "f1", "boundary_f1")
LOWER_IS_BETTER = ("mae", "sad_x1000", "mse")
HIGHER_IS_BETTER = ("iou", "f1", "boundary_f1")
HASH_PATTERN = re.compile(r"^[a-f0-9]{64}$")
CONFIGURATION_KEYS = (
    "foreground_threshold_8bit",
    "boundary_tolerance_pixels",
)


def _safe_filename(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value
        or value in {".", ".."}
        or Path(value).name != value
        or "/" in value
        or "\\" in value
    ):
        raise ValueError(f"{label} must be a simple filename")
    return value


def _metric_value(value: Any, metric: str, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label}: metric '{metric}' must be numeric")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{label}: metric '{metric}' must be finite")
    if metric != "sad_x1000" and not 0 <= number <= 1:
        raise ValueError(f"{label}: metric '{metric}' must be between 0 and 1")
    return number


def _load_candidate(name: str, path: Path) -> dict[str, Any]:
    label = f"{name} ({path})"
    with path.open("r", encoding="utf-8") as handle:
        scorecard = json.load(handle, parse_constant=lambda value: (_ for _ in ()).throw(
            ValueError(f"{label}: invalid numeric value {value}")
        ))

    if not isinstance(scorecard, dict) or scorecard.get("schema_version") != 1:
        raise ValueError(f"{label}: unsupported alpha scorecard schema")
    if scorecard.get("annotation_type") != "alpha":
        raise ValueError(f"{label}: only soft-alpha scorecards can be compared")

    configuration = scorecard.get("configuration")
    if not isinstance(configuration, dict):
        raise ValueError(f"{label}: scorecard has no metric configuration")
    selected_configuration = {}
    for key in CONFIGURATION_KEYS:
        value = configuration.get(key)
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError(f"{label}: configuration field '{key}' must be an integer")
        selected_configuration[key] = value

    raw_cases = scorecard.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise ValueError(f"{label}: scorecard has no per-case results")

    cases: dict[str, dict[str, Any]] = {}
    identity: dict[str, tuple[Any, ...]] = {}
    pixel_total = 0
    macro_totals = {metric: 0.0 for metric in METRICS}

    for case in raw_cases:
        if not isinstance(case, dict):
            raise ValueError(f"{label}: each case result must be an object")
        case_id = case.get("id")
        if not isinstance(case_id, str) or not case_id or case_id in cases:
            raise ValueError(f"{label}: case IDs must be non-empty and unique")

        width = case.get("width")
        height = case.get("height")
        pixels = case.get("pixels")
        for field, value in (("width", width), ("height", height), ("pixels", pixels)):
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{label}: {case_id} has invalid {field}")
        if pixels != width * height:
            raise ValueError(f"{label}: {case_id} pixel count does not match its dimensions")

        inputs = case.get("input_identity")
        if not isinstance(inputs, dict):
            raise ValueError(f"{label}: {case_id} is missing verified input identity metadata")
        image_filename = _safe_filename(inputs.get("image_filename"), f"{label} {case_id} image filename")
        annotation_filename = _safe_filename(
            inputs.get("annotation_filename"),
            f"{label} {case_id} annotation filename",
        )
        image_hash = inputs.get("image_sha256")
        annotation_hash = inputs.get("annotation_sha256")
        for hash_label, digest in (("image_sha256", image_hash), ("annotation_sha256", annotation_hash)):
            if not isinstance(digest, str) or not HASH_PATTERN.fullmatch(digest.lower()):
                raise ValueError(f"{label}: {case_id} is missing a valid {hash_label}")
        identity[case_id] = (
            image_filename,
            image_hash.lower(),
            annotation_filename,
            annotation_hash.lower(),
            width,
            height,
            pixels,
        )

        metrics = case.get("metrics")
        if not isinstance(metrics, dict):
            raise ValueError(f"{label}: {case_id} has no metrics")
        checked_metrics = {
            metric: _metric_value(metrics.get(metric), metric, f"{label} {case_id}")
            for metric in METRICS
        }
        for metric, value in checked_metrics.items():
            macro_totals[metric] += value

        cases[case_id] = {
            "width": width,
            "height": height,
            "pixels": pixels,
            "metrics": checked_metrics,
        }
        pixel_total += pixels

    summary = scorecard.get("summary")
    if not isinstance(summary, dict):
        raise ValueError(f"{label}: scorecard has no summary")
    if summary.get("case_count") != len(cases) or summary.get("pixel_count") != pixel_total:
        raise ValueError(f"{label}: summary counts do not match per-case results")

    macro_average = summary.get("macro_average")
    pixel_weighted = summary.get("pixel_weighted")
    if not isinstance(macro_average, dict) or not isinstance(pixel_weighted, dict):
        raise ValueError(f"{label}: scorecard must include macro and pixel-weighted summaries")

    for metric in METRICS:
        macro = _metric_value(macro_average.get(metric), metric, f"{label} macro average")
        _metric_value(pixel_weighted.get(metric), metric, f"{label} pixel-weighted average")
        calculated_macro = macro_totals[metric] / len(cases)
        if not math.isclose(macro, calculated_macro, rel_tol=1e-9, abs_tol=1e-12):
            raise ValueError(f"{label}: macro average for '{metric}' does not match per-case metrics")

    return {
        "name": name,
        "path": str(path.resolve()),
        "scorecard": scorecard,
        "configuration": selected_configuration,
        "cases": cases,
        "identity": identity,
        "summary": summary,
    }


def _winner(values: dict[str, float], lower_is_better: bool) -> list[str]:
    best_value = (min if lower_is_better else max)(values.values())
    return [
        name
        for name, value in values.items()
        if math.isclose(value, best_value, rel_tol=1e-12, abs_tol=1e-15)
    ]


def compare_scorecards(
    candidates: list[tuple[str, Path]],
    output_path: Path | None = None,
) -> dict[str, Any]:
    """Compare two or more scorecards after strict matched-input validation."""
    if len(candidates) < 2:
        raise ValueError("Provide at least two --candidate NAME=PATH scorecards")

    names = [name for name, _ in candidates]
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise ValueError("Candidate names must be non-empty")
    if len(set(names)) != len(names):
        raise ValueError("Candidate names must be unique")

    loaded = [_load_candidate(name, Path(path)) for name, path in candidates]
    reference = loaded[0]
    for candidate in loaded[1:]:
        if candidate["configuration"] != reference["configuration"]:
            raise ValueError(
                f"{candidate['name']}: metric thresholds differ from {reference['name']}"
            )
        if candidate["identity"] != reference["identity"]:
            reference_ids = set(reference["identity"])
            candidate_ids = set(candidate["identity"])
            if reference_ids != candidate_ids:
                missing = sorted(reference_ids - candidate_ids)
                extra = sorted(candidate_ids - reference_ids)
                raise ValueError(
                    f"{candidate['name']}: case set differs from {reference['name']} "
                    f"(missing={missing}, extra={extra})"
                )
            for case_id in sorted(reference_ids):
                if candidate["identity"][case_id] != reference["identity"][case_id]:
                    raise ValueError(
                        f"{candidate['name']}: {case_id} source image, ground-truth "
                        "hash, filename, or dimensions differ from "
                        f"{reference['name']}"
                    )

    ordered_ids = sorted(reference["cases"])
    signature_payload = [
        {
            "id": case_id,
            "image_filename": reference["identity"][case_id][0],
            "image_sha256": reference["identity"][case_id][1],
            "annotation_filename": reference["identity"][case_id][2],
            "annotation_sha256": reference["identity"][case_id][3],
            "width": reference["identity"][case_id][4],
            "height": reference["identity"][case_id][5],
        }
        for case_id in ordered_ids
    ]
    input_signature = hashlib.sha256(
        json.dumps(signature_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    winners: dict[str, dict[str, Any]] = {}
    for aggregation in ("macro_average", "pixel_weighted"):
        winners[aggregation] = {}
        for metric in METRICS:
            values = {
                candidate["name"]: float(candidate["summary"][aggregation][metric])
                for candidate in loaded
            }
            lower = metric in LOWER_IS_BETTER
            winners[aggregation][metric] = {
                "direction": "lower is better" if lower else "higher is better",
                "values": values,
                "best": _winner(values, lower),
            }

    per_case = []
    for case_id in ordered_ids:
        per_case.append({
            "id": case_id,
            "width": reference["cases"][case_id]["width"],
            "height": reference["cases"][case_id]["height"],
            "metrics": {
                candidate["name"]: candidate["cases"][case_id]["metrics"]
                for candidate in loaded
            },
        })

    result = {
        "schema_version": 1,
        "tool": "PixelCutout matched alpha scorecard comparison",
        "matched_input_count": len(ordered_ids),
        "input_signature_sha256": input_signature,
        "configuration": reference["configuration"],
        "candidates": [
            {
                "name": candidate["name"],
                "scorecard": candidate["path"],
                "summary": candidate["summary"],
            }
            for candidate in loaded
        ],
        "winners": winners,
        "per_case": per_case,
        "comparison_policy": (
            "Candidates are compared only when case IDs, source-image SHA-256, "
            "ground-truth alpha SHA-256, filenames, dimensions, and metric "
            "configuration match exactly."
        ),
    }

    if output_path is not None:
        output_path = output_path.resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return result


def _parse_candidate(value: str) -> tuple[str, Path]:
    name, separator, raw_path = value.partition("=")
    if not separator or not name.strip() or not raw_path.strip():
        raise argparse.ArgumentTypeError("Use NAME=PATH, for example MODNet=results/modnet/scorecard.json")
    return name.strip(), Path(raw_path.strip())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--candidate",
        action="append",
        type=_parse_candidate,
        required=True,
        metavar="NAME=PATH",
        help="Candidate scorecard; repeat at least twice",
    )
    parser.add_argument("--output", type=Path, help="Optional matched-comparison JSON output")
    args = parser.parse_args()

    try:
        result = compare_scorecards(args.candidate, args.output)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))

    print(
        f"Compared {len(result['candidates'])} candidates on "
        f"{result['matched_input_count']} identical cases "
        f"(input signature {result['input_signature_sha256'][:12]})."
    )
    print()
    print(f"{'Metric (macro average)':<24} " + "  ".join(
        f"{candidate['name']:>18}" for candidate in result["candidates"]
    ) + "  Winner")
    for metric in METRICS:
        item = result["winners"]["macro_average"][metric]
        values = "  ".join(f"{value:18.6f}" for value in item["values"].values())
        print(f"{metric:<24} {values}  {', '.join(item['best'])}")
    if args.output:
        print(f"\nComparison written to {args.output}")
    print("\nLower is better for MAE, SAD/1000, and MSE; higher is better for IoU, F1, and boundary F1.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
