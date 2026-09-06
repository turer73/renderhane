#!/usr/bin/env python3
"""Generate a stepped UV-clearance and registration coupon for Phase 0.

This coupon is not permission to place a raised part in any UV printer.  The
operator must approve the machine's safe head clearance before printing.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from relief_builder import BuildRecipe, build

WIDTH_MM = 120.0
HEIGHT_MM = 35.0
BASE_MM = 3.0
MAX_STEP_MM = 1.8
STEP_LEVELS_MM = (0.0, 0.6, 1.0, 1.4, 1.8)
CANVAS = (2400, 700)


def ensure_empty_output_dir(output_dir: Path) -> None:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError(
            f"Output directory is not empty: {output_dir}. "
            "Use a new directory or remove the previous coupon explicitly."
        )
    output_dir.mkdir(parents=True, exist_ok=True)


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def generate_inputs(directory: Path) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    width, height = CANVAS
    relief = np.zeros((height, width), dtype=np.float32)
    artwork = Image.new("RGBA", CANVAS, (255, 255, 255, 255))
    draw = ImageDraw.Draw(artwork)
    white = Image.new("L", CANVAS, 255)
    varnish = Image.new("L", CANVAS, 0)
    varnish_draw = ImageDraw.Draw(varnish)
    font = load_font(54)
    title_font = load_font(40)

    draw.text((60, 28), "Renderhane UV height / registration coupon", fill=(0, 0, 0, 255), font=title_font)
    centres = np.linspace(260, width - 260, len(STEP_LEVELS_MM)).astype(int)
    pad_width = 280
    top = 180
    bottom = 570
    for centre, level in zip(centres, STEP_LEVELS_MM):
        left = int(centre - pad_width / 2)
        right = int(centre + pad_width / 2)
        relief[top:bottom, left:right] = level / MAX_STEP_MM
        colour = (35, 105, 205, 255) if level < 1.2 else (220, 105, 35, 255)
        draw.rectangle((left, top, right, bottom), outline=colour, width=12)
        draw.line((centre - 70, (top + bottom) // 2, centre + 70, (top + bottom) // 2), fill=(0, 0, 0, 255), width=8)
        draw.line((centre, (top + bottom) // 2 - 70, centre, (top + bottom) // 2 + 70), fill=(0, 0, 0, 255), width=8)
        draw.ellipse((centre - 48, (top + bottom) // 2 - 48, centre + 48, (top + bottom) // 2 + 48), outline=(0, 0, 0, 255), width=7)
        label_text = f"{level:.1f} mm"
        bbox = draw.textbbox((0, 0), label_text, font=font)
        draw.text((centre - (bbox[2] - bbox[0]) / 2, 590), label_text, fill=(0, 0, 0, 255), font=font)
        varnish_draw.rectangle((left, top, right, bottom), fill=255)

    relief_path = directory / "coupon-relief-map-16.png"
    uv_path = directory / "coupon-uv-artwork.png"
    white_path = directory / "coupon-white-mask.png"
    varnish_path = directory / "coupon-varnish-mask.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16)).save(relief_path)
    artwork.save(uv_path)
    white.save(white_path)
    varnish.save(varnish_path)
    return {
        "relief": relief_path,
        "uv_artwork": uv_path,
        "white_mask": white_path,
        "varnish_mask": varnish_path,
    }


def generate_coupon(output_dir: Path, grid_long_edge: int = 320) -> dict[str, object]:
    ensure_empty_output_dir(output_dir)
    inputs = generate_inputs(output_dir / "inputs")
    report = build(
        inputs["relief"],
        output_dir / "build",
        BuildRecipe(
            width_mm=WIDTH_MM,
            height_mm=HEIGHT_MM,
            base_thickness_mm=BASE_MM,
            relief_depth_mm=MAX_STEP_MM,
            percentile_low=0.0,
            percentile_high=100.0,
            gamma=1.0,
            smoothing_sigma_px=0.0,
            grid_long_edge=grid_long_edge,
            shape_mode="rectangle",
            artwork_long_edge_px=2400,
        ),
        aligned_layer_paths={
            "uv_artwork": inputs["uv_artwork"],
            "white_mask": inputs["white_mask"],
            "varnish_mask": inputs["varnish_mask"],
        },
    )
    notes = output_dir / "UV-COUPON-NOTES.md"
    notes.write_text(
        """# UV clearance coupon

- Raised flat zones: 0.0 / 0.6 / 1.0 / 1.4 / 1.8 mm over a 3.0 mm base.
- Ask the UV operator to approve safe head clearance before placing this part.
- Print the aligned UV artwork at exactly 120 x 35 mm with no auto-fit or padding.
- Record blur, misting, head-clearance concern and X/Y registration at every zone.
- Passing this coupon does not automatically validate every relief geometry or material.
""",
        encoding="utf-8",
    )
    return {
        "digital_status": report.validation["digital_status"],
        "production_status": report.validation["production_status"],
        "levels_mm": list(STEP_LEVELS_MM),
        "model_size_mm": report.coordinate_system["model_size_mm"],
        "report": "build/manufacturing-report.json",
        "notes": notes.name,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--grid-long-edge", type=int, default=320)
    args = parser.parse_args()
    result = generate_coupon(args.out_dir, args.grid_long_edge)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["digital_status"] == "validated" else 2


if __name__ == "__main__":
    raise SystemExit(main())
