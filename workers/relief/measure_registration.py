from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from scipy import ndimage

ENGINE_VERSION = "mask-registration-measure-v0.1.0"


@dataclass(frozen=True)
class RegistrationReport:
    schema_version: int
    engine_version: str
    decision: str
    tolerance_mm: float
    source_crop_box_px: list[int]
    comparison_canvas_px: list[int]
    physical_canvas_mm: list[float]
    pixel_pitch_mm: list[float]
    intersection_over_union: float
    symmetric_difference_ratio: float
    maximum_edge_distance_mm: float
    p95_edge_distance_mm: float
    mean_edge_distance_mm: float
    source_foreground_pixels: int
    geometry_foreground_pixels: int
    failures: list[str]
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _load_mask(path: Path) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        return np.asarray(image.convert("L"), dtype=np.uint8) > 127


def _boundary(mask: np.ndarray) -> np.ndarray:
    if not mask.any():
        return np.zeros_like(mask, dtype=bool)
    eroded = ndimage.binary_erosion(mask, structure=np.ones((3, 3), dtype=bool))
    return mask & ~eroded


def _resize_mask(mask: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    image = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    return np.asarray(
        image.resize(size, Image.Resampling.NEAREST),
        dtype=np.uint8,
    ) > 127


def _edge_distances_mm(
    source_boundary: np.ndarray,
    target_boundary: np.ndarray,
    *,
    pitch_y_mm: float,
    pitch_x_mm: float,
) -> np.ndarray:
    if not source_boundary.any() or not target_boundary.any():
        raise ValueError("source and geometry boundaries must both be non-empty")
    distance_to_target = ndimage.distance_transform_edt(
        ~target_boundary,
        sampling=(pitch_y_mm, pitch_x_mm),
    )
    distance_to_source = ndimage.distance_transform_edt(
        ~source_boundary,
        sampling=(pitch_y_mm, pitch_x_mm),
    )
    return np.concatenate(
        [
            distance_to_target[source_boundary],
            distance_to_source[target_boundary],
        ]
    )


def measure_registration(
    *,
    source_mask_path: Path,
    geometry_mask_path: Path,
    crop_box_px: tuple[int, int, int, int],
    physical_width_mm: float,
    physical_height_mm: float,
    tolerance_mm: float = 0.5,
) -> RegistrationReport:
    if not math.isfinite(physical_width_mm) or physical_width_mm <= 0:
        raise ValueError("physical_width_mm must be positive and finite")
    if not math.isfinite(physical_height_mm) or physical_height_mm <= 0:
        raise ValueError("physical_height_mm must be positive and finite")
    if not math.isfinite(tolerance_mm) or tolerance_mm <= 0:
        raise ValueError("tolerance_mm must be positive and finite")

    source_full = _load_mask(source_mask_path)
    geometry = _load_mask(geometry_mask_path)
    left, top, right, bottom = crop_box_px
    if not (0 <= left < right <= source_full.shape[1]):
        raise ValueError("crop_box_px X bounds are invalid")
    if not (0 <= top < bottom <= source_full.shape[0]):
        raise ValueError("crop_box_px Y bounds are invalid")

    source_crop = source_full[top:bottom, left:right]
    source = _resize_mask(
        source_crop,
        (geometry.shape[1], geometry.shape[0]),
    )
    if not source.any() or not geometry.any():
        raise ValueError("source or geometry mask contains no foreground")

    intersection = int(np.count_nonzero(source & geometry))
    union = int(np.count_nonzero(source | geometry))
    xor = int(np.count_nonzero(source ^ geometry))
    iou = intersection / max(union, 1)
    difference_ratio = xor / max(union, 1)

    pitch_x = physical_width_mm / geometry.shape[1]
    pitch_y = physical_height_mm / geometry.shape[0]
    distances = _edge_distances_mm(
        _boundary(source),
        _boundary(geometry),
        pitch_y_mm=pitch_y,
        pitch_x_mm=pitch_x,
    )
    maximum = float(np.max(distances))
    p95 = float(np.percentile(distances, 95.0))
    mean = float(np.mean(distances))

    failures: list[str] = []
    warnings: list[str] = []
    if maximum > tolerance_mm:
        failures.append("maximum_contour_registration_exceeds_tolerance")
    if iou < 0.985:
        warnings.append("silhouette_iou_below_0_985")
    if p95 > tolerance_mm * 0.5:
        warnings.append("p95_contour_registration_above_half_tolerance")

    decision = "pass" if not failures and not warnings else (
        "pass_with_warnings" if not failures else "fail"
    )
    return RegistrationReport(
        schema_version=1,
        engine_version=ENGINE_VERSION,
        decision=decision,
        tolerance_mm=tolerance_mm,
        source_crop_box_px=[left, top, right, bottom],
        comparison_canvas_px=[geometry.shape[1], geometry.shape[0]],
        physical_canvas_mm=[round(physical_width_mm, 8), round(physical_height_mm, 8)],
        pixel_pitch_mm=[round(pitch_x, 10), round(pitch_y, 10)],
        intersection_over_union=round(iou, 8),
        symmetric_difference_ratio=round(difference_ratio, 8),
        maximum_edge_distance_mm=round(maximum, 8),
        p95_edge_distance_mm=round(p95, 8),
        mean_edge_distance_mm=round(mean, 8),
        source_foreground_pixels=int(source.sum()),
        geometry_foreground_pixels=int(geometry.sum()),
        failures=failures,
        warnings=warnings,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Measure artwork-mask to geometry-mask registration"
    )
    parser.add_argument("--source-mask", type=Path, required=True)
    parser.add_argument("--geometry-mask", type=Path, required=True)
    parser.add_argument(
        "--crop-box-px",
        nargs=4,
        type=int,
        metavar=("LEFT", "TOP", "RIGHT", "BOTTOM"),
        required=True,
    )
    parser.add_argument("--physical-width-mm", type=float, required=True)
    parser.add_argument("--physical-height-mm", type=float, required=True)
    parser.add_argument("--tolerance-mm", type=float, default=0.5)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    try:
        report = measure_registration(
            source_mask_path=args.source_mask,
            geometry_mask_path=args.geometry_mask,
            crop_box_px=tuple(args.crop_box_px),
            physical_width_mm=args.physical_width_mm,
            physical_height_mm=args.physical_height_mm,
            tolerance_mm=args.tolerance_mm,
        )
    except Exception as exc:
        print(f"registration measurement failed: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(
        report.to_dict(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0 if report.decision in {"pass", "pass_with_warnings"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
