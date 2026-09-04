from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

ENGINE_VERSION = "heightfield-depth-registration-v0.1.0"
REPORT_SCHEMA_VERSION = 1


@dataclass(frozen=True)
class DepthRegistrationReport:
    schema_version: int
    engine_version: str
    decision: str
    evidence_source: str
    evidence_independence: str
    comparison_canvas_px: list[int]
    shared_coverage_pixels: int
    expected_foreground_pixels: int
    observed_foreground_pixels: int
    tolerance_mm: float
    quantization_uncertainty_mm: float
    uncertainty_lower_maximum_error_mm: float
    guard_banded_maximum_error_mm: float
    maximum_absolute_error_mm: float
    p95_absolute_error_mm: float
    mean_absolute_error_mm: float
    rms_error_mm: float
    minimum_signed_error_mm: float
    maximum_signed_error_mm: float
    mean_signed_error_mm: float
    failures: list[str]
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _load_u16(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        values = np.asarray(image)
    if values.ndim != 2 or not np.issubdtype(values.dtype, np.integer):
        raise ValueError(f"depth image must be a single-channel integer raster: {path}")
    if values.size == 0 or int(values.min()) < 0 or int(values.max()) > 65535:
        raise ValueError(f"depth image contains values outside uint16: {path}")
    return values.astype(np.uint16, copy=False)


def _load_mask(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        return np.asarray(image.convert("L"), dtype=np.uint8) > 127


def rasterize_canonical_heightfield(
    normalized_height_path: Path,
    cell_mask_path: Path,
    *,
    canvas_px: tuple[int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """Sample the canonical regular heightfield at verification pixel centres.

    The interpolation follows the exact a-d-e / a-e-b diagonal used by
    product_relief_builder._make_heightfield_mesh. The output is therefore
    derived from the source-normalized grid, not from the GLB being tested.
    """

    width, height = canvas_px
    if not isinstance(width, int) or not isinstance(height, int) or width <= 0 or height <= 0:
        raise ValueError("canvas dimensions must be positive integers")
    if width * height > 4_000_000:
        raise ValueError("depth comparison canvas is outside safe limits")

    nodes_u16 = _load_u16(normalized_height_path)
    cells = _load_mask(cell_mask_path)
    rows, cols = nodes_u16.shape
    if rows < 2 or cols < 2:
        raise ValueError("canonical heightfield must contain at least 2x2 nodes")
    if cells.shape != (rows - 1, cols - 1):
        raise ValueError("canonical cell mask shape does not match the heightfield grid")

    x = (np.arange(width, dtype=np.float64) + 0.5) * (cols - 1) / width
    y = (np.arange(height, dtype=np.float64) + 0.5) * (rows - 1) / height
    cell_x = np.minimum(np.floor(x).astype(np.int64), cols - 2)
    cell_y = np.minimum(np.floor(y).astype(np.int64), rows - 2)
    fraction_x = x - cell_x
    fraction_y = y - cell_y

    cx = cell_x[np.newaxis, :]
    cy = cell_y[:, np.newaxis]
    fx = fraction_x[np.newaxis, :]
    fy = fraction_y[:, np.newaxis]
    values = nodes_u16.astype(np.float64) / 65535.0
    top_left = values[cy, cx]
    top_right = values[cy, cx + 1]
    bottom_left = values[cy + 1, cx]
    bottom_right = values[cy + 1, cx + 1]

    lower_triangle = fy >= fx
    normalized = np.where(
        lower_triangle,
        top_left * (1.0 - fy) + bottom_left * (fy - fx) + bottom_right * fx,
        top_left * (1.0 - fx) + bottom_right * fy + top_right * (fx - fy),
    )
    expected_mask = cells[cy, cx]
    normalized[~expected_mask] = 0.0
    return expected_mask, normalized


def measure_depth_registration(
    *,
    normalized_height_path: Path,
    cell_mask_path: Path,
    observed_depth_path: Path,
    observed_silhouette_path: Path,
    relief_depth_mm: float,
    tolerance_mm: float,
    evidence_source: str = "final_glb_front_orthographic_depth",
    evidence_independence: str = "source_heightfield_vs_cpu_mesh_rasterization",
) -> DepthRegistrationReport:
    if not math.isfinite(relief_depth_mm) or relief_depth_mm <= 0:
        raise ValueError("relief_depth_mm must be positive and finite")
    if not math.isfinite(tolerance_mm) or tolerance_mm <= 0:
        raise ValueError("tolerance_mm must be positive and finite")
    if not evidence_source.strip() or not evidence_independence.strip():
        raise ValueError("depth evidence labels must not be empty")

    observed_u16 = _load_u16(observed_depth_path)
    observed_mask = _load_mask(observed_silhouette_path)
    if observed_u16.shape != observed_mask.shape:
        raise ValueError("observed GLB depth and silhouette canvases differ")
    expected_mask, expected_normalized = rasterize_canonical_heightfield(
        normalized_height_path,
        cell_mask_path,
        canvas_px=(observed_u16.shape[1], observed_u16.shape[0]),
    )
    shared = expected_mask & observed_mask
    if not bool(np.any(shared)):
        raise ValueError("source heightfield and observed GLB have no shared coverage")

    observed_normalized = observed_u16.astype(np.float64) / 65535.0
    signed_error = (
        observed_normalized[shared] - expected_normalized[shared]
    ) * relief_depth_mm
    absolute_error = np.abs(signed_error)
    maximum = float(np.max(absolute_error))
    quantization_uncertainty = 2.0 * relief_depth_mm / 65535.0
    lower = max(0.0, maximum - quantization_uncertainty)
    upper = maximum + quantization_uncertainty

    failures: list[str] = []
    warnings: list[str] = []
    if lower > tolerance_mm:
        failures.append("maximum_height_error_exceeds_tolerance")
    elif upper > tolerance_mm:
        warnings.append("maximum_height_error_uncertainty_overlaps_tolerance")
    if not np.array_equal(expected_mask, observed_mask):
        warnings.append("silhouette_coverage_differs_depth_limited_to_intersection")

    if failures:
        decision = "fail"
    elif "maximum_height_error_uncertainty_overlaps_tolerance" in warnings:
        decision = "needs_review"
    elif warnings:
        decision = "pass_with_warnings"
    else:
        decision = "pass"

    return DepthRegistrationReport(
        schema_version=REPORT_SCHEMA_VERSION,
        engine_version=ENGINE_VERSION,
        decision=decision,
        evidence_source=evidence_source,
        evidence_independence=evidence_independence,
        comparison_canvas_px=[observed_u16.shape[1], observed_u16.shape[0]],
        shared_coverage_pixels=int(np.count_nonzero(shared)),
        expected_foreground_pixels=int(np.count_nonzero(expected_mask)),
        observed_foreground_pixels=int(np.count_nonzero(observed_mask)),
        tolerance_mm=round(tolerance_mm, 10),
        quantization_uncertainty_mm=round(quantization_uncertainty, 12),
        uncertainty_lower_maximum_error_mm=round(lower, 10),
        guard_banded_maximum_error_mm=round(upper, 10),
        maximum_absolute_error_mm=round(maximum, 10),
        p95_absolute_error_mm=round(float(np.percentile(absolute_error, 95.0)), 10),
        mean_absolute_error_mm=round(float(np.mean(absolute_error)), 10),
        rms_error_mm=round(float(np.sqrt(np.mean(np.square(signed_error)))), 10),
        minimum_signed_error_mm=round(float(np.min(signed_error)), 10),
        maximum_signed_error_mm=round(float(np.max(signed_error)), 10),
        mean_signed_error_mm=round(float(np.mean(signed_error)), 10),
        failures=failures,
        warnings=warnings,
    )


def write_depth_difference_overlay(
    *,
    normalized_height_path: Path,
    cell_mask_path: Path,
    observed_depth_path: Path,
    observed_silhouette_path: Path,
    relief_depth_mm: float,
    tolerance_mm: float,
    destination: Path,
) -> None:
    if not math.isfinite(relief_depth_mm) or relief_depth_mm <= 0:
        raise ValueError("relief_depth_mm must be positive and finite")
    if not math.isfinite(tolerance_mm) or tolerance_mm <= 0:
        raise ValueError("tolerance_mm must be positive and finite")
    observed_u16 = _load_u16(observed_depth_path)
    observed_mask = _load_mask(observed_silhouette_path)
    if observed_u16.shape != observed_mask.shape:
        raise ValueError("observed GLB depth and silhouette canvases differ")
    expected_mask, expected_normalized = rasterize_canonical_heightfield(
        normalized_height_path,
        cell_mask_path,
        canvas_px=(observed_u16.shape[1], observed_u16.shape[0]),
    )
    observed_normalized = observed_u16.astype(np.float64) / 65535.0
    error_mm = np.abs(observed_normalized - expected_normalized) * relief_depth_mm
    intensity = np.round(np.clip(error_mm / tolerance_mm, 0.0, 1.0) * 255.0).astype(np.uint8)

    overlay = np.full((*observed_u16.shape, 3), 255, dtype=np.uint8)
    shared = expected_mask & observed_mask
    overlay[shared, 0] = intensity[shared]
    overlay[shared, 1] = 255 - intensity[shared]
    overlay[shared, 2] = 0
    overlay[expected_mask & ~observed_mask] = (0, 90, 255)
    overlay[~expected_mask & observed_mask] = (220, 0, 180)
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(overlay, mode="RGB").save(destination)
