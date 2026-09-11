from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from validate_artifacts import _load_glb

ENGINE_VERSION = "final-glb-orthographic-raster-v0.2.0"
PROJECTION_SCHEMA_VERSION = 1
MAX_PROJECTED_TRIANGLES = 600_000


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_canvas(canvas_px: tuple[int, int]) -> tuple[int, int]:
    width, height = canvas_px
    if not isinstance(width, int) or not isinstance(height, int):
        raise ValueError("projection canvas dimensions must be integers")
    if width < 1 or height < 1 or width * height > 4_000_000:
        raise ValueError("projection canvas is outside safe limits")
    return width, height


def _validate_xy_bounds(expected_xy_bounds_mm: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    min_x, min_y, max_x, max_y = (float(value) for value in expected_xy_bounds_mm)
    values = (min_x, min_y, max_x, max_y)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("projection bounds must be finite")
    if max_x <= min_x or max_y <= min_y:
        raise ValueError("projection bounds must have positive extents")
    return values


def _enforce_projected_triangle_limit(count: int) -> None:
    if count > MAX_PROJECTED_TRIANGLES:
        raise ValueError(
            f"front projection exceeds {MAX_PROJECTED_TRIANGLES} visible triangles"
        )


def render_glb_front_orthographic(
    glb_path: Path,
    *,
    canvas_px: tuple[int, int],
    expected_xy_bounds_mm: tuple[float, float, float, float],
    base_thickness_mm: float,
    relief_depth_mm: float,
) -> tuple[np.ndarray, np.ndarray, dict[str, Any]]:
    width, height = _validate_canvas(canvas_px)
    min_x, min_y, max_x, max_y = _validate_xy_bounds(expected_xy_bounds_mm)
    if not math.isfinite(base_thickness_mm) or base_thickness_mm < 0:
        raise ValueError("base thickness must be finite and non-negative")
    if not math.isfinite(relief_depth_mm) or relief_depth_mm <= 0:
        raise ValueError("relief depth must be finite and positive")

    mesh, mesh_evidence = _load_glb(glb_path)
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    face_normals = np.asarray(mesh.face_normals, dtype=np.float64)
    if face_normals.shape != (len(faces), 3) or not np.isfinite(face_normals).all():
        raise ValueError("final GLB has invalid face normals")
    front_facing = face_normals[:, 2] > 1e-12
    faces = faces[front_facing]
    _enforce_projected_triangle_limit(len(faces))
    projected = np.empty((len(vertices), 3), dtype=np.float64)
    projected[:, 0] = (vertices[:, 0] - min_x) * width / (max_x - min_x)
    projected[:, 1] = (max_y - vertices[:, 1]) * height / (max_y - min_y)
    projected[:, 2] = vertices[:, 2]

    z_buffer = np.full((height, width), -np.inf, dtype=np.float64)
    epsilon = 1e-10
    for face in faces:
        triangle = projected[face]
        x0, y0, z0 = triangle[0]
        x1, y1, z1 = triangle[1]
        x2, y2, z2 = triangle[2]
        denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(denominator) <= epsilon:
            continue

        col_min = max(0, int(math.ceil(float(np.min(triangle[:, 0])) - 0.5)))
        col_max = min(width - 1, int(math.floor(float(np.max(triangle[:, 0])) - 0.5)))
        row_min = max(0, int(math.ceil(float(np.min(triangle[:, 1])) - 0.5)))
        row_max = min(height - 1, int(math.floor(float(np.max(triangle[:, 1])) - 0.5)))
        if col_min > col_max or row_min > row_max:
            continue

        xs = np.arange(col_min, col_max + 1, dtype=np.float64) + 0.5
        ys = np.arange(row_min, row_max + 1, dtype=np.float64) + 0.5
        grid_x, grid_y = np.meshgrid(xs, ys)
        weight0 = ((y1 - y2) * (grid_x - x2) + (x2 - x1) * (grid_y - y2)) / denominator
        weight1 = ((y2 - y0) * (grid_x - x2) + (x0 - x2) * (grid_y - y2)) / denominator
        weight2 = 1.0 - weight0 - weight1
        inside = (weight0 >= -epsilon) & (weight1 >= -epsilon) & (weight2 >= -epsilon)
        if not bool(np.any(inside)):
            continue
        z_values = weight0 * z0 + weight1 * z1 + weight2 * z2
        view = z_buffer[row_min : row_max + 1, col_min : col_max + 1]
        np.maximum(view, np.where(inside, z_values, -np.inf), out=view)

    mask = np.isfinite(z_buffer)
    if not bool(np.any(mask)):
        raise ValueError("final GLB has no coverage inside the declared physical frame")
    normalized = np.zeros_like(z_buffer, dtype=np.float64)
    normalized[mask] = np.clip(
        (z_buffer[mask] - base_thickness_mm) / relief_depth_mm,
        0.0,
        1.0,
    )
    depth_u16 = np.round(normalized * 65535.0).astype(np.uint16)

    actual_bounds = np.asarray(mesh.bounds, dtype=np.float64)
    expected_bounds = np.asarray(
        [[min_x, min_y], [max_x, max_y]],
        dtype=np.float64,
    )
    xy_bound_delta = actual_bounds[:, :2] - expected_bounds
    evidence = {
        "schema_version": PROJECTION_SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
        "source_artifact": "geometry/model.glb",
        "source_glb_sha256": _sha256(glb_path),
        "source_unit": "metre",
        "working_unit": "millimetre",
        "camera": "orthographic_positive_z_looking_negative_z",
        "pixel_sample_location": "centre_0.5_0.5",
        "canvas_px": [width, height],
        "expected_xy_bounds_mm": [
            [round(min_x, 8), round(min_y, 8)],
            [round(max_x, 8), round(max_y, 8)],
        ],
        "actual_bounds_mm": np.round(actual_bounds, 8).tolist(),
        "actual_extents_mm": np.round(np.asarray(mesh.extents), 8).tolist(),
        "maximum_expected_xy_bound_delta_mm": round(float(np.max(np.abs(xy_bound_delta))), 10),
        "pixel_pitch_mm": [
            round((max_x - min_x) / width, 10),
            round((max_y - min_y) / height, 10),
        ],
        "covered_pixels": int(np.count_nonzero(mask)),
        "vertex_count": int(mesh_evidence.vertex_count),
        "triangle_count": int(mesh_evidence.triangle_count),
        "projected_front_facing_triangle_count": int(len(faces)),
        "watertight": bool(mesh_evidence.watertight),
        "winding_consistent": bool(mesh_evidence.winding_consistent),
        "depth_encoding": {
            "format": "unsigned_16_bit_png",
            "base_thickness_mm": round(base_thickness_mm, 8),
            "relief_depth_mm": round(relief_depth_mm, 8),
            "outside_value": 0,
        },
        "limitations": [
            "This is a CPU pixel-centre digital projection, not a physical printer measurement.",
            f"Projection is rejected above {MAX_PROJECTED_TRIANGLES} front-facing triangles.",
            "An untextured GLB cannot reconstruct colour, white-ink or varnish intent.",
        ],
    }
    return mask, depth_u16, evidence


def write_glb_projection_artifacts(
    glb_path: Path,
    *,
    silhouette_path: Path,
    depth_path: Path,
    evidence_path: Path,
    canvas_px: tuple[int, int],
    expected_xy_bounds_mm: tuple[float, float, float, float],
    base_thickness_mm: float,
    relief_depth_mm: float,
) -> dict[str, Any]:
    mask, depth_u16, evidence = render_glb_front_orthographic(
        glb_path,
        canvas_px=canvas_px,
        expected_xy_bounds_mm=expected_xy_bounds_mm,
        base_thickness_mm=base_thickness_mm,
        relief_depth_mm=relief_depth_mm,
    )
    silhouette_path.parent.mkdir(parents=True, exist_ok=True)
    depth_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(mask.astype(np.uint8) * 255, mode="L").save(silhouette_path)
    Image.fromarray(depth_u16).save(depth_path)
    evidence_path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return evidence
