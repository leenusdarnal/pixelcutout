#!/usr/bin/env python3
"""Score local predicted alpha mattes against a benchmark manifest.

The tool reads only local PNG files and writes numeric metadata. It does not
upload images, start model inference, or add application dependencies.
Predictions are named <case-id>.png unless a case sets prediction_filename.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageFilter

SCHEMA_VERSION = 1
METRIC_NAMES = ("mae", "sad_x1000", "mse", "iou", "f1", "boundary_f1")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_filename(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value in {".", ".."}:
        raise ValueError(f"{label} must be a non-empty filename")
    if Path(value).name != value or "/" in value or "\\" in value:
        raise ValueError(f"{label} must not contain a directory path: {value!r}")
    return value


def _local_file(root: Path, filename: str, label: str) -> Path:
    path = root / filename
    if path.resolve().parent != root.resolve():
        raise ValueError(f"{label} resolves outside its local directory")
    if not path.is_file():
        raise FileNotFoundError(f"{label} not found: {path}")
    return path


def _read_alpha(path: Path, label: str) -> Image.Image:
    with Image.open(path) as source:
        if source.mode in ("RGBA", "LA"):
            alpha = source.getchannel("A")
        elif "transparency" in source.info:
            alpha = source.convert("RGBA").getchannel("A")
        else:
            alpha = source.convert("L")
        result = alpha.copy()
    if result.width < 1 or result.height < 1:
        raise ValueError(f"{label} has invalid dimensions")
    return result


def _binary_metrics(
    ground_truth: Image.Image,
    prediction: Image.Image,
    threshold: int,
) -> tuple[dict[str, float], dict[str, int]]:
    gt_values = ground_truth.tobytes()
    pred_values = prediction.tobytes()
    true_positive = false_positive = false_negative = 0

    for gt, pred in zip(gt_values, pred_values):
        gt_foreground = gt >= threshold
        pred_foreground = pred >= threshold
        if gt_foreground and pred_foreground:
            true_positive += 1
        elif pred_foreground:
            false_positive += 1
        elif gt_foreground:
            false_negative += 1

    union = true_positive + false_positive + false_negative
    f1_denominator = 2 * true_positive + false_positive + false_negative
    metrics = {
        "iou": true_positive / union if union else 1.0,
        "f1": (2 * true_positive / f1_denominator) if f1_denominator else 1.0,
    }
    counts = {
        "true_positive": true_positive,
        "false_positive": false_positive,
        "false_negative": false_negative,
    }
    return metrics, counts


def _boundary_f1(
    ground_truth: Image.Image,
    prediction: Image.Image,
    threshold: int,
    tolerance: int,
) -> tuple[float, dict[str, int]]:
    gt_binary = ground_truth.point(lambda value: 255 if value >= threshold else 0)
    pred_binary = prediction.point(lambda value: 255 if value >= threshold else 0)

    gt_boundary = ImageChops.subtract(
        gt_binary,
        gt_binary.filter(ImageFilter.MinFilter(3)),
    )
    pred_boundary = ImageChops.subtract(
        pred_binary,
        pred_binary.filter(ImageFilter.MinFilter(3)),
    )

    gt_edges = gt_boundary.tobytes()
    pred_edges = pred_boundary.tobytes()
    gt_edge_count = sum(value > 0 for value in gt_edges)
    pred_edge_count = sum(value > 0 for value in pred_edges)

    if tolerance:
        filter_size = tolerance * 2 + 1
        gt_dilated = gt_boundary.filter(ImageFilter.MaxFilter(filter_size)).tobytes()
        pred_dilated = pred_boundary.filter(ImageFilter.MaxFilter(filter_size)).tobytes()
    else:
        gt_dilated = gt_edges
        pred_dilated = pred_edges

    matched_prediction = sum(
        pred > 0 and nearby_gt > 0
        for pred, nearby_gt in zip(pred_edges, gt_dilated)
    )
    matched_ground_truth = sum(
        gt > 0 and nearby_pred > 0
        for gt, nearby_pred in zip(gt_edges, pred_dilated)
    )

    if gt_edge_count == 0 and pred_edge_count == 0:
        score = 1.0
    elif gt_edge_count == 0 or pred_edge_count == 0:
        score = 0.0
    else:
        precision = matched_prediction / pred_edge_count
        recall = matched_ground_truth / gt_edge_count
        score = (
            2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0
        )

    return score, {
        "ground_truth_edges": gt_edge_count,
        "predicted_edges": pred_edge_count,
        "matched_ground_truth_edges": matched_ground_truth,
        "matched_predicted_edges": matched_prediction,
    }


def score_case(
    case: dict[str, Any],
    ground_truth_dir: Path,
    predictions_dir: Path,
    threshold: int = 128,
    boundary_tolerance: int = 2,
) -> dict[str, Any]:
    """Score one alpha prediction; masks are never resized or binarised for MAE/MSE/SAD."""
    case_id = case.get("id", case.get("case_id"))
    if not isinstance(case_id, str) or not case_id or Path(case_id).name != case_id:
        raise ValueError(f"Case has an invalid id: {case_id!r}")

    annotation_type = case.get("annotation_type", "alpha")
    if annotation_type != "alpha":
        raise ValueError(
            f"{case_id}: annotation_type must be 'alpha'; binary masks need a separate scorecard"
        )

    mask_name = _safe_filename(case.get("annotation_filename"), f"{case_id} annotation_filename")
    prediction_name = _safe_filename(
        case.get("prediction_filename", f"{case_id}.png"),
        f"{case_id} prediction_filename",
    )
    mask_path = _local_file(ground_truth_dir, mask_name, f"{case_id} ground-truth alpha")
    prediction_path = _local_file(
        predictions_dir,
        prediction_name,
        f"{case_id} predicted alpha",
    )

    expected_hash = case.get("annotation_sha256")
    if expected_hash:
        actual_hash = _sha256(mask_path)
        if actual_hash.lower() != str(expected_hash).lower():
            raise ValueError(f"{case_id}: ground-truth alpha SHA-256 does not match the manifest")

    ground_truth = _read_alpha(mask_path, f"{case_id} ground-truth alpha")
    prediction = _read_alpha(prediction_path, f"{case_id} prediction")
    if prediction.size != ground_truth.size:
        raise ValueError(
            f"{case_id}: prediction dimensions {prediction.size} do not match "
            f"ground truth {ground_truth.size}; predictions are not resized automatically"
        )

    difference = ImageChops.difference(ground_truth, prediction)
    histogram = difference.histogram()
    absolute_error = sum(level * count for level, count in enumerate(histogram))
    squared_error = sum(level * level * count for level, count in enumerate(histogram))
    pixel_count = ground_truth.width * ground_truth.height
    mae = absolute_error / (255 * pixel_count)
    mse = squared_error / ((255 ** 2) * pixel_count)

    overlap, binary_counts = _binary_metrics(ground_truth, prediction, threshold)
    boundary_f1, boundary_counts = _boundary_f1(
        ground_truth,
        prediction,
        threshold,
        boundary_tolerance,
    )

    return {
        "id": case_id,
        "width": ground_truth.width,
        "height": ground_truth.height,
        "pixels": pixel_count,
        "metrics": {
            "mae": mae,
            "sad_x1000": absolute_error / 1000,
            "mse": mse,
            **overlap,
            "boundary_f1": boundary_f1,
        },
        "counts": {
            **binary_counts,
            **boundary_counts,
            "absolute_error_8bit": absolute_error,
            "squared_error_8bit": squared_error,
        },
    }


def _f1_from_counts(true_positive: int, false_positive: int, false_negative: int) -> float:
    denominator = 2 * true_positive + false_positive + false_negative
    return 2 * true_positive / denominator if denominator else 1.0


def _iou_from_counts(true_positive: int, false_positive: int, false_negative: int) -> float:
    denominator = true_positive + false_positive + false_negative
    return true_positive / denominator if denominator else 1.0


def _summarise(scores: list[dict[str, Any]]) -> dict[str, Any]:
    if not scores:
        raise ValueError("The benchmark manifest contains no cases")

    macro = {
        name: sum(score["metrics"][name] for score in scores) / len(scores)
        for name in METRIC_NAMES
    }

    total_pixels = sum(score["pixels"] for score in scores)
    total_absolute = sum(score["counts"]["absolute_error_8bit"] for score in scores)
    total_squared = sum(score["counts"]["squared_error_8bit"] for score in scores)
    tp = sum(score["counts"]["true_positive"] for score in scores)
    fp = sum(score["counts"]["false_positive"] for score in scores)
    fn = sum(score["counts"]["false_negative"] for score in scores)
    gt_edges = sum(score["counts"]["ground_truth_edges"] for score in scores)
    pred_edges = sum(score["counts"]["predicted_edges"] for score in scores)
    matched_gt = sum(score["counts"]["matched_ground_truth_edges"] for score in scores)
    matched_pred = sum(score["counts"]["matched_predicted_edges"] for score in scores)

    if gt_edges == 0 and pred_edges == 0:
        boundary_f1 = 1.0
    elif gt_edges == 0 or pred_edges == 0:
        boundary_f1 = 0.0
    else:
        precision = matched_pred / pred_edges
        recall = matched_gt / gt_edges
        boundary_f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    pixel_weighted = {
        "mae": total_absolute / (255 * total_pixels),
        "sad_x1000": total_absolute / 1000,
        "mse": total_squared / ((255 ** 2) * total_pixels),
        "iou": _iou_from_counts(tp, fp, fn),
        "f1": _f1_from_counts(tp, fp, fn),
        "boundary_f1": boundary_f1,
    }

    return {
        "case_count": len(scores),
        "pixel_count": total_pixels,
        "macro_average": macro,
        "pixel_weighted": pixel_weighted,
    }


def evaluate_manifest(
    manifest_path: Path,
    predictions_dir: Path,
    output_path: Path | None = None,
    ground_truth_dir: Path | None = None,
    threshold: int = 128,
    boundary_tolerance: int = 2,
) -> dict[str, Any]:
    """Evaluate every case in a synthetic or AIM-500 local manifest."""
    if not 0 <= threshold <= 255:
        raise ValueError("threshold must be between 0 and 255")
    if not 0 <= boundary_tolerance <= 32:
        raise ValueError("boundary_tolerance must be between 0 and 32")

    manifest_path = manifest_path.resolve()
    predictions_dir = predictions_dir.resolve()
    ground_truth_dir = (ground_truth_dir or manifest_path.parent / "masks").resolve()

    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    cases = manifest.get("cases") if isinstance(manifest, dict) else None
    if not isinstance(cases, list) or not cases:
        raise ValueError("Manifest must contain a non-empty 'cases' array")

    identifiers = [case.get("id", case.get("case_id")) for case in cases]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Manifest contains duplicate case IDs")

    scores = [
        score_case(case, ground_truth_dir, predictions_dir, threshold, boundary_tolerance)
        for case in cases
    ]
    result = {
        "schema_version": SCHEMA_VERSION,
        "tool": "PixelCutout local alpha benchmark scorer",
        "manifest": str(manifest_path),
        "prediction_directory": str(predictions_dir),
        "ground_truth_directory": str(ground_truth_dir),
        "annotation_type": "alpha",
        "configuration": {
            "foreground_threshold_8bit": threshold,
            "boundary_tolerance_pixels": boundary_tolerance,
            "prediction_filename": "<case-id>.png unless prediction_filename is set per case",
            "dimension_policy": "exact match required; no automatic resize",
            "soft_alpha_metrics": "MAE, SAD/1000, and MSE use original 8-bit alpha values",
        },
        "summary": _summarise(scores),
        "cases": scores,
    }

    if output_path is not None:
        output_path = output_path.resolve()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="Local fixture manifest.json")
    parser.add_argument("--predictions", type=Path, required=True, help="Directory containing <case-id>.png alpha predictions")
    parser.add_argument("--ground-truth", type=Path, help="Ground-truth mask directory (default: manifest directory/masks)")
    parser.add_argument("--output", type=Path, help="Optional JSON scorecard output path")
    parser.add_argument("--threshold", type=int, default=128, help="8-bit foreground threshold (default: 128)")
    parser.add_argument("--boundary-tolerance", type=int, default=2, help="Boundary matching tolerance in pixels (default: 2)")
    args = parser.parse_args()

    try:
        result = evaluate_manifest(
            manifest_path=args.manifest,
            predictions_dir=args.predictions,
            output_path=args.output,
            ground_truth_dir=args.ground_truth,
            threshold=args.threshold,
            boundary_tolerance=args.boundary_tolerance,
        )
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))

    macro = result["summary"]["macro_average"]
    print(
        f"Scored {result['summary']['case_count']} alpha cases "
        f"({result['summary']['pixel_count']} pixels): "
        f"MAE={macro['mae']:.6f}, SAD/1000={macro['sad_x1000']:.3f}, "
        f"IoU={macro['iou']:.4f}, boundary-F1={macro['boundary_f1']:.4f}"
    )
    if args.output:
        print(f"Scorecard written to {args.output}")
    print("Scores describe this local fixture set only; synthetic results are not real-photo evidence.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
