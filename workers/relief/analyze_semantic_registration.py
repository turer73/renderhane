"""Measure same-coordinate semantic region registration in physical units.

The two rasters are label maps, not colour images: zero is background and each
positive integer is a stable region ID declared by the manifest.  No image is
resized or globally aligned here.  That is deliberate; a successful result is
evidence that geometry and manufacturing artwork were authored in the same
physical XY coordinate system, not merely made visually similar afterwards.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage

ENGINE_VERSION = "semantic-region-registration-v0.1.0"
REPORT_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
MAX_CANVAS_PIXELS = 4_194_304
MAX_REGION_PIXEL_WORK = 33_554_432
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_REGIONS = 256
DEFAULT_THRESHOLDS = {
    "minimum_iou": 0.985,
    "maximum_boundary_distance_mm": 0.25,
    "maximum_p95_boundary_distance_mm": 0.125,
    "maximum_centroid_offset_mm": 0.125,
    "maximum_relative_area_delta": 0.015,
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _positive_finite(value: Any, name: str) -> float:
    if type(value) not in (int, float):
        raise TypeError(f"{name} must be a positive finite number")
    converted = float(value)
    if not math.isfinite(converted) or converted <= 0:
        raise ValueError(f"{name} must be a positive finite number")
    return converted


def _nonnegative_finite(value: Any, name: str) -> float:
    if type(value) not in (int, float):
        raise TypeError(f"{name} must be a finite non-negative number")
    converted = float(value)
    if not math.isfinite(converted) or converted < 0:
        raise ValueError(f"{name} must be a finite non-negative number")
    return converted


def _parse_manifest(
    manifest: Mapping[str, Any],
) -> tuple[list[tuple[int, str]], dict[str, float], dict[str, str] | None]:
    if not isinstance(manifest, Mapping):
        raise TypeError("semantic manifest must be an object")
    if set(manifest) - {"schema_version", "regions", "thresholds", "source_bindings"}:
        raise ValueError("semantic manifest contains unknown fields")
    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ValueError("unsupported semantic manifest schema_version")
    raw_regions = manifest.get("regions")
    if not isinstance(raw_regions, list) or not 1 <= len(raw_regions) <= MAX_REGIONS:
        raise ValueError(f"semantic manifest must declare 1..{MAX_REGIONS} regions")

    regions: list[tuple[int, str]] = []
    seen_ids: set[int] = set()
    seen_names: set[str] = set()
    for raw in raw_regions:
        if not isinstance(raw, Mapping) or set(raw) != {"id", "name"}:
            raise ValueError("each semantic region must contain exactly id and name")
        region_id = raw["id"]
        name = raw["name"]
        if (
            isinstance(region_id, bool)
            or not isinstance(region_id, int)
            or not 1 <= region_id <= 65535
        ):
            raise ValueError(
                "semantic region IDs must be integers from 1 through 65535"
            )
        if not isinstance(name, str) or not name.strip() or len(name) > 128:
            raise ValueError(
                "semantic region names must be non-empty and at most 128 characters"
            )
        normalized_name = name.strip()
        if region_id in seen_ids or normalized_name in seen_names:
            raise ValueError("semantic region IDs and names must be unique")
        seen_ids.add(region_id)
        seen_names.add(normalized_name)
        regions.append((region_id, normalized_name))
    regions.sort(key=lambda item: item[0])

    raw_thresholds = manifest.get("thresholds", {})
    if not isinstance(raw_thresholds, Mapping) or set(raw_thresholds) - set(
        DEFAULT_THRESHOLDS
    ):
        raise ValueError("semantic thresholds contain unknown fields")
    thresholds = dict(DEFAULT_THRESHOLDS)
    thresholds.update(raw_thresholds)
    thresholds["minimum_iou"] = _nonnegative_finite(
        thresholds["minimum_iou"], "minimum_iou"
    )
    if thresholds["minimum_iou"] > 1:
        raise ValueError("minimum_iou must not exceed 1")
    thresholds["maximum_boundary_distance_mm"] = _nonnegative_finite(
        thresholds["maximum_boundary_distance_mm"], "maximum_boundary_distance_mm"
    )
    thresholds["maximum_p95_boundary_distance_mm"] = _nonnegative_finite(
        thresholds["maximum_p95_boundary_distance_mm"],
        "maximum_p95_boundary_distance_mm",
    )
    thresholds["maximum_centroid_offset_mm"] = _nonnegative_finite(
        thresholds["maximum_centroid_offset_mm"], "maximum_centroid_offset_mm"
    )
    thresholds["maximum_relative_area_delta"] = _nonnegative_finite(
        thresholds["maximum_relative_area_delta"], "maximum_relative_area_delta"
    )
    if thresholds["minimum_iou"] < DEFAULT_THRESHOLDS["minimum_iou"]:
        raise ValueError("semantic thresholds may only tighten minimum_iou")
    for name in (
        "maximum_boundary_distance_mm",
        "maximum_p95_boundary_distance_mm",
        "maximum_centroid_offset_mm",
        "maximum_relative_area_delta",
    ):
        if thresholds[name] > DEFAULT_THRESHOLDS[name]:
            raise ValueError(f"semantic thresholds may only tighten {name}")
    raw_bindings = manifest.get("source_bindings")
    bindings = None
    if raw_bindings is not None:
        expected_binding_keys = {
            "geometry_source_role",
            "geometry_source_sha256",
            "artwork_source_role",
            "artwork_source_sha256",
            "binding_scope",
        }
        if (
            not isinstance(raw_bindings, Mapping)
            or set(raw_bindings) != expected_binding_keys
        ):
            raise ValueError("semantic source bindings have an invalid contract")
        if raw_bindings["geometry_source_role"] != "relief_map":
            raise ValueError("semantic geometry source role must be relief_map")
        if raw_bindings["artwork_source_role"] != "uv_artwork":
            raise ValueError("semantic artwork source role must be uv_artwork")
        if raw_bindings["binding_scope"] != "revision_inputs_not_derivation_proof":
            raise ValueError("semantic source binding scope is invalid")
        for field in ("geometry_source_sha256", "artwork_source_sha256"):
            value = raw_bindings[field]
            if (
                not isinstance(value, str)
                or len(value) != 64
                or any(character not in "0123456789abcdef" for character in value)
            ):
                raise ValueError(f"semantic {field} must be a lowercase SHA-256")
        bindings = {
            key: str(raw_bindings[key]) for key in sorted(expected_binding_keys)
        }
    return regions, thresholds, bindings


def normalize_semantic_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Validate and canonicalize a semantic manifest before revision storage."""

    regions, thresholds, bindings = _parse_manifest(manifest)
    normalized = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "regions": [{"id": region_id, "name": name} for region_id, name in regions],
        "thresholds": thresholds,
    }
    if bindings is not None:
        normalized["source_bindings"] = bindings
    return normalized


