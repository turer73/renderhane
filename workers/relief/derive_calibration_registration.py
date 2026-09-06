"""Derive calibration semantics independently from final GLB depth and UV colour.

This module is deliberately fixture-specific.  Arbitrary untextured GLB files do
not contain enough information to reconstruct customer-facing semantic intent.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import numpy as np
from analyze_semantic_registration import write_semantic_registration_artifacts
from PIL import Image
from scipy import ndimage

ENGINE_VERSION = "calibration-independent-semantic-derivation-v0.1.0"
DEPTH_CODES = np.asarray([8000, 50000, 65535], dtype=np.int32)
REGION_COLOURS = np.asarray(
    [[225, 224, 210], [24, 140, 164], [224, 99, 44]], dtype=np.int32
)
REGIONS = (
    {"id": 1, "name": "base"},
    {"id": 2, "name": "circle"},
    {"id": 3, "name": "arrow"},
)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_registration(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema_version") != 2:
        raise ValueError("calibration derivation requires registration schema v2")
    return value


def _load_depth(path: Path) -> np.ndarray:
    with path.open("rb") as handle:
        header = handle.read(26)
    if len(header) != 26 or header[24:26] != bytes((16, 0)):
        raise ValueError("final GLB depth must be an unsigned 16-bit grayscale PNG")
    with Image.open(path) as image:
        values = np.asarray(image)
    if values.ndim != 2 or values.dtype.kind not in {"u", "i"}:
        raise ValueError("final GLB depth must decode to one integer channel")
    return values.astype(np.int32, copy=False)


def _load_silhouette(path: Path, expected_shape: tuple[int, int]) -> np.ndarray:
    with Image.open(path) as image:
        values = np.asarray(image)
    if values.shape != expected_shape or not np.all((values == 0) | (values == 255)):
        raise ValueError("final GLB silhouette must be a same-canvas binary mask")
    if not bool(np.any(values == 255)):
        raise ValueError("final GLB silhouette is empty")
    return values == 255


def _geometry_labels(depth: np.ndarray, silhouette: np.ndarray) -> np.ndarray:
    labels = np.zeros(depth.shape, dtype=np.uint16)
    labels[silhouette] = (
        np.argmin(
            np.abs(depth[silhouette, None] - DEPTH_CODES[None, :]),
            axis=1,
        )
        + 1
    )

    # Linear triangles around the arrow pass through the circle's height code.
    # The fixture contract declares the circle left of the canvas centre, so
    # transition components on the arrow are assigned back to the arrow without
    # translating, scaling, warping or consulting the artwork label geometry.
    components, count = ndimage.label(
        labels == 2, structure=np.ones((3, 3), dtype=np.uint8)
    )
    candidates = []
    for component in range(1, count + 1):
        _rows, columns = np.where(components == component)
        if columns.size:
            candidates.append((component, float(columns.mean())))
    left_candidates = [item for item in candidates if item[1] < depth.shape[1] / 2]
    if len(left_candidates) != 1:
        raise ValueError("final GLB does not contain one unambiguous left circle region")
    circle_component = left_candidates[0][0]
    labels[(labels == 2) & (components != circle_component)] = 3
    if {int(value) for value in np.unique(labels)} != {1, 2, 3}:
        raise ValueError("final GLB calibration regions are incomplete")
    return labels


def _artwork_labels(
    artwork_path: Path,
    *,
    verification_size: tuple[int, int],
) -> np.ndarray:
    with Image.open(artwork_path) as image:
        if image.mode != "RGBA":
            raise ValueError("calibration artwork must be RGBA")
        rgba = np.asarray(image)
    inside = rgba[:, :, 3] > 0
    labels = np.zeros(rgba.shape[:2], dtype=np.uint16)
    opaque_colours = rgba[inside, :3].astype(np.int32)
    distances = np.sum(
        (opaque_colours[:, :, None] - REGION_COLOURS.T[None, :, :]) ** 2,
        axis=1,
    )
    nearest = np.argmin(distances, axis=1)
    if not np.all(distances[np.arange(len(nearest)), nearest] == 0):
        raise ValueError("aligned artwork contains colours outside calibration contract")
    labels[inside] = nearest.astype(np.uint16) + 1
    with Image.fromarray(labels) as label_image:
        projected = label_image.resize(verification_size, Image.Resampling.NEAREST)
        return np.asarray(projected).astype(np.uint16, copy=True)


def _validate_registration_geometry(
    registration: dict[str, Any],
    *,
    depth_shape: tuple[int, int],
    artwork_size: tuple[int, int],
) -> tuple[float, float]:
    verification = tuple(registration.get("verification_canvas_px", []))
    artwork = tuple(registration.get("artwork_canvas_px", []))
    if verification != (depth_shape[1], depth_shape[0]):
        raise ValueError("final GLB projection does not match registration verification canvas")
    if artwork != artwork_size:
        raise ValueError("aligned artwork does not match registration artwork canvas")
    physical = registration.get("physical_canvas_mm")
    if not isinstance(physical, list) or len(physical) != 2:
        raise ValueError("registration physical canvas is invalid")
    width_mm, height_mm = (float(value) for value in physical)
    if not all(math.isfinite(value) and value > 0 for value in (width_mm, height_mm)):
        raise ValueError("registration physical canvas must be positive and finite")
    expected_verification_pitch = [
        width_mm / verification[0],
        height_mm / verification[1],
    ]
    declared_pitch = registration.get("verification_pixel_pitch_mm")
    if not isinstance(declared_pitch, list) or len(declared_pitch) != 2 or any(
        abs(float(actual) - expected) > 1e-9
        for actual, expected in zip(declared_pitch, expected_verification_pitch, strict=True)
    ):
        raise ValueError("registration verification pitch is inconsistent")
    return width_mm, height_mm


def derive_calibration_registration(
    *,
    final_depth_path: Path,
    final_silhouette_path: Path,
    aligned_artwork_path: Path,
    registration_path: Path,
    output_dir: Path,
) -> dict[str, Any]:
    """Create stable-ID rasters and measure them without registration fitting."""

    output_dir.mkdir(parents=True, exist_ok=True)
    depth = _load_depth(final_depth_path)
    silhouette = _load_silhouette(final_silhouette_path, depth.shape)
    with Image.open(aligned_artwork_path) as artwork_image:
        artwork_size = artwork_image.size
    registration = _load_registration(registration_path)
    width_mm, height_mm = _validate_registration_geometry(
        registration,
        depth_shape=depth.shape,
        artwork_size=artwork_size,
    )
    geometry = _geometry_labels(depth, silhouette)
    artwork = _artwork_labels(
        aligned_artwork_path,
        verification_size=(depth.shape[1], depth.shape[0]),
    )
    geometry_path = output_dir / "final-glb-semantic-ids.png"
    artwork_path = output_dir / "aligned-artwork-semantic-ids.png"
    Image.fromarray(geometry).save(geometry_path)
    Image.fromarray(artwork).save(artwork_path)
    manifest = {
        "schema_version": 1,
        "regions": list(REGIONS),
        "source_bindings": {
            "geometry_source_role": "final_glb_orthographic_depth",
            "geometry_source_sha256": _sha256(final_depth_path),
            "artwork_source_role": "aligned_uv_artwork",
            "artwork_source_sha256": _sha256(aligned_artwork_path),
            "binding_scope": "independent_derived_artifacts",
        },
    }
    report_path = output_dir / "independent-semantic-registration-report.json"
    report = write_semantic_registration_artifacts(
        geometry_path,
        artwork_path,
        manifest,
        physical_width_mm=width_mm,
        physical_height_mm=height_mm,
        report_path=report_path,
        overlay_path=output_dir / "independent-semantic-overlay.png",
        difference_path=output_dir / "independent-semantic-difference.png",
    )
    report["derivation"] = {
        "engine_version": ENGINE_VERSION,
        "fixture": "rights-safe-calibration-v1",
        "geometry_method": "nearest_declared_height_code_then_fixture_topology_disambiguation",
        "artwork_method": "exact_declared_srgb_colour_then_registration_nearest_resample",
        "registration_fitting": "none",
        "registration_sha256": _sha256(registration_path),
        "final_silhouette_sha256": _sha256(final_silhouette_path),
        "depth_codes_uint16": DEPTH_CODES.tolist(),
        "region_colours_srgb": REGION_COLOURS.tolist(),
    }
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--final-depth", type=Path, required=True)
    parser.add_argument("--final-silhouette", type=Path, required=True)
    parser.add_argument("--aligned-artwork", type=Path, required=True)
    parser.add_argument("--registration", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        report = derive_calibration_registration(
            final_depth_path=args.final_depth,
            final_silhouette_path=args.final_silhouette,
            aligned_artwork_path=args.aligned_artwork,
            registration_path=args.registration,
            output_dir=args.out_dir,
        )
    except (OSError, TypeError, ValueError) as exc:
        print(f"calibration semantic derivation failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if report["decision"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
