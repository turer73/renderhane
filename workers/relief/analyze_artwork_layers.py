"""Measure conservative artwork-layer coverage against a silhouette.

This module deliberately does not claim semantic registration, colour
conversion, printer calibration, or premultiplied-alpha correctness.  It only
reports raster coverage that can be established from the supplied files.
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage


ENGINE_VERSION = "artwork-layer-coverage-v0.1.0"
REPORT_SCHEMA_VERSION = 1
MAX_CANVAS_PIXELS = 36_000_000
MAX_FILE_BYTES = 64 * 1024 * 1024
MASK_MODES = {"L", "I;16", "I;16B", "I;16L"}


def _finite_positive(value: float, name: str) -> float:
    converted = float(value)
    if not math.isfinite(converted) or converted <= 0:
        raise ValueError(f"{name} must be finite and positive")
    return converted


def _validate_metric_range(
    *,
    width_px: int,
    height_px: int,
    pitch_x_mm: float,
    pitch_y_mm: float,
    pixel_area_mm2: float,
) -> None:
    maximum_area = pixel_area_mm2 * MAX_CANVAS_PIXELS
    maximum_distance = math.hypot(
        max(0, width_px - 1) * pitch_x_mm,
        max(0, height_px - 1) * pitch_y_mm,
    )
    if not all(
        math.isfinite(value) and value > 0
        for value in (pitch_x_mm, pitch_y_mm, pixel_area_mm2, maximum_area)
    ) or not math.isfinite(maximum_distance):
        raise ValueError("physical dimensions exceed JSON-safe numeric limits")


def _validate_file(path: Path, role: str) -> None:
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError(f"{role} exceeds the safe file-size limit")


def _validate_dimensions(image: Image.Image, role: str) -> tuple[int, int]:
    width, height = image.size
    if width <= 0 or height <= 0 or width * height > MAX_CANVAS_PIXELS:
        raise ValueError(f"{role} is outside the safe resource limit")
    return width, height


def _is_unsigned_16_png_container(path: Path, image: Image.Image) -> bool:
    try:
        with path.open("rb") as handle:
            header = handle.read(26)
    except OSError:
        return False
    return bool(
        image.format == "PNG"
        and len(header) == 26
        and header[:8] == b"\x89PNG\r\n\x1a\n"
        and int.from_bytes(header[8:12], "big") == 13
        and header[12:16] == b"IHDR"
        and header[24] == 16
        and header[25] == 0
    )


def _icc_digest(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.encode("latin-1", errors="ignore")
    if not isinstance(value, bytes) or not value:
        return None
    return hashlib.sha256(value).hexdigest()


def _metadata(image: Image.Image) -> dict[str, Any]:
    info = dict(image.info)
    icc_digest = _icc_digest(info.get("icc_profile"))
    gamma = info.get("gamma")
    try:
        gamma_value = float(gamma) if gamma is not None else None
    except (TypeError, ValueError):
        gamma_value = None
    if gamma_value is not None and not math.isfinite(gamma_value):
        gamma_value = None
    mode = image.mode
    if mode == "RGBA":
        alpha = {
            "present": True,
            "mode": "straight_unassociated",
            "premultiplication_verified": False,
        }
    else:
        alpha = {
            "present": False,
            "mode": "opaque",
            "premultiplication_verified": False,
        }
    return {
        "image_mode": mode,
        "embedded_icc": icc_digest is not None,
        "embedded_icc_sha256": icc_digest,
        "srgb_chunk_present": "srgb" in {str(key).lower() for key in info},
        "gamma_chunk": gamma_value,
        "transparency_chunk_present": "transparency" in info,
        "alpha": alpha,
        "colour_conversion_applied": False,
        "colour_management_scope": "metadata_only_no_profile_conversion",
    }


def _load_mask(path: Path, role: str) -> tuple[np.ndarray, dict[str, Any], tuple[int, int]]:
    _validate_file(path, role)
    with Image.open(path) as image:
        size = _validate_dimensions(image, role)
        metadata = _metadata(image)
        if image.mode not in MASK_MODES:
            raise ValueError(
                f"{role} must be L or unsigned 16-bit grayscale; "
                "RGB/alpha mask ambiguity is not accepted"
            )
        if "transparency" in image.info:
            raise ValueError(f"{role} has colour-key transparency; mask coverage is ambiguous")
        if image.mode != "L" and not _is_unsigned_16_png_container(path, image):
            raise ValueError(
                f"{role} unsigned 16-bit masks must be PNG IHDR 16-bit grayscale"
            )
        image.load()
        values = np.asarray(image)
        if values.ndim != 2:
            raise ValueError(f"{role} must be a single-channel grayscale image")
        if image.mode != "L" and (
            values.dtype.kind != "u" or values.dtype.itemsize != 2
        ):
            raise ValueError(f"{role} is not an unsigned 16-bit grayscale image")
        active = values > 0
    return np.asarray(active, dtype=bool), metadata, size


def _load_uv(path: Path, role: str) -> tuple[np.ndarray | None, dict[str, Any], tuple[int, int]]:
    _validate_file(path, role)
    with Image.open(path) as image:
        size = _validate_dimensions(image, role)
        metadata = _metadata(image)
        if image.mode not in {"RGB", "RGBA"}:
            raise ValueError(
                f"{role} must be RGB or RGBA; grayscale/alpha-only colour coverage is ambiguous"
            )
        if image.mode == "RGB" and "transparency" in image.info:
            raise ValueError(
                f"{role} has colour-key transparency; opaque RGB coverage is ambiguous"
            )
        image.load()
        values = np.asarray(image)
        if image.mode == "RGB":
            return None, metadata, size
        return np.asarray(values[..., 3] > 0, dtype=bool), metadata, size


def _coverage_metrics(
    coverage: np.ndarray,
    silhouette: np.ndarray,
    *,
    pixel_area_mm2: float,
    pitch_x_mm: float,
    pitch_y_mm: float,
) -> dict[str, Any]:
    coverage_pixels = int(np.count_nonzero(coverage))
    outside = coverage & ~silhouette
    outside_pixels = int(np.count_nonzero(outside))
    if outside_pixels:
        distances = ndimage.distance_transform_edt(
            ~silhouette,
            sampling=(pitch_y_mm, pitch_x_mm),
        )
        maximum_distance = float(np.max(distances[outside]))
    else:
        maximum_distance = 0.0
    return {
        "coverage_pixels": coverage_pixels,
        "coverage_area_mm2": round(coverage_pixels * pixel_area_mm2, 10),
        "outside_silhouette_pixels": outside_pixels,
        "outside_silhouette_area_mm2": round(outside_pixels * pixel_area_mm2, 10),
        "max_nearest_silhouette_distance_mm": round(maximum_distance, 10),
        "status": "fail" if outside_pixels else ("not_evaluable" if not coverage_pixels else "pass"),
        "warnings": ["empty_coverage"] if not coverage_pixels else [],
    }


def _layer_report(
    name: str,
    path: Path | None,
    silhouette: np.ndarray,
    *,
    pixel_area_mm2: float,
    pitch_x_mm: float,
    pitch_y_mm: float,
) -> dict[str, Any]:
    if path is None:
        return {
            "present": False,
            "status": "not_evaluable",
            "reason": "not_supplied",
            "warnings": [],
        }

    if name == "uv_artwork":
        coverage, metadata, size = _load_uv(path, name)
        report: dict[str, Any] = {
            "present": True,
            "size_px": [size[0], size[1]],
            "metadata": metadata,
        }
        if coverage is None:
            report.update(
                {
                    "status": "not_evaluable",
                    "reason": "cannot_infer_from_opaque_colour",
                    "warnings": ["cannot_infer_from_opaque_colour"],
                }
            )
            return report
    else:
        coverage, metadata, size = _load_mask(path, name)
        report = {
            "present": True,
            "size_px": [size[0], size[1]],
            "metadata": metadata,
        }

    report.update(
        _coverage_metrics(
            coverage,
            silhouette,
            pixel_area_mm2=pixel_area_mm2,
            pitch_x_mm=pitch_x_mm,
            pitch_y_mm=pitch_y_mm,
        )
    )
    return report


def _overall_status(layers: dict[str, dict[str, Any]]) -> str:
    supplied = [layer for layer in layers.values() if layer.get("present")]
    if not supplied:
        return "not_evaluable"
    if any(layer.get("status") == "fail" for layer in supplied):
        return "fail"
    if any(layer.get("status") != "pass" for layer in supplied):
        return "not_evaluable"
    return "pass"


def analyze_artwork_layers(
    silhouette_path: Path,
    uv_artwork_path: Path | None,
    white_mask_path: Path | None,
    varnish_mask_path: Path | None,
    *,
    width_mm: float,
    height_mm: float,
) -> dict[str, Any]:
    """Return JSON-safe raster coverage evidence for supplied artwork layers."""

    physical_width_mm = _finite_positive(width_mm, "width_mm")
    physical_height_mm = _finite_positive(height_mm, "height_mm")
    silhouette, silhouette_metadata, canvas = _load_mask(silhouette_path, "silhouette")
    width_px, height_px = canvas
    if width_px <= 0 or height_px <= 0 or width_px * height_px > MAX_CANVAS_PIXELS:
        raise ValueError("canvas is outside the safe resource limit")
    if not bool(np.any(silhouette)):
        raise ValueError("silhouette contains no active coverage")

    paths = {
        "uv_artwork": uv_artwork_path,
        "white_mask": white_mask_path,
        "varnish_mask": varnish_mask_path,
    }
    for name, path in paths.items():
        if path is None:
            continue
        _validate_file(path, name)
        with Image.open(path) as image:
            if image.size != canvas:
                raise ValueError(
                    f"{name} canvas mismatch: expected {canvas}, got {image.size}"
                )

    pitch_x_mm = physical_width_mm / width_px
    pitch_y_mm = physical_height_mm / height_px
    pixel_area_mm2 = pitch_x_mm * pitch_y_mm
    _validate_metric_range(
        width_px=width_px,
        height_px=height_px,
        pitch_x_mm=pitch_x_mm,
        pitch_y_mm=pitch_y_mm,
        pixel_area_mm2=pixel_area_mm2,
    )
    layers = {
        name: _layer_report(
            name,
            path,
            silhouette,
            pixel_area_mm2=pixel_area_mm2,
            pitch_x_mm=pitch_x_mm,
            pitch_y_mm=pitch_y_mm,
        )
        for name, path in paths.items()
    }
    return {
        "schema_version": REPORT_SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
        "canvas_px": [width_px, height_px],
        "physical_canvas_mm": [round(physical_width_mm, 10), round(physical_height_mm, 10)],
        "pixel_pitch_mm": [round(pitch_x_mm, 12), round(pitch_y_mm, 12)],
        "pixel_area_mm2": round(pixel_area_mm2, 12),
        "silhouette": {
            "size_px": [width_px, height_px],
            "coverage_rule": "grayscale_sample_gt_0",
            "coverage_pixels": int(np.count_nonzero(silhouette)),
            "coverage_area_mm2": round(int(np.count_nonzero(silhouette)) * pixel_area_mm2, 10),
            "metadata": silhouette_metadata,
        },
        "layers": layers,
        "coverage_rules": {
            "silhouette_and_grayscale_masks": "grayscale_sample_gt_0",
            "rgba_uv_artwork": "alpha_gt_0",
            "opaque_rgb_uv_artwork": "cannot_infer_from_opaque_colour",
        },
        "layer_coverage_status": _overall_status(layers),
        "artwork_semantic_registration_status": "not_validated",
        "limitations": [
            "Coverage is raster containment evidence only; it is not semantic registration approval.",
            "No ICC/profile conversion or printer/RIP/material calibration was applied.",
            "Opaque RGB artwork coverage cannot be inferred from colour values.",
        ],
    }


__all__ = ["analyze_artwork_layers"]