def _load_label_map(path: Path, role: str) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError(f"{role} exceeds the safe file-size limit")
    with path.open("rb") as handle:
        header = handle.read(26)
    valid_header = (
        len(header) == 26
        and header[:8] == b"\x89PNG\r\n\x1a\n"
        and int.from_bytes(header[8:12], "big") == 13
        and header[12:16] == b"IHDR"
        and header[24] in {8, 16}
        and header[25] == 0
    )
    if not valid_header:
        raise ValueError(f"{role} must be an 8-bit or 16-bit grayscale PNG")
    with Image.open(path) as image:
        width, height = image.size
        if image.format != "PNG" or getattr(image, "n_frames", 1) != 1:
            raise ValueError(f"{role} must be a single-frame PNG")
        if width <= 0 or height <= 0 or width * height > MAX_CANVAS_PIXELS:
            raise ValueError(f"{role} is outside the safe resource limit")
        if "transparency" in image.info:
            raise ValueError(f"{role} must not contain colour-key transparency")
        image.load()
        values = np.asarray(image)
    if values.ndim != 2 or values.dtype.kind not in {"u", "i"}:
        raise ValueError(f"{role} must decode to a single-channel integer raster")
    if values.size == 0 or int(values.min()) < 0 or int(values.max()) > 65535:
        raise ValueError(f"{role} contains labels outside uint16")
    return values.astype(np.uint16, copy=False)


