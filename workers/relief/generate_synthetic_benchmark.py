from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def _normalise(values: np.ndarray) -> np.ndarray:
    lo = float(values.min())
    hi = float(values.max())
    if hi <= lo:
        return np.zeros_like(values, dtype=np.float32)
    return ((values - lo) / (hi - lo)).astype(np.float32)


def _write_text_vector(path: Path, width: int, height: int) -> None:
    """Write a rights-safe vector companion for the synthetic glyph bars."""
    glyph_width = max(2.0, width * 0.055)
    glyph_height = max(2.0, height * 0.075)
    glyph_y = ((0.67 + 1.0) * 0.5 * (height - 1)) - glyph_height * 0.5
    glyphs = "\n".join(
        (
            "    <rect "
            f'x="{((centre + 1.0) * 0.5 * (width - 1) - glyph_width * 0.5):.3f}" '
            f'y="{glyph_y:.3f}" width="{glyph_width:.3f}" '
            f'height="{glyph_height:.3f}" />'
        )
        for centre in (-0.46, -0.23, 0.0, 0.23, 0.46)
    )
    path.write_text(
        (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}">\n'
            "  <title>Rights-safe synthetic text-vector fixture</title>\n"
            '  <g id="synthetic-glyph-bars" fill="#000000">\n'
            f"{glyphs}\n"
            "  </g>\n"
            "</svg>\n"
        ),
        encoding="utf-8",
    )


def generate(output_dir: Path, width: int = 256, height: int = 192) -> dict[str, str]:
    """Create a deterministic 16-bit relief fixture and matching silhouette mask.

    The fixture intentionally contains broad depth planes, local detail, text-like
    bars and thin isolated features. It is a software regression fixture, not a
    physical Kapadokya ground truth.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    x = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    y = np.linspace(-1.0, 1.0, height, dtype=np.float32)[:, None]
    xx = np.broadcast_to(x[None, :], (height, width))
    yy = np.broadcast_to(y, (height, width))

    broad = 0.30 + 0.24 * (1.0 - (yy + 1.0) / 2.0)
    peak_left = 0.34 * np.exp(-(((xx + 0.42) / 0.20) ** 2 + ((yy + 0.02) / 0.38) ** 2))
    peak_mid = 0.44 * np.exp(-(((xx - 0.02) / 0.17) ** 2 + ((yy - 0.06) / 0.34) ** 2))
    peak_right = 0.30 * np.exp(-(((xx - 0.46) / 0.20) ** 2 + ((yy + 0.02) / 0.32) ** 2))
    local_detail = 0.035 * np.sin(18.0 * xx) * np.cos(14.0 * yy)

    relief = broad + peak_left + peak_mid + peak_right + local_detail

    # A raised, text-like lower banner. This checks sharp but printable steps.
    banner = (np.abs(yy - 0.67) < 0.12) & (np.abs(xx) < 0.70)
    relief = relief + banner.astype(np.float32) * 0.16
    for centre in (-0.46, -0.23, 0.0, 0.23, 0.46):
        glyph = (np.abs(xx - centre) < 0.055) & (np.abs(yy - 0.67) < 0.075)
        relief = relief + glyph.astype(np.float32) * 0.08

    # Thin features that should remain visible in previews but can trigger
    # minimum-feature warnings at aggressive downsampling.
    for centre in (-0.70, 0.70):
        stem = (np.abs(xx - centre) < 0.018) & (yy > -0.25) & (yy < 0.38)
        relief = relief + stem.astype(np.float32) * 0.12

    relief = _normalise(relief)

    # Rounded badge silhouette.
    ellipse = (xx / 0.92) ** 2 + (yy / 0.92) ** 2 <= 1.0
    flat_bottom = yy <= 0.86
    mask = ellipse & flat_bottom
    relief = np.where(mask, relief, 0.0)

    relief_u16 = np.round(relief * 65535.0).astype(np.uint16)
    mask_u8 = np.where(mask, 255, 0).astype(np.uint8)
    preview_u8 = np.round(relief * 255.0).astype(np.uint8)

    relief_path = output_dir / "relief-map-16.png"
    mask_path = output_dir / "silhouette-mask.png"
    preview_path = output_dir / "relief-map-preview.png"
    text_vector_path = output_dir / "text-vector.svg"
    manifest_path = output_dir / "fixture-manifest.json"

    Image.fromarray(relief_u16, mode="I;16").save(relief_path)
    Image.fromarray(mask_u8, mode="L").save(mask_path)
    Image.fromarray(preview_u8, mode="L").save(preview_path)
    _write_text_vector(text_vector_path, width, height)

    manifest = {
        "fixture": "synthetic-relief-v1",
        "purpose": "deterministic software regression only",
        "is_physical_ground_truth": False,
        "rights_scope": "synthetic-generated-no-third-party-assets",
        "width_px": width,
        "height_px": height,
        "files": {
            "relief_map_16": relief_path.name,
            "silhouette_mask": mask_path.name,
            "preview": preview_path.name,
            "text_vector": text_vector_path.name,
        },
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    return {key: str(output_dir / value) for key, value in manifest["files"].items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate deterministic relief benchmark input")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width", type=int, default=256)
    parser.add_argument("--height", type=int, default=192)
    args = parser.parse_args()

    if args.width < 32 or args.height < 32:
        parser.error("width and height must be at least 32 pixels")

    generate(args.output, args.width, args.height)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
