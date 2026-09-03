#!/usr/bin/env python3
"""Deterministic height-map to watertight relief mesh prototype.

Phase 0 scope:
- rectangular backing plate
- 8/16-bit grayscale relief map
- optional mask used only to suppress relief outside the foreground
- physical dimensions in millimetres
- binary STL (mm), GLB (metres), normalized 16-bit map and JSON report

This is deliberately not yet a silhouette trimmer or magnet-pocket boolean engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import trimesh
from PIL import Image
from scipy.ndimage import gaussian_filter

ENGINE_NAME = "renderhane-relief-builder"
ENGINE_VERSION = "0.1.0-phase0"


@dataclass(frozen=True)
class BuildRecipe:
    width_mm: float = 70.0
    height_mm: float | None = None
    base_thickness_mm: float = 3.0
    relief_depth_mm: float = 1.0
    percentile_low: float = 2.0
    percentile_high: float = 98.0
    gamma: float = 1.0
    smoothing_sigma_px: float = 1.0
    grid_long_edge: int = 256
    invert_depth: bool = False

    def validate(self) -> None:
        if self.width_mm <= 0:
            raise ValueError("width_mm must be > 0")
        if self.height_mm is not None and self.height_mm <= 0:
            raise ValueError("height_mm must be > 0 when supplied")
        if self.base_thickness_mm < 0.8:
            raise ValueError("base_thickness_mm must be >= 0.8")
        if self.relief_depth_mm <= 0:
            raise ValueError("relief_depth_mm must be > 0")
        if not 0 <= self.percentile_low < self.percentile_high <= 100:
            raise ValueError("percentiles must satisfy 0 <= low < high <= 100")
        if self.gamma <= 0:
            raise ValueError("gamma must be > 0")
        if self.smoothing_sigma_px < 0:
            raise ValueError("smoothing_sigma_px must be >= 0")
        if not 16 <= self.grid_long_edge <= 1024:
            raise ValueError("grid_long_edge must be between 16 and 1024")


@dataclass
class MeshValidation:
    watertight: bool
    winding_consistent: bool
    is_volume: bool
    euler_number: int
    vertex_count: int
    face_count: int
    extents_mm: list[float]
    volume_mm3: float
    min_z_mm: float
    max_z_mm: float
    open_edge_count: int | None
    warnings: list[str]
    production_status: str


@dataclass
class BuildReport:
    engine: str
    engine_version: str
    source_sha256: str
    mask_sha256: str | None
    recipe: dict[str, Any]
    source_dimensions_px: list[int]
    grid_dimensions_px: list[int]
    resolved_height_mm: float
    stl_units: str
    glb_units: str
    glb_scale_from_mm: float
    validation: dict[str, Any]
    artifacts: dict[str, str]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_grayscale(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        # Preserve 16-bit data where available. PIL modes I;16*, I and F all
        # convert safely to float32 through np.asarray.
        if image.mode not in {"I;16", "I;16B", "I;16L", "I", "F", "L"}:
            image = image.convert("L")
        array = np.asarray(image, dtype=np.float32)
    if array.ndim != 2:
        raise ValueError(f"Expected single-channel image, got shape {array.shape}")
    if not np.isfinite(array).all():
        raise ValueError("Relief map contains NaN or infinite values")
    return array


def load_mask(path: Path | None, target_size: tuple[int, int]) -> np.ndarray | None:
    if path is None:
        return None
    with Image.open(path) as image:
        image = image.convert("L").resize(target_size, Image.Resampling.LANCZOS)
        mask = np.asarray(image, dtype=np.float32) / 255.0
    return np.clip(mask, 0.0, 1.0)


def resize_float_map(array: np.ndarray, long_edge: int) -> np.ndarray:
    height, width = array.shape
    scale = long_edge / max(width, height)
    new_width = max(2, int(round(width * scale)))
    new_height = max(2, int(round(height * scale)))

    lo = float(array.min())
    hi = float(array.max())
    if math.isclose(lo, hi):
        normalized = np.zeros_like(array, dtype=np.float32)
    else:
        normalized = (array - lo) / (hi - lo)

    image = Image.fromarray(np.round(normalized * 65535.0).astype(np.uint16))
    image = image.resize((new_width, new_height), Image.Resampling.BICUBIC)
    resized = np.asarray(image, dtype=np.float32) / 65535.0
    return np.clip(resized, 0.0, 1.0)


def normalize_relief(
    array: np.ndarray,
    recipe: BuildRecipe,
    mask: np.ndarray | None,
) -> np.ndarray:
    valid = array[mask > 0.05] if mask is not None and np.any(mask > 0.05) else array.ravel()
    low = float(np.percentile(valid, recipe.percentile_low))
    high = float(np.percentile(valid, recipe.percentile_high))
    if math.isclose(low, high):
        raise ValueError("Relief map has no usable dynamic range after percentile clipping")

    normalized = np.clip((array - low) / (high - low), 0.0, 1.0)
    if recipe.invert_depth:
        normalized = 1.0 - normalized
    normalized = np.power(normalized, recipe.gamma, dtype=np.float32)

    if recipe.smoothing_sigma_px > 0:
        normalized = gaussian_filter(normalized, sigma=recipe.smoothing_sigma_px, mode="nearest")

    normalized = np.clip(normalized, 0.0, 1.0)
    if mask is not None:
        # Phase 0 behaviour: mask suppresses height but does not trim the plate.
        normalized *= mask
    return normalized.astype(np.float32, copy=False)


def build_rectangular_relief_mesh(
    relief: np.ndarray,
    width_mm: float,
    height_mm: float,
    base_thickness_mm: float,
    relief_depth_mm: float,
) -> trimesh.Trimesh:
    rows, cols = relief.shape
    x_values = np.linspace(-width_mm / 2.0, width_mm / 2.0, cols, dtype=np.float64)
    y_values = np.linspace(-height_mm / 2.0, height_mm / 2.0, rows, dtype=np.float64)
    xx, yy = np.meshgrid(x_values, y_values)

    top_z = base_thickness_mm + relief.astype(np.float64) * relief_depth_mm
    top_vertices = np.column_stack((xx.ravel(), yy.ravel(), top_z.ravel()))
    bottom_vertices = np.column_stack((xx.ravel(), yy.ravel(), np.zeros(rows * cols, dtype=np.float64)))
    vertices = np.vstack((top_vertices, bottom_vertices))

    top_faces: list[tuple[int, int, int]] = []
    bottom_faces: list[tuple[int, int, int]] = []
    offset = rows * cols

    for row in range(rows - 1):
        row_start = row * cols
        next_start = (row + 1) * cols
        for col in range(cols - 1):
            a = row_start + col
            b = a + 1
            c = next_start + col
            d = c + 1
            # Top points upward.
            top_faces.append((a, b, d))
            top_faces.append((a, d, c))
            # Bottom points downward.
            bottom_faces.append((offset + a, offset + d, offset + b))
            bottom_faces.append((offset + a, offset + c, offset + d))

    # Ordered perimeter, counter-clockwise when viewed from above.
    perimeter: list[int] = []
    perimeter.extend(range(0, cols))
    perimeter.extend(row * cols + (cols - 1) for row in range(1, rows))
    perimeter.extend((rows - 1) * cols + col for col in range(cols - 2, -1, -1))
    perimeter.extend(row * cols for row in range(rows - 2, 0, -1))

    side_faces: list[tuple[int, int, int]] = []
    for index, top_a in enumerate(perimeter):
        top_b = perimeter[(index + 1) % len(perimeter)]
        bottom_a = offset + top_a
        bottom_b = offset + top_b
        side_faces.append((top_a, bottom_a, bottom_b))
        side_faces.append((top_a, bottom_b, top_b))

    faces = np.asarray(top_faces + bottom_faces + side_faces, dtype=np.int64)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False, validate=False)
    mesh.remove_unreferenced_vertices()
    mesh.merge_vertices()
    trimesh.repair.fix_normals(mesh, multibody=True)
    return mesh


def count_open_edges(mesh: trimesh.Trimesh) -> int | None:
    try:
        unique_edges = mesh.edges_unique
        inverse = mesh.edges_unique_inverse
        counts = np.bincount(inverse, minlength=len(unique_edges))
        return int(np.count_nonzero(counts != 2))
    except Exception:
        return None


def validate_mesh(mesh: trimesh.Trimesh, recipe: BuildRecipe, resolved_height_mm: float) -> MeshValidation:
    extents = np.asarray(mesh.extents, dtype=np.float64)
    warnings: list[str] = []
    expected_depth = recipe.base_thickness_mm + recipe.relief_depth_mm

    tolerance_xy = 0.01
    tolerance_z = max(0.01, recipe.relief_depth_mm * 0.005)
    if abs(extents[0] - recipe.width_mm) > tolerance_xy:
        warnings.append("width_out_of_tolerance")
    if abs(extents[1] - resolved_height_mm) > tolerance_xy:
        warnings.append("height_out_of_tolerance")
    if extents[2] > expected_depth + tolerance_z:
        warnings.append("maximum_depth_exceeded")
    if float(mesh.bounds[0][2]) < -1e-6:
        warnings.append("negative_z_detected")

    open_edges = count_open_edges(mesh)
    watertight = bool(mesh.is_watertight)
    winding = bool(mesh.is_winding_consistent)
    is_volume = bool(mesh.is_volume)
    if not watertight:
        warnings.append("not_watertight")
    if not winding:
        warnings.append("inconsistent_winding")
    if not is_volume:
        warnings.append("not_a_closed_volume")
    if open_edges not in (None, 0):
        warnings.append("open_edges_detected")

    production_status = "ready" if not warnings else "needs_review"
    return MeshValidation(
        watertight=watertight,
        winding_consistent=winding,
        is_volume=is_volume,
        euler_number=int(mesh.euler_number),
        vertex_count=int(len(mesh.vertices)),
        face_count=int(len(mesh.faces)),
        extents_mm=[round(float(value), 6) for value in extents],
        volume_mm3=round(float(abs(mesh.volume)), 6),
        min_z_mm=round(float(mesh.bounds[0][2]), 6),
        max_z_mm=round(float(mesh.bounds[1][2]), 6),
        open_edge_count=open_edges,
        warnings=warnings,
        production_status=production_status,
    )


def save_relief_png(relief: np.ndarray, destination: Path) -> None:
    encoded = np.round(np.clip(relief, 0.0, 1.0) * 65535.0).astype(np.uint16)
    Image.fromarray(encoded).save(destination)


def build(
    relief_map_path: Path,
    output_dir: Path,
    recipe: BuildRecipe,
    mask_path: Path | None = None,
) -> BuildReport:
    recipe.validate()
    output_dir.mkdir(parents=True, exist_ok=True)

    source = load_grayscale(relief_map_path)
    source_height, source_width = source.shape
    resized = resize_float_map(source, recipe.grid_long_edge)
    mask = load_mask(mask_path, (resized.shape[1], resized.shape[0]))
    normalized = normalize_relief(resized, recipe, mask)

    resolved_height_mm = (
        recipe.height_mm
        if recipe.height_mm is not None
        else recipe.width_mm * (source_height / source_width)
    )

    mesh_mm = build_rectangular_relief_mesh(
        normalized,
        width_mm=recipe.width_mm,
        height_mm=resolved_height_mm,
        base_thickness_mm=recipe.base_thickness_mm,
        relief_depth_mm=recipe.relief_depth_mm,
    )
    validation = validate_mesh(mesh_mm, recipe, resolved_height_mm)

    normalized_path = output_dir / "relief-map-normalized-16.png"
    stl_path = output_dir / "model.stl"
    glb_path = output_dir / "model.glb"
    report_path = output_dir / "manufacturing-report.json"

    save_relief_png(normalized, normalized_path)
    mesh_mm.export(stl_path, file_type="stl")

    mesh_m = mesh_mm.copy()
    mesh_m.apply_scale(0.001)
    mesh_m.metadata.update(
        {
            "name": "Renderhane Relief Prototype",
            "source_units": "millimetres",
            "physical_width_mm": recipe.width_mm,
            "physical_height_mm": resolved_height_mm,
            "physical_depth_mm": float(mesh_mm.extents[2]),
            "engine": ENGINE_NAME,
            "engine_version": ENGINE_VERSION,
        }
    )
    glb_bytes = mesh_m.export(file_type="glb")
    glb_path.write_bytes(glb_bytes)

    report = BuildReport(
        engine=ENGINE_NAME,
        engine_version=ENGINE_VERSION,
        source_sha256=sha256_file(relief_map_path),
        mask_sha256=sha256_file(mask_path) if mask_path else None,
        recipe=asdict(recipe),
        source_dimensions_px=[source_width, source_height],
        grid_dimensions_px=[normalized.shape[1], normalized.shape[0]],
        resolved_height_mm=round(float(resolved_height_mm), 6),
        stl_units="millimetres",
        glb_units="metres",
        glb_scale_from_mm=0.001,
        validation=asdict(validation),
        artifacts={
            "normalized_relief_map": normalized_path.name,
            "stl": stl_path.name,
            "glb": glb_path.name,
            "report": report_path.name,
        },
    )
    report_path.write_text(json.dumps(asdict(report), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relief-map", required=True, type=Path, help="8/16-bit grayscale PNG or image")
    parser.add_argument("--mask", type=Path, help="Optional grayscale mask; suppresses relief only in Phase 0")
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
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    recipe = BuildRecipe(
        width_mm=args.width_mm,
        height_mm=args.height_mm,
        base_thickness_mm=args.base_thickness_mm,
        relief_depth_mm=args.relief_depth_mm,
        percentile_low=args.percentile_low,
        percentile_high=args.percentile_high,
        gamma=args.gamma,
        smoothing_sigma_px=args.smoothing_sigma_px,
        grid_long_edge=args.grid_long_edge,
        invert_depth=args.invert_depth,
    )

    try:
        report = build(args.relief_map, args.out_dir, recipe, args.mask)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(asdict(report), ensure_ascii=False, indent=2))
    return 0 if report.validation["production_status"] == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