def _boundary(mask: np.ndarray) -> np.ndarray:
    if not bool(mask.any()):
        return np.zeros_like(mask, dtype=bool)
    eroded = ndimage.binary_erosion(mask, structure=np.ones((3, 3), dtype=bool))
    return mask & ~eroded


def _component_count(mask: np.ndarray) -> int:
    return int(ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))[1])


def _label_boundary(labels: np.ndarray) -> np.ndarray:
    """Return pixel-centre boundaries, including boundaries between non-zero IDs."""

    maximum = ndimage.maximum_filter(labels, size=3, mode="nearest")
    minimum = ndimage.minimum_filter(labels, size=3, mode="nearest")
    return maximum != minimum


def _region_colour(region_id: int) -> np.ndarray:
    """Stable, high-contrast RGB colour for a positive semantic ID."""

    palette = np.asarray(
        [
            (34, 197, 94),
            (14, 165, 233),
            (168, 85, 247),
            (249, 115, 22),
            (236, 72, 153),
            (20, 184, 166),
            (234, 179, 8),
            (99, 102, 241),
        ],
        dtype=np.uint8,
    )
    return palette[(region_id - 1) % len(palette)]


def _registration_visuals(
    geometry: np.ndarray, artwork: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Build operator-readable overlay and exact semantic-difference rasters."""

    height, width = geometry.shape
    overlay = np.full((height, width, 3), (15, 23, 42), dtype=np.uint8)
    difference = np.full((height, width, 3), (15, 23, 42), dtype=np.uint8)

    matching = (geometry == artwork) & (geometry != 0)
    for region_id in np.unique(geometry[matching]):
        colour = _region_colour(int(region_id))
        overlay[matching & (geometry == region_id)] = colour
    difference[matching] = (22, 101, 75)

    geometry_only = (geometry != 0) & (artwork == 0)
    artwork_only = (geometry == 0) & (artwork != 0)
    wrong_id = (geometry != 0) & (artwork != 0) & (geometry != artwork)
    difference[geometry_only] = (220, 38, 38)
    difference[artwork_only] = (37, 99, 235)
    difference[wrong_id] = (245, 158, 11)

    geometry_boundary = _label_boundary(geometry)
    artwork_boundary = _label_boundary(artwork)
    overlay[geometry_boundary & ~artwork_boundary] = (255, 71, 87)
    overlay[artwork_boundary & ~geometry_boundary] = (34, 211, 238)
    overlay[geometry_boundary & artwork_boundary] = (255, 255, 255)
    return overlay, difference


def _centroid_mm(
    mask: np.ndarray, pitch_x_mm: float, pitch_y_mm: float
) -> tuple[float, float]:
    y, x = np.nonzero(mask)
    return (
        float(np.mean(x.astype(np.float64) + 0.5) * pitch_x_mm),
        float(np.mean(y.astype(np.float64) + 0.5) * pitch_y_mm),
    )


def _edge_distances_mm(
    geometry: np.ndarray,
    artwork: np.ndarray,
    *,
    pitch_x_mm: float,
    pitch_y_mm: float,
) -> np.ndarray:
    geometry_boundary = _boundary(geometry)
    artwork_boundary = _boundary(artwork)
    distance_to_artwork = ndimage.distance_transform_edt(
        ~artwork_boundary, sampling=(pitch_y_mm, pitch_x_mm)
    )
    distance_to_geometry = ndimage.distance_transform_edt(
        ~geometry_boundary, sampling=(pitch_y_mm, pitch_x_mm)
    )
    return np.concatenate(
        [distance_to_artwork[geometry_boundary], distance_to_geometry[artwork_boundary]]
    )


def _region_metrics(
    region_id: int,
    name: str,
    geometry_labels: np.ndarray,
    artwork_labels: np.ndarray,
    *,
    pitch_x_mm: float,
    pitch_y_mm: float,
    thresholds: Mapping[str, float],
) -> dict[str, Any]:
    geometry = geometry_labels == region_id
    artwork = artwork_labels == region_id
    geometry_pixels = int(np.count_nonzero(geometry))
    artwork_pixels = int(np.count_nonzero(artwork))
    pixel_area = pitch_x_mm * pitch_y_mm
    failures: list[str] = []
    if not geometry_pixels:
        failures.append("region_missing_from_geometry")
    if not artwork_pixels:
        failures.append("region_missing_from_artwork")
    report: dict[str, Any] = {
        "id": region_id,
        "name": name,
        "geometry_pixels": geometry_pixels,
        "artwork_pixels": artwork_pixels,
        "geometry_area_mm2": round(geometry_pixels * pixel_area, 10),
        "artwork_area_mm2": round(artwork_pixels * pixel_area, 10),
        "geometry_component_count": _component_count(geometry),
        "artwork_component_count": _component_count(artwork),
    }
    if not geometry_pixels or not artwork_pixels:
        report.update(
            {
                "status": "not_evaluable",
                "intersection_over_union": None,
                "relative_area_delta": None,
                "centroid_offset_x_mm": None,
                "centroid_offset_y_mm": None,
                "centroid_offset_mm": None,
                "maximum_boundary_distance_mm": None,
                "p95_boundary_distance_mm": None,
                "mean_boundary_distance_mm": None,
                "failures": failures,
            }
        )
        return report

    intersection = int(np.count_nonzero(geometry & artwork))
    union = int(np.count_nonzero(geometry | artwork))
    iou = intersection / union
    relative_area_delta = abs(artwork_pixels - geometry_pixels) / geometry_pixels
    geometry_centroid = _centroid_mm(geometry, pitch_x_mm, pitch_y_mm)
    artwork_centroid = _centroid_mm(artwork, pitch_x_mm, pitch_y_mm)
    centroid_x = artwork_centroid[0] - geometry_centroid[0]
    centroid_y = artwork_centroid[1] - geometry_centroid[1]
    centroid = math.hypot(centroid_x, centroid_y)
    distances = _edge_distances_mm(
        geometry, artwork, pitch_x_mm=pitch_x_mm, pitch_y_mm=pitch_y_mm
    )
    maximum = float(np.max(distances))
    p95 = float(np.percentile(distances, 95.0))
    mean = float(np.mean(distances))

    if iou < thresholds["minimum_iou"]:
        failures.append("intersection_over_union_below_threshold")
    if maximum > thresholds["maximum_boundary_distance_mm"]:
        failures.append("maximum_boundary_distance_exceeds_threshold")
    if p95 > thresholds["maximum_p95_boundary_distance_mm"]:
        failures.append("p95_boundary_distance_exceeds_threshold")
    if centroid > thresholds["maximum_centroid_offset_mm"]:
        failures.append("centroid_offset_exceeds_threshold")
    if relative_area_delta > thresholds["maximum_relative_area_delta"]:
        failures.append("relative_area_delta_exceeds_threshold")
    if report["geometry_component_count"] != report["artwork_component_count"]:
        failures.append("connected_component_count_mismatch")

    report.update(
        {
            "status": "failed" if failures else "validated",
            "intersection_over_union": round(iou, 10),
            "relative_area_delta": round(relative_area_delta, 10),
            "centroid_offset_x_mm": round(centroid_x, 10),
            "centroid_offset_y_mm": round(centroid_y, 10),
            "centroid_offset_mm": round(centroid, 10),
            "maximum_boundary_distance_mm": round(maximum, 10),
            "p95_boundary_distance_mm": round(p95, 10),
            "mean_boundary_distance_mm": round(mean, 10),
            "failures": sorted(failures),
        }
    )
    return report


def analyze_semantic_registration(
    geometry_labels_path: Path,
    artwork_labels_path: Path,
    manifest: Mapping[str, Any],
    *,
    physical_width_mm: float,
    physical_height_mm: float,
) -> dict[str, Any]:
    """Compare stable semantic IDs without registration-fitting or resampling."""

    width_mm = _positive_finite(physical_width_mm, "physical_width_mm")
    height_mm = _positive_finite(physical_height_mm, "physical_height_mm")
    canonical_manifest = normalize_semantic_manifest(manifest)
    regions = [
        (region["id"], region["name"]) for region in canonical_manifest["regions"]
    ]
    thresholds = canonical_manifest["thresholds"]
    geometry = _load_label_map(geometry_labels_path, "geometry semantic labels")
    artwork = _load_label_map(artwork_labels_path, "artwork semantic labels")
    if geometry.shape != artwork.shape:
        raise ValueError("semantic label maps must share the exact source canvas")
    height_px, width_px = geometry.shape
    if geometry.size * len(regions) > MAX_REGION_PIXEL_WORK:
        raise ValueError("semantic region analysis exceeds the safe work limit")
    pitch_x = width_mm / width_px
    pitch_y = height_mm / height_px
    pixel_area = pitch_x * pitch_y
    maximum_distance = math.hypot((width_px - 1) * pitch_x, (height_px - 1) * pitch_y)
    if not all(
        math.isfinite(value) and value > 0 for value in (pitch_x, pitch_y, pixel_area)
    ) or not math.isfinite(maximum_distance):
        raise ValueError("physical dimensions exceed JSON-safe numeric limits")

    declared_ids = {region_id for region_id, _ in regions}
    geometry_ids = {int(value) for value in np.unique(geometry) if int(value) != 0}
    artwork_ids = {int(value) for value in np.unique(artwork) if int(value) != 0}
    undeclared_geometry = sorted(geometry_ids - declared_ids)
    undeclared_artwork = sorted(artwork_ids - declared_ids)
    missing_geometry = sorted(declared_ids - geometry_ids)
    missing_artwork = sorted(declared_ids - artwork_ids)

    encoded_pairs = (geometry.astype(np.uint32) << 16) | artwork.astype(np.uint32)
    pair_codes, pair_counts = np.unique(encoded_pairs, return_counts=True)
    pair_count_lookup = {
        (int(code >> 16), int(code & 0xFFFF)): int(count)
        for code, count in zip(pair_codes.tolist(), pair_counts.tolist(), strict=True)
    }
    confusion = [
        {
            "geometry_id": geometry_id,
            "artwork_id": artwork_id,
            "pixels": count,
            "area_mm2": round(count * pixel_area, 10),
        }
        for (geometry_id, artwork_id), count in sorted(pair_count_lookup.items())
        if geometry_id != artwork_id
    ]
    suspected_swaps = [
        [left, right]
        for index, left in enumerate(sorted(declared_ids))
        for right in sorted(declared_ids)[index + 1 :]
        if pair_count_lookup.get((left, right), 0)
        > pair_count_lookup.get((left, left), 0)
        and pair_count_lookup.get((right, left), 0)
        > pair_count_lookup.get((right, right), 0)
    ]
    mismatch_pixels = int(np.count_nonzero(geometry != artwork))

    region_reports = [
        _region_metrics(
            region_id,
            name,
            geometry,
            artwork,
            pitch_x_mm=pitch_x,
            pitch_y_mm=pitch_y,
            thresholds=thresholds,
        )
        for region_id, name in regions
    ]
    failures: list[str] = []
    if canonical_manifest.get("source_bindings") is None:
        failures.append("source_bindings_missing")
    for role, values in (
        ("undeclared_geometry_region_ids", undeclared_geometry),
        ("undeclared_artwork_region_ids", undeclared_artwork),
        ("missing_geometry_region_ids", missing_geometry),
        ("missing_artwork_region_ids", missing_artwork),
    ):
        if values:
            failures.append(role)
    for region in region_reports:
        failures.extend(f"region:{region['id']}:{item}" for item in region["failures"])
    failures = sorted(set(failures))
    status = (
        "not_evaluable"
        if failures == ["source_bindings_missing"]
        else "failed"
        if failures
        else "validated"
    )

    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
        "artwork_semantic_registration_status": status,
        "decision": "fail" if failures else "pass",
        "evidence_source": "same_source_stable_region_id_rasters",
        "evidence_independence": "geometry_labels_vs_manufacturing_artwork_labels",
        "alignment_policy": "exact_canvas_no_fitting_no_resampling",
        "coordinate_system": {
            "origin": "top_left",
            "x_axis": "right",
            "y_axis": "down",
            "sample_location": "pixel_center",
        },
        "comparison_canvas_px": [width_px, height_px],
        "physical_canvas_mm": [round(width_mm, 10), round(height_mm, 10)],
        "pixel_pitch_mm": [round(pitch_x, 12), round(pitch_y, 12)],
        "pixel_area_mm2": round(pixel_area, 12),
        "thresholds": {name: round(value, 12) for name, value in thresholds.items()},
        "source_bindings": canonical_manifest.get("source_bindings"),
        "declared_region_ids": sorted(declared_ids),
        "geometry_region_ids": sorted(geometry_ids),
        "artwork_region_ids": sorted(artwork_ids),
        "undeclared_geometry_region_ids": undeclared_geometry,
        "undeclared_artwork_region_ids": undeclared_artwork,
        "missing_geometry_region_ids": missing_geometry,
        "missing_artwork_region_ids": missing_artwork,
        "semantic_mismatch_pixels": mismatch_pixels,
        "semantic_mismatch_area_mm2": round(mismatch_pixels * pixel_area, 10),
        "confusion": confusion,
        "suspected_swapped_region_pairs": suspected_swaps,
        "regions": region_reports,
        "provenance": {
            "geometry_labels_sha256": _sha256(geometry_labels_path),
            "artwork_labels_sha256": _sha256(artwork_labels_path),
            "semantic_manifest_sha256": hashlib.sha256(
                _canonical_json(canonical_manifest).encode("utf-8")
            ).hexdigest(),
        },
        "failures": failures,
        "limitations": [
            "This validates declared region geometry, not colour accuracy, ICC/RIP output, ink, varnish height, or printer calibration.",
            "Revision hashes bind the label maps to named inputs but do not prove the correctness of their upstream derivation.",
            "The label maps must be independently derived from approved geometry and manufacturing artwork in one physical XY coordinate system.",
        ],
    }


def write_semantic_registration_artifacts(
    geometry_labels_path: Path,
    artwork_labels_path: Path,
    manifest: Mapping[str, Any],
    *,
    physical_width_mm: float,
    physical_height_mm: float,
    report_path: Path,
    overlay_path: Path,
    difference_path: Path,
) -> dict[str, Any]:
    """Write the report plus deterministic, full-canvas operator visuals."""

    report = analyze_semantic_registration(
        geometry_labels_path,
        artwork_labels_path,
        manifest,
        physical_width_mm=physical_width_mm,
        physical_height_mm=physical_height_mm,
    )
    geometry = _load_label_map(geometry_labels_path, "geometry semantic labels")
    artwork = _load_label_map(artwork_labels_path, "artwork semantic labels")
    overlay, difference = _registration_visuals(geometry, artwork)
    overlay_path.parent.mkdir(parents=True, exist_ok=True)
    difference_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(overlay).save(overlay_path)
    Image.fromarray(difference).save(difference_path)
    report["visualizations"] = {
        "overlay": {
            "file": overlay_path.name,
            "sha256": _sha256(overlay_path),
            "legend": {
                "geometry_boundary_only": "red",
                "artwork_boundary_only": "cyan",
                "coincident_boundary": "white",
            },
        },
        "difference": {
            "file": difference_path.name,
            "sha256": _sha256(difference_path),
            "legend": {
                "matching_region_id": "green",
                "geometry_only": "red",
                "artwork_only": "blue",
                "different_positive_region_id": "amber",
                "background": "navy",
            },
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Measure semantic region registration without global fitting"
    )
    parser.add_argument("--geometry-labels", type=Path, required=True)
    parser.add_argument("--artwork-labels", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--physical-width-mm", type=float, required=True)
    parser.add_argument("--physical-height-mm", type=float, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        report = analyze_semantic_registration(
            args.geometry_labels,
            args.artwork_labels,
            manifest,
            physical_width_mm=args.physical_width_mm,
            physical_height_mm=args.physical_height_mm,
        )
    except Exception as exc:  # noqa: BLE001 - bounded CLI translates failures to exit 2.
        print(f"semantic registration analysis failed: {exc}", file=sys.stderr)
        return 2
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8", newline="\n")
    print(payload, end="")
    return 0 if report["decision"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
