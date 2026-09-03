#!/usr/bin/env python3
"""CLI and compatibility facade for the Renderhane Relief Phase 0 engine."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from relief_engine import (
    ENGINE_NAME,
    ENGINE_VERSION,
    FIXED_ZIP_TIME,
    MAX_SOURCE_FILE_BYTES,
    MAX_SOURCE_PIXELS,
    REPORT_SCHEMA_VERSION,
    BuildRecipe,
    BuildReport,
    MeshValidation,
    ShapeMode,
    build,
    build_rectangular_relief_mesh,
    build_silhouette_relief_mesh,
    canonical_json_bytes,
    count_open_edges,
    dependency_versions,
    inspect_source_image,
    sha256_bytes,
    sha256_file,
    trace_boundary_loops,
    validate_mesh,
)

__all__ = [
    "ENGINE_NAME", "ENGINE_VERSION", "FIXED_ZIP_TIME",
    "MAX_SOURCE_FILE_BYTES", "MAX_SOURCE_PIXELS", "REPORT_SCHEMA_VERSION",
    "BuildRecipe", "BuildReport", "MeshValidation", "ShapeMode",
    "build", "build_rectangular_relief_mesh", "build_silhouette_relief_mesh",
    "canonical_json_bytes", "count_open_edges", "dependency_versions",
    "inspect_source_image", "sha256_bytes", "sha256_file",
    "trace_boundary_loops", "validate_mesh",
]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relief-map", required=True, type=Path, help="8/16-bit grayscale PNG or image")
    parser.add_argument("--mask", type=Path, help="Optional grayscale mask; required for silhouette mode")
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float)
    parser.add_argument("--base-thickness-mm", type=float, default=3.0)
    parser.add_argument("--relief-depth-mm", type=float, default=1.0)
    parser.add_argument("--percentile-low", type=float, default=2.0)
    parser.add_argument("--percentile-high", type=float, default=98.0)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument("--smoothing-sigma-px", type=float, default=1.0)
    parser.add_argument("--grid-long-edge", type=int, default=256)
    parser.add_argument("--invert-depth", action="store_true")
    parser.add_argument("--shape-mode", choices=("rectangle", "silhouette"), default="rectangle")
    parser.add_argument("--mask-threshold", type=float, default=0.5)
    parser.add_argument("--artwork-long-edge-px", type=int, default=2048)
    parser.add_argument("--uv-artwork", type=Path)
    parser.add_argument("--white-mask", type=Path)
    parser.add_argument("--varnish-mask", type=Path)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    recipe = BuildRecipe(
        width_mm=args.width_mm, height_mm=args.height_mm,
        base_thickness_mm=args.base_thickness_mm, relief_depth_mm=args.relief_depth_mm,
        percentile_low=args.percentile_low, percentile_high=args.percentile_high,
        gamma=args.gamma, smoothing_sigma_px=args.smoothing_sigma_px,
        grid_long_edge=args.grid_long_edge, invert_depth=args.invert_depth,
        shape_mode=args.shape_mode, mask_threshold=args.mask_threshold,
        artwork_long_edge_px=args.artwork_long_edge_px,
    )
    aligned_layers = {
        key: value
        for key, value in {
            "uv_artwork": args.uv_artwork,
            "white_mask": args.white_mask,
            "varnish_mask": args.varnish_mask,
        }.items()
        if value is not None
    }
    try:
        report = build(args.relief_map, args.out_dir, recipe, args.mask, aligned_layers)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    return 0 if report.validation["digital_status"] == "validated" else 2


if __name__ == "__main__":
    raise SystemExit(main())
