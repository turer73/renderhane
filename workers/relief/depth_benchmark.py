from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ENGINE_VERSION = "depth-benchmark-v0.1.0"


@dataclass(frozen=True)
class CandidateSpec:
    candidate_id: str
    model: str
    path: Path
    cost_usd: float | None = None
    inference_seconds: float | None = None
    license: str | None = None


@dataclass(frozen=True)
class RegionStat:
    label: int
    name: str
    rank: float
    pixels: int
    median: float
    mad: float


@dataclass(frozen=True)
class CandidateScore:
    candidate_id: str
    model: str
    orientation: str
    decision: str
    ordinal_pair_accuracy: float
    adjacent_separation: float
    within_region_roughness: float
    silhouette_leakage: float
    text_edge_score: float | None
    composite_score: float
    dynamic_range: float
    cost_usd: float | None
    inference_seconds: float | None
    license: str | None
    region_stats: list[dict[str, Any]]
    warnings: list[str]
    normalized_output: str


class BenchmarkInputError(ValueError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_scalar_image(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        array = np.asarray(image)
    if array.ndim == 3:
        rgb = array[..., :3].astype(np.float64)
        array = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    array = array.astype(np.float64)
    if array.size == 0 or not np.isfinite(array).all():
        raise BenchmarkInputError(f"invalid scalar image: {path}")
    maximum = float(array.max())
    if maximum > 1.0:
        array /= 65535.0 if maximum > 255.0 else 255.0
    return np.clip(array, 0.0, 1.0).astype(np.float32)


def _load_label_image(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        array = np.asarray(image.convert("L"), dtype=np.uint8)
    return array.astype(np.int32)


def _load_binary_mask(path: Path | None, shape: tuple[int, int]) -> np.ndarray:
    if path is None:
        return np.ones(shape, dtype=bool)
    with Image.open(path) as image:
        mask = np.asarray(image.convert("L"), dtype=np.uint8) > 127
    if mask.shape != shape:
        raise BenchmarkInputError(
            f"mask canvas {mask.shape[1]}x{mask.shape[0]} does not match "
            f"candidate canvas {shape[1]}x{shape[0]}"
        )
    return mask


def _robust_normalise(candidate: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, float]:
    values = candidate[mask]
    if values.size == 0:
        raise BenchmarkInputError("evaluation mask is empty")
    low = float(np.percentile(values, 1.0))
    high = float(np.percentile(values, 99.0))
    dynamic_range = high - low
    if dynamic_range <= 1e-8:
        raise BenchmarkInputError("candidate has no usable depth range")
    normalised = np.clip((candidate - low) / dynamic_range, 0.0, 1.0).astype(np.float32)
    return normalised, dynamic_range


def _region_stats(
    candidate: np.ndarray,
    labels: np.ndarray,
    mask: np.ndarray,
    regions: dict[int, dict[str, Any]],
) -> list[RegionStat]:
    stats: list[RegionStat] = []
    for label, metadata in sorted(regions.items(), key=lambda item: (float(item[1]["rank"]), item[0])):
        region_mask = (labels == label) & mask
        values = candidate[region_mask]
        if values.size == 0:
            raise BenchmarkInputError(f"semantic region {label} has no pixels")
        median = float(np.median(values))
        mad = float(np.median(np.abs(values - median)))
        stats.append(
            RegionStat(
                label=label,
                name=str(metadata.get("name", f"region-{label}")),
                rank=float(metadata["rank"]),
                pixels=int(values.size),
                median=median,
                mad=mad,
            )
        )
    return stats


def _ordinal_accuracy(stats: list[RegionStat], epsilon: float = 0.01) -> float:
    scores: list[float] = []
    for index, left in enumerate(stats):
        for right in stats[index + 1 :]:
            expected = math.copysign(1.0, left.rank - right.rank) if left.rank != right.rank else 0.0
            if expected == 0.0:
                continue
            difference = left.median - right.median
            if abs(difference) <= epsilon:
                scores.append(0.5)
            else:
                actual = math.copysign(1.0, difference)
                scores.append(1.0 if actual == expected else 0.0)
    return float(np.mean(scores)) if scores else 1.0


def _adjacent_separation(stats: list[RegionStat]) -> float:
    grouped: dict[float, list[float]] = {}
    for stat in stats:
        grouped.setdefault(stat.rank, []).append(stat.median)
    ordered = [(rank, float(np.median(values))) for rank, values in sorted(grouped.items())]
    if len(ordered) < 2:
        return 1.0
    differences = [max(0.0, ordered[index + 1][1] - ordered[index][1]) for index in range(len(ordered) - 1)]
    return float(np.clip(np.mean(differences) / 0.20, 0.0, 1.0))


def _roughness(stats: list[RegionStat]) -> float:
    weighted = sum(stat.mad * stat.pixels for stat in stats)
    pixels = sum(stat.pixels for stat in stats)
    return float(np.clip(weighted / max(pixels, 1) / 0.12, 0.0, 1.0))


def _silhouette_leakage(candidate: np.ndarray, silhouette: np.ndarray) -> float:
    outside = candidate[~silhouette]
    if outside.size == 0:
        return 0.0
    return float(np.clip(np.mean(np.abs(outside)), 0.0, 1.0))


def _dilate(mask: np.ndarray) -> np.ndarray:
    padded = np.pad(mask, 1, mode="constant", constant_values=False)
    output = np.zeros_like(mask, dtype=bool)
    for row_offset in range(3):
        for col_offset in range(3):
            output |= padded[
                row_offset : row_offset + mask.shape[0],
                col_offset : col_offset + mask.shape[1],
            ]
    return output


def _text_edge_score(candidate: np.ndarray, text_mask: np.ndarray | None) -> float | None:
    if text_mask is None or not text_mask.any():
        return None
    inner_edge = text_mask & _dilate(~text_mask)
    outer_edge = ~text_mask & _dilate(text_mask)
    if not inner_edge.any() or not outer_edge.any():
        return None
    contrast = abs(float(np.median(candidate[inner_edge])) - float(np.median(candidate[outer_edge])))
    return float(np.clip(contrast / 0.18, 0.0, 1.0))


def _score_orientation(
    candidate: np.ndarray,
    labels: np.ndarray,
    evaluation_mask: np.ndarray,
    silhouette: np.ndarray,
    regions: dict[int, dict[str, Any]],
    text_mask: np.ndarray | None,
) -> tuple[float, dict[str, Any], list[RegionStat]]:
    stats = _region_stats(candidate, labels, evaluation_mask, regions)
    ordinal = _ordinal_accuracy(stats)
    separation = _adjacent_separation(stats)
    roughness = _roughness(stats)
    leakage = _silhouette_leakage(candidate, silhouette)
    text_score = _text_edge_score(candidate, text_mask)
    effective_text = 0.5 if text_score is None else text_score
    composite = (
        0.50 * ordinal
        + 0.20 * separation
        + 0.15 * (1.0 - roughness)
        + 0.10 * (1.0 - leakage)
        + 0.05 * effective_text
    )
    metrics = {
        "ordinal_pair_accuracy": ordinal,
        "adjacent_separation": separation,
        "within_region_roughness": roughness,
        "silhouette_leakage": leakage,
        "text_edge_score": text_score,
        "composite_score": float(np.clip(composite, 0.0, 1.0)),
    }
    return metrics["composite_score"], metrics, stats


def _decision(metrics: dict[str, Any], warnings: list[str]) -> str:
    if metrics["ordinal_pair_accuracy"] < 0.60 or metrics["silhouette_leakage"] > 0.35:
        return "reject_candidate"
    if (
        metrics["ordinal_pair_accuracy"] < 0.85
        or metrics["adjacent_separation"] < 0.35
        or metrics["composite_score"] < 0.70
        or warnings
    ):
        return "needs_review"
    return "usable_candidate"


def score_candidate(
    spec: CandidateSpec,
    *,
    labels: np.ndarray,
    regions: dict[int, dict[str, Any]],
    silhouette: np.ndarray,
    text_mask: np.ndarray | None,
    output_dir: Path,
) -> CandidateScore:
    raw = _load_scalar_image(spec.path)
    if raw.shape != labels.shape:
        raise BenchmarkInputError(
            f"candidate {spec.candidate_id} canvas {raw.shape[1]}x{raw.shape[0]} "
            f"does not match labels {labels.shape[1]}x{labels.shape[0]}"
        )
    normalised, dynamic_range = _robust_normalise(raw, silhouette)
    evaluation_mask = silhouette & np.isin(labels, list(regions))
    if not evaluation_mask.any():
        raise BenchmarkInputError("no semantic region pixels are inside silhouette")

    direct_score, direct_metrics, direct_stats = _score_orientation(
        normalised, labels, evaluation_mask, silhouette, regions, text_mask
    )
    inverted = 1.0 - normalised
    inverted[~silhouette] = 0.0
    inverted_score, inverted_metrics, inverted_stats = _score_orientation(
        inverted, labels, evaluation_mask, silhouette, regions, text_mask
    )

    if inverted_score > direct_score + 1e-9:
        orientation = "inverted"
        selected = inverted
        metrics = inverted_metrics
        stats = inverted_stats
    else:
        orientation = "direct"
        selected = normalised
        metrics = direct_metrics
        stats = direct_stats

    selected[~silhouette] = 0.0
    warnings: list[str] = []
    if orientation == "inverted":
        warnings.append("candidate_orientation_was_inverted")
    if metrics["within_region_roughness"] > 0.70:
        warnings.append("high_within_region_roughness")
    if metrics["silhouette_leakage"] > 0.10:
        warnings.append("depth_leaks_outside_silhouette")
    if metrics["text_edge_score"] is not None and metrics["text_edge_score"] < 0.35:
        warnings.append("text_logo_edges_are_weak")

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{spec.candidate_id}-normalised-16.png"
    Image.fromarray(np.round(selected * 65535.0).astype(np.uint16), mode="I;16").save(output_path)

    return CandidateScore(
        candidate_id=spec.candidate_id,
        model=spec.model,
        orientation=orientation,
        decision=_decision(metrics, warnings),
        ordinal_pair_accuracy=round(float(metrics["ordinal_pair_accuracy"]), 6),
        adjacent_separation=round(float(metrics["adjacent_separation"]), 6),
        within_region_roughness=round(float(metrics["within_region_roughness"]), 6),
        silhouette_leakage=round(float(metrics["silhouette_leakage"]), 6),
        text_edge_score=(
            round(float(metrics["text_edge_score"]), 6)
            if metrics["text_edge_score"] is not None
            else None
        ),
        composite_score=round(float(metrics["composite_score"]), 6),
        dynamic_range=round(float(dynamic_range), 8),
        cost_usd=spec.cost_usd,
        inference_seconds=spec.inference_seconds,
        license=spec.license,
        region_stats=[asdict(stat) for stat in stats],
        warnings=warnings,
        normalized_output=str(output_path),
    )


def _load_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise BenchmarkInputError("manifest must be a JSON object")
    return payload


def run_manifest(manifest_path: Path, output_dir: Path) -> dict[str, Any]:
    manifest = _load_manifest(manifest_path)
    base = manifest_path.parent
    labels_path = base / manifest["semantic_labels"]
    labels = _load_label_image(labels_path)

    raw_regions = manifest.get("regions")
    if not isinstance(raw_regions, dict) or not raw_regions:
        raise BenchmarkInputError("manifest.regions must be a non-empty object")
    regions: dict[int, dict[str, Any]] = {}
    for key, metadata in raw_regions.items():
        if not isinstance(metadata, dict) or "rank" not in metadata:
            raise BenchmarkInputError(f"region {key} must include rank")
        regions[int(key)] = metadata

    silhouette_path = base / manifest["silhouette_mask"]
    silhouette = _load_binary_mask(silhouette_path, labels.shape)
    text_mask_path = manifest.get("text_mask")
    text_mask = (
        _load_binary_mask(base / text_mask_path, labels.shape)
        if text_mask_path
        else None
    )

    candidate_payloads = manifest.get("candidates")
    if not isinstance(candidate_payloads, list) or not candidate_payloads:
        raise BenchmarkInputError("manifest.candidates must be a non-empty array")

    specs: list[CandidateSpec] = []
    seen: set[str] = set()
    for entry in candidate_payloads:
        if not isinstance(entry, dict):
            raise BenchmarkInputError("candidate entry must be an object")
        candidate_id = str(entry["id"])
        if candidate_id in seen:
            raise BenchmarkInputError(f"duplicate candidate id: {candidate_id}")
        seen.add(candidate_id)
        specs.append(
            CandidateSpec(
                candidate_id=candidate_id,
                model=str(entry.get("model", candidate_id)),
                path=base / entry["path"],
                cost_usd=float(entry["cost_usd"]) if entry.get("cost_usd") is not None else None,
                inference_seconds=(
                    float(entry["inference_seconds"])
                    if entry.get("inference_seconds") is not None
                    else None
                ),
                license=str(entry["license"]) if entry.get("license") is not None else None,
            )
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    scores = [
        score_candidate(
            spec,
            labels=labels,
            regions=regions,
            silhouette=silhouette,
            text_mask=text_mask,
            output_dir=output_dir / "normalised",
        )
        for spec in specs
    ]
    scores.sort(key=lambda item: (-item.composite_score, item.candidate_id))

    report = {
        "schema_version": 1,
        "engine_version": ENGINE_VERSION,
        "manifest": str(manifest_path),
        "manifest_sha256": _sha256(manifest_path),
        "semantic_labels_sha256": _sha256(labels_path),
        "silhouette_sha256": _sha256(silhouette_path),
        "text_mask_sha256": _sha256(base / text_mask_path) if text_mask_path else None,
        "scores": [asdict(score) for score in scores],
        "provisional_recommendation": (
            scores[0].candidate_id if scores and scores[0].decision == "usable_candidate" else None
        ),
        "decision_notice": (
            "Scores compare digital depth candidates against ordinal semantic ground truth. "
            "They do not prove physical print quality or UV compatibility."
        ),
    }

    json_path = output_dir / "depth-benchmark-report.json"
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    csv_path = output_dir / "depth-benchmark-report.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "candidate_id",
                "model",
                "orientation",
                "decision",
                "ordinal_pair_accuracy",
                "adjacent_separation",
                "within_region_roughness",
                "silhouette_leakage",
                "text_edge_score",
                "composite_score",
                "dynamic_range",
                "cost_usd",
                "inference_seconds",
                "license",
                "warnings",
            ],
        )
        writer.writeheader()
        for score in scores:
            row = asdict(score)
            row["warnings"] = "|".join(score.warnings)
            row.pop("region_stats")
            row.pop("normalized_output")
            writer.writerow(row)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Benchmark depth candidates against ordinal semantic regions")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        report = run_manifest(args.manifest, args.output)
    except Exception as exc:
        print(f"depth benchmark failed: {exc}", file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "provisional_recommendation": report["provisional_recommendation"],
                "report": str(args.output / "depth-benchmark-report.json"),
                "candidates": len(report["scores"]),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
