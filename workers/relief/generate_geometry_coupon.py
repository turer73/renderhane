from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def generate_geometry_coupon(
    output_dir: Path,
    *,
    width_px: int = 560,
    height_px: int = 320,
    physical_width_mm: float = 70.0,
    physical_height_mm: float = 40.0,
    maximum_relief_mm: float = 1.8,
) -> dict:
    if width_px < 128 or height_px < 96:
        raise ValueError("coupon raster is too small")
    if physical_width_mm <= 0 or physical_height_mm <= 0 or maximum_relief_mm <= 0:
        raise ValueError("physical dimensions must be positive")

    output_dir.mkdir(parents=True, exist_ok=True)
    levels_mm = [0.6, 1.0, 1.4, 1.8]
    levels = [value / maximum_relief_mm for value in levels_mm]
    relief = np.zeros((height_px, width_px), dtype=np.float32)
    mask = np.zeros((height_px, width_px), dtype=bool)

    margin_x = int(round(width_px * 2.0 / physical_width_mm))
    margin_y = int(round(height_px * 2.0 / physical_height_mm))
    mask[margin_y : height_px - margin_y, margin_x : width_px - margin_x] = True

    usable_left = margin_x
    usable_right = width_px - margin_x
    panel_width = (usable_right - usable_left) // 4
    panel_bounds: list[dict] = []

    for index, (height_mm, level) in enumerate(zip(levels_mm, levels)):
        left = usable_left + index * panel_width
        right = usable_right if index == 3 else usable_left + (index + 1) * panel_width
        top = margin_y
        bottom = height_px - margin_y
        relief[top:bottom, left:right] = level

        # Known-width recessed/raised bars for feature retention.
        mm_per_px_x = physical_width_mm / width_px
        widths_mm = [0.3, 0.4, 0.6, 0.8]
        bar_y = top + int((bottom - top) * 0.62)
        cursor = left + int(panel_width * 0.15)
        bar_records = []
        for feature_mm in widths_mm:
            pixels = max(1, int(round(feature_mm / mm_per_px_x)))
            x0 = cursor
            x1 = min(right - 2, cursor + pixels)
            relief[bar_y : bottom - int((bottom - top) * 0.12), x0:x1] = min(
                1.0, level + 0.10
            )
            bar_records.append(
                {
                    "target_width_mm": feature_mm,
                    "raster_width_px": x1 - x0,
                    "x_range_px": [x0, x1],
                }
            )
            cursor += max(pixels + int(panel_width * 0.12), 4)

        # A smooth ramp checks stair-stepping and local surface continuity.
        ramp_top = top + int((bottom - top) * 0.14)
        ramp_bottom = top + int((bottom - top) * 0.44)
        ramp = np.linspace(max(0.0, level - 0.20), level, max(1, right - left), dtype=np.float32)
        relief[ramp_top:ramp_bottom, left:right] = ramp[None, :]

        panel_bounds.append(
            {
                "panel": index + 1,
                "target_relief_mm": height_mm,
                "normalised_value": round(level, 8),
                "pixel_bounds": [left, top, right, bottom],
                "feature_bars": bar_records,
            }
        )

    relief[~mask] = 0.0
    relief_path = output_dir / "geometry-coupon-relief-map-16.png"
    mask_path = output_dir / "geometry-coupon-mask.png"
    preview_path = output_dir / "geometry-coupon-preview.png"
    manifest_path = output_dir / "geometry-coupon-manifest.json"

    Image.fromarray(np.round(relief * 65535.0).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(mask_path)
    Image.fromarray(np.round(relief * 255.0).astype(np.uint8), mode="L").save(preview_path)

    manifest = {
        "schema_version": 1,
        "fixture": "known-height-geometry-coupon-v1",
        "purpose": "FDM height, feature retention and surface calibration",
        "physical_canvas_mm": [physical_width_mm, physical_height_mm],
        "base_thickness_mm": 3.0,
        "maximum_relief_mm": maximum_relief_mm,
        "panels": panel_bounds,
        "files": {
            "relief_map_16": relief_path.name,
            "mask": mask_path.name,
            "preview": preview_path.name,
        },
        "physical_validation_required": True,
        "measurement_notice": (
            "Measure each plateau from the common top of the base. Raster values are known, "
            "but printed heights depend on layer height, extrusion and material."
        ),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a known-height relief geometry coupon")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width-px", type=int, default=560)
    parser.add_argument("--height-px", type=int, default=320)
    args = parser.parse_args()
    generate_geometry_coupon(args.output, width_px=args.width_px, height_px=args.height_px)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
