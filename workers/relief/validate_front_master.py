from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import deque
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

VALID_RASTER_SUFFIXES = {".png", ".tif", ".tiff", ".webp"}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _components(mask: np.ndarray) -> list[int]:
    rows, cols = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    sizes: list[int] = []
    for row in range(rows):
        for col in range(cols):
            if not mask[row, col] or visited[row, col]:
                continue
            queue: deque[tuple[int, int]] = deque([(row, col)])
            visited[row, col] = True
            size = 0
            while queue:
                current_row, current_col = queue.popleft()
                size += 1
                for next_row, next_col in (
                    (current_row - 1, current_col),
                    (current_row + 1, current_col),
                    (current_row, current_col - 1),
                    (current_row, current_col + 1),
                ):
                    if (
                        0 <= next_row < rows
                        and 0 <= next_col < cols
                        and mask[next_row, next_col]
                        and not visited[next_row, next_col]
                    ):
                        visited[next_row, next_col] = True
                        queue.append((next_row, next_col))
            sizes.append(size)
    return sorted(sizes, reverse=True)


def _estimate_mask_from_background(rgba: np.ndarray) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.float32)
    height, width = rgb.shape[:2]
    border = max(1, min(height, width) // 100)
    samples = np.concatenate(
        [
            rgb[:border].reshape(-1, 3),
            rgb[-border:].reshape(-1, 3),
            rgb[:, :border].reshape(-1, 3),
            rgb[:, -border:].reshape(-1, 3),
        ],
        axis=0,
    )
    background = np.median(samples, axis=0)
    spread = np.median(np.linalg.norm(samples - background, axis=1))
    threshold = max(14.0, spread * 4.0)
    distance = np.linalg.norm(rgb - background, axis=2)
    return distance > threshold


def _load_mask(
    image_rgba: np.ndarray,
    mask_path: Path | None,
) -> tuple[np.ndarray, str, list[str]]:
    warnings: list[str] = []
    height, width = image_rgba.shape[:2]
    if mask_path is not None:
        if not mask_path.is_file():
            raise FileNotFoundError(mask_path)
        with Image.open(mask_path) as image:
            mask = np.asarray(image.convert("L"), dtype=np.uint8) > 127
        if mask.shape != (height, width):
            raise ValueError(
                f"mask canvas {mask.shape[1]}x{mask.shape[0]} does not match image {width}x{height}"
            )
        return mask, "explicit-mask", warnings

    alpha = image_rgba[..., 3]
    if int(alpha.min()) < 250:
        mask = alpha > 8
        warnings.append("mask_derived_from_alpha_not_explicit")
        return mask, "alpha", warnings

    warnings.append("mask_inferred_from_border_colour_requires_manual_review")
    return _estimate_mask_from_background(image_rgba), "background-estimate", warnings


def validate_front_master(
    image_path: Path,
    *,
    mask_path: Path | None = None,
    text_vector_path: Path | None = None,
    minimum_long_edge_px: int = 2048,
    declared_orthographic: bool = False,
    declared_no_cast_shadow: bool = False,
) -> dict[str, Any]:
    if not image_path.is_file():
        raise FileNotFoundError(image_path)
    if image_path.suffix.lower() not in VALID_RASTER_SUFFIXES:
        raise ValueError("front master must use a lossless or alpha-capable raster format")
    if minimum_long_edge_px < 128:
        raise ValueError("minimum_long_edge_px must be at least 128")

    with Image.open(image_path) as image:
        rgba_image = image.convert("RGBA")
        rgba = np.asarray(rgba_image, dtype=np.uint8)
        width, height = rgba_image.size
        source_mode = image.mode

    failures: list[str] = []
    warnings: list[str] = []
    human_checks_required: list[str] = []

    if max(width, height) < minimum_long_edge_px:
        failures.append("resolution_below_required_long_edge")
    if width < 128 or height < 128:
        failures.append("canvas_too_small")
    if not math.isfinite(width / height):
        failures.append("invalid_aspect_ratio")

    mask, mask_source, mask_warnings = _load_mask(rgba, mask_path)
    warnings.extend(mask_warnings)
    foreground_pixels = int(mask.sum())
    total_pixels = int(mask.size)
    if foreground_pixels == 0:
        failures.append("empty_foreground")
        bbox = None
    else:
        rows, cols = np.where(mask)
        bbox = [int(cols.min()), int(rows.min()), int(cols.max()) + 1, int(rows.max()) + 1]

    coverage = foreground_pixels / total_pixels if total_pixels else 0.0
    if coverage < 0.02:
        failures.append("foreground_too_small")
    elif coverage > 0.97:
        warnings.append("foreground_covers_nearly_entire_canvas")

    border_foreground = int(
        mask[0, :].sum() + mask[-1, :].sum() + mask[:, 0].sum() + mask[:, -1].sum()
    )
    if border_foreground > 0:
        failures.append("foreground_touches_canvas_edge")

    component_sizes = _components(mask)
    component_count = len(component_sizes)
    large_threshold = max(16, int(foreground_pixels * 0.005))
    large_components = sum(size >= large_threshold for size in component_sizes)
    small_detached_pixels = sum(size for size in component_sizes[1:] if size < large_threshold)
    if large_components > 1:
        warnings.append("multiple_large_foreground_components")
    if small_detached_pixels > max(8, int(foreground_pixels * 0.002)):
        warnings.append("detached_small_islands")

    alpha = rgba[..., 3]
    semi_transparent = (alpha > 0) & (alpha < 255)
    semi_ratio = float(semi_transparent.sum() / max(foreground_pixels, 1))
    if semi_ratio > 0.08:
        warnings.append("large_semitransparent_halo_or_shadow")
    elif semi_ratio > 0.01:
        warnings.append("semitransparent_edge_requires_review")

    if not declared_orthographic:
        human_checks_required.append("confirm_front_orthographic_projection")
    if not declared_no_cast_shadow:
        human_checks_required.append("confirm_no_cast_shadow_or_studio_floor")

    vector_status = "not_supplied"
    if text_vector_path is not None:
        if not text_vector_path.is_file():
            failures.append("text_vector_file_missing")
        elif text_vector_path.suffix.lower() != ".svg":
            failures.append("text_vector_must_be_svg")
        else:
            vector_status = "supplied"
    else:
        warnings.append("text_or_logo_vector_not_supplied")

    if failures:
        decision = "reject_input"
    elif human_checks_required or mask_source == "background-estimate":
        decision = "needs_review"
    elif warnings:
        decision = "pass_with_warnings"
    else:
        decision = "pass_contract_checks"

    return {
        "schema_version": 1,
        "decision": decision,
        "image": {
            "path": str(image_path),
            "sha256": _sha256(image_path),
            "width_px": width,
            "height_px": height,
            "mode": source_mode,
            "long_edge_px": max(width, height),
            "aspect_ratio": round(width / height, 8),
        },
        "mask": {
            "source": mask_source,
            "path": str(mask_path) if mask_path else None,
            "sha256": _sha256(mask_path) if mask_path else None,
            "foreground_pixels": foreground_pixels,
            "coverage": round(coverage, 8),
            "bbox_px": bbox,
            "border_foreground_pixels": border_foreground,
            "component_count": component_count,
            "large_component_count": large_components,
            "small_detached_pixels": small_detached_pixels,
            "semi_transparent_ratio": round(semi_ratio, 8),
        },
        "text_vector": {
            "status": vector_status,
            "path": str(text_vector_path) if text_vector_path else None,
            "sha256": _sha256(text_vector_path) if text_vector_path and text_vector_path.is_file() else None,
        },
        "declarations": {
            "orthographic_front": declared_orthographic,
            "no_cast_shadow_or_floor": declared_no_cast_shadow,
        },
        "failures": sorted(set(failures)),
        "warnings": sorted(set(warnings)),
        "human_checks_required": human_checks_required,
        "cannot_be_proven_from_pixels": [
            "true camera orthography",
            "absence of perspective without source/camera evidence",
            "physical manufacturability",
            "minimum wall thickness",
            "UV registration accuracy",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a Front Manufacturing Master contract")
    parser.add_argument("--image", type=Path, required=True)
    parser.add_argument("--mask", type=Path)
    parser.add_argument("--text-vector", type=Path)
    parser.add_argument("--minimum-long-edge-px", type=int, default=2048)
    parser.add_argument("--declared-orthographic", action="store_true")
    parser.add_argument("--declared-no-cast-shadow", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    try:
        report = validate_front_master(
            args.image,
            mask_path=args.mask,
            text_vector_path=args.text_vector,
            minimum_long_edge_px=args.minimum_long_edge_px,
            declared_orthographic=args.declared_orthographic,
            declared_no_cast_shadow=args.declared_no_cast_shadow,
        )
    except Exception as exc:
        print(f"front-master validation failed: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0 if report["decision"] in {"pass_contract_checks", "pass_with_warnings"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
