from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
import trimesh
from PIL import Image

from export_3mf import export_3mf

ENGINE_VERSION = "product-relief-builder-v0.2.0"
NormalizationMode = Literal["absolute", "robust"]


@dataclass(frozen=True)
class ProductRecipe:
    width_mm: float = 70.0
    height_mm: float | None = None
    base_thickness_mm: float = 3.0
    relief_depth_mm: float = 1.2
    grid_long_edge: int = 192
    gamma: float = 1.0
    percentile_low: float = 1.0
    percentile_high: float = 99.0
    invert_depth: bool = False
    pocket_diameter_mm: float | None = None
    pocket_depth_mm: float | None = None
    pocket_x_mm: float = 0.0
    pocket_y_mm: float = 0.0
    minimum_remaining_base_mm: float = 0.8
    pocket_edge_clearance_mm: float = 1.5
    normalization_mode: NormalizationMode = "absolute"

    def validate(self) -> None:
        if not math.isfinite(self.width_mm) or self.width_mm <= 0:
            raise ValueError("width_mm must be positive and finite")
        if self.height_mm is not None and (not math.isfinite(self.height_mm) or self.height_mm <= 0):
            raise ValueError("height_mm must be positive and finite")
        if not 1.0 <= self.base_thickness_mm <= 20.0:
            raise ValueError("base_thickness_mm must be between 1 and 20")
        if not 0.05 <= self.relief_depth_mm <= 10.0:
            raise ValueError("relief_depth_mm must be between 0.05 and 10")
        if not 24 <= self.grid_long_edge <= 1024:
            raise ValueError("grid_long_edge must be between 24 and 1024")
        if not math.isfinite(self.gamma) or self.gamma <= 0:
            raise ValueError("gamma must be positive and finite")
        if self.normalization_mode not in {"absolute", "robust"}:
            raise ValueError("normalization_mode must be absolute or robust")
        if not 0 <= self.percentile_low < self.percentile_high <= 100:
            raise ValueError("percentile range is invalid")

        pocket_values = (self.pocket_diameter_mm, self.pocket_depth_mm)
        if any(value is not None for value in pocket_values):
            if any(value is None for value in pocket_values):
                raise ValueError("pocket_diameter_mm and pocket_depth_mm must be provided together")
            assert self.pocket_diameter_mm is not None
            assert self.pocket_depth_mm is not None
            if self.pocket_diameter_mm <= 0 or self.pocket_depth_mm <= 0:
                raise ValueError("pocket dimensions must be positive")
            if self.pocket_depth_mm > self.base_thickness_mm - self.minimum_remaining_base_mm:
                raise ValueError("pocket leaves less than minimum_remaining_base_mm")
            if self.minimum_remaining_base_mm < 0.4:
                raise ValueError("minimum_remaining_base_mm must be at least 0.4")
            if self.pocket_edge_clearance_mm < 0:
                raise ValueError("pocket_edge_clearance_mm cannot be negative")


@dataclass(frozen=True)
class ProductBuildReport:
    schema_version: int
    engine_version: str
    recipe: dict[str, Any]
    recipe_sha256: str
    source_sha256: str
    mask_sha256: str
    validation: dict[str, Any]
    artifacts: dict[str, dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_unsigned_16bit_grayscale(
    path: Path,
    *,
    mode: str,
    format_name: str | None,
    array: np.ndarray,
) -> bool:
    if array.ndim != 2 or not np.issubdtype(array.dtype, np.integer):
        return False
    if array.size and (int(array.min()) < 0 or int(array.max()) > 65535):
        return False
    if format_name != "PNG":
        return False
    with path.open("rb") as handle:
        header = handle.read(26)
    return (
        mode in {"I", "I;16", "I;16B", "I;16L", "I;16N"}
        and header[:8] == bytes((137, 80, 78, 71, 13, 10, 26, 10))
        and header[12:16] == b"IHDR"
        and header[24:26] == bytes((16, 0))
    )


def _load_relief(path: Path, *, require_16bit: bool) -> np.ndarray:
    with Image.open(path) as image:
        mode = image.mode
        format_name = image.format
        array = np.asarray(image)
    is_16bit_grayscale = _is_unsigned_16bit_grayscale(
        path,
        mode=mode,
        format_name=format_name,
        array=array,
    )
    if require_16bit and not is_16bit_grayscale:
        raise ValueError(
            "canonical relief map must be a 16-bit grayscale PNG image; "
            "use normalization_mode='robust' only for legacy candidate inputs"
        )
    if array.ndim == 3:
        array = array[..., :3].astype(np.float64).mean(axis=2)
    array = array.astype(np.float64)
    if array.size == 0 or not np.isfinite(array).all():
        raise ValueError("relief map is empty or non-finite")
    max_value = float(array.max())
    if require_16bit:
        array = array / 65535.0
    elif max_value > 1.0:
        array = array / (65535.0 if max_value > 255.0 else 255.0)
    return np.clip(array, 0.0, 1.0).astype(np.float32)


def _load_mask(path: Path, expected_shape: tuple[int, int]) -> np.ndarray:
    with Image.open(path) as image:
        mask = np.asarray(image.convert("L"), dtype=np.uint8) > 127
    if mask.shape != expected_shape:
        raise ValueError(
            f"mask shape {mask.shape[1]}x{mask.shape[0]} does not match relief "
            f"{expected_shape[1]}x{expected_shape[0]}"
        )
    if not mask.any():
        raise ValueError("mask contains no foreground")
    return mask


def _largest_component(mask: np.ndarray) -> np.ndarray:
    rows, cols = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best: list[tuple[int, int]] = []

    for row in range(rows):
        for col in range(cols):
            if not mask[row, col] or visited[row, col]:
                continue
            stack = [(row, col)]
            visited[row, col] = True
            component: list[tuple[int, int]] = []
            while stack:
                current_row, current_col = stack.pop()
                component.append((current_row, current_col))
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
                        stack.append((next_row, next_col))
            if len(component) > len(best):
                best = component

    output = np.zeros_like(mask, dtype=bool)
    for row, col in best:
        output[row, col] = True
    return output


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    rows, cols = mask.shape
    exterior = np.zeros_like(mask, dtype=bool)
    stack: list[tuple[int, int]] = []

    for col in range(cols):
        if not mask[0, col]:
            stack.append((0, col))
        if not mask[rows - 1, col]:
            stack.append((rows - 1, col))
    for row in range(rows):
        if not mask[row, 0]:
            stack.append((row, 0))
        if not mask[row, cols - 1]:
            stack.append((row, cols - 1))

    while stack:
        row, col = stack.pop()
        if exterior[row, col] or mask[row, col]:
            continue
        exterior[row, col] = True
        for next_row, next_col in (
            (row - 1, col),
            (row + 1, col),
            (row, col - 1),
            (row, col + 1),
        ):
            if 0 <= next_row < rows and 0 <= next_col < cols and not exterior[next_row, next_col]:
                stack.append((next_row, next_col))

    holes = ~mask & ~exterior
    return mask | holes


def _crop_inputs(relief: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, np.ndarray, tuple[int, int, int, int]]:
    rows, cols = np.where(mask)
    top, bottom = int(rows.min()), int(rows.max()) + 1
    left, right = int(cols.min()), int(cols.max()) + 1
    return relief[top:bottom, left:right], mask[top:bottom, left:right], (left, top, right, bottom)


def _normalise_relief(
    relief: np.ndarray,
    mask: np.ndarray,
    recipe: ProductRecipe,
) -> tuple[np.ndarray, dict[str, Any]]:
    inside = relief[mask]
    if inside.size == 0:
        raise ValueError("no relief pixels remain inside mask")
    input_min = float(inside.min())
    input_max = float(inside.max())
    if recipe.normalization_mode == "absolute":
        normalised = np.clip(relief, 0.0, 1.0)
        normalization = {
            "mode": "absolute",
            "input_min": input_min,
            "input_max": input_max,
            "scale": "uint16_code_value_divided_by_65535",
            "percentile_low": None,
            "percentile_high": None,
        }
    else:
        low = float(np.percentile(inside, recipe.percentile_low))
        high = float(np.percentile(inside, recipe.percentile_high))
        if high <= low:
            raise ValueError("relief map has no usable dynamic range")
        normalised = np.clip((relief - low) / (high - low), 0.0, 1.0)
        normalization = {
            "mode": "robust",
            "input_min": input_min,
            "input_max": input_max,
            "percentile_low": recipe.percentile_low,
            "percentile_high": recipe.percentile_high,
            "clipped_low": low,
            "clipped_high": high,
        }
    if recipe.invert_depth:
        normalised = 1.0 - normalised
    normalised = np.power(normalised, recipe.gamma).astype(np.float32)
    normalised[~mask] = 0.0
    return normalised, normalization


def _grid_shape(width_px: int, height_px: int, long_edge: int) -> tuple[int, int]:
    if width_px >= height_px:
        cols = long_edge
        rows = max(3, int(round(long_edge * height_px / width_px)))
    else:
        rows = long_edge
        cols = max(3, int(round(long_edge * width_px / height_px)))
    return rows, cols


def _resize_float(values: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    image = Image.fromarray(values.astype(np.float32), mode="F")
    return np.asarray(image.resize(size, Image.Resampling.BICUBIC), dtype=np.float32)


def _cell_mask(mask: np.ndarray, rows: int, cols: int) -> np.ndarray:
    image = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    cells = np.asarray(
        image.resize((cols - 1, rows - 1), Image.Resampling.NEAREST),
        dtype=np.uint8,
    ) > 127
    cells = _largest_component(cells)
    cells = _fill_holes(cells)
    if not cells.any():
        raise ValueError("mask vanished at requested grid resolution")
    return cells


def _canonicalise(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(mesh, multibody=True)

    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    order = np.lexsort((vertices[:, 2], vertices[:, 1], vertices[:, 0]))
    inverse = np.empty_like(order)
    inverse[order] = np.arange(len(order))
    vertices = vertices[order]
    faces = inverse[faces]

    canonical_faces = np.empty_like(faces)
    for index, face in enumerate(faces):
        canonical_faces[index] = np.roll(face, -int(np.argmin(face)))
    face_order = np.lexsort(
        (canonical_faces[:, 2], canonical_faces[:, 1], canonical_faces[:, 0])
    )
    canonical_faces = canonical_faces[face_order]

    return trimesh.Trimesh(vertices=vertices, faces=canonical_faces, process=False)


def _make_heightfield_mesh(
    relief: np.ndarray,
    cells: np.ndarray,
    width_mm: float,
    height_mm: float,
    base_mm: float,
    relief_mm: float,
) -> trimesh.Trimesh:
    rows, cols = relief.shape
    x_values = np.linspace(-width_mm / 2.0, width_mm / 2.0, cols, dtype=np.float64)
    y_values = np.linspace(height_mm / 2.0, -height_mm / 2.0, rows, dtype=np.float64)

    used_nodes: set[tuple[int, int]] = set()
    for row, col in np.argwhere(cells):
        r, c = int(row), int(col)
        used_nodes.update(((r, c), (r, c + 1), (r + 1, c), (r + 1, c + 1)))

    ordered_nodes = sorted(used_nodes)
    top_index: dict[tuple[int, int], int] = {}
    bottom_index: dict[tuple[int, int], int] = {}
    vertices: list[list[float]] = []

    for node in ordered_nodes:
        row, col = node
        top_index[node] = len(vertices)
        vertices.append(
            [
                float(x_values[col]),
                float(y_values[row]),
                float(base_mm + relief_mm * relief[row, col]),
            ]
        )
    for node in ordered_nodes:
        row, col = node
        bottom_index[node] = len(vertices)
        vertices.append([float(x_values[col]), float(y_values[row]), 0.0])

    faces: list[list[int]] = []
    cell_rows, cell_cols = cells.shape

    def add_wall(start: tuple[int, int], end: tuple[int, int]) -> None:
        top_start = top_index[start]
        top_end = top_index[end]
        bottom_start = bottom_index[start]
        bottom_end = bottom_index[end]
        faces.append([top_start, bottom_start, bottom_end])
        faces.append([top_start, bottom_end, top_end])

    for row, col in np.argwhere(cells):
        r, c = int(row), int(col)
        a = (r, c)
        b = (r, c + 1)
        d = (r + 1, c)
        e = (r + 1, c + 1)

        # Top points upward; bottom points downward.
        faces.extend(
            [
                [top_index[a], top_index[d], top_index[e]],
                [top_index[a], top_index[e], top_index[b]],
                [bottom_index[a], bottom_index[b], bottom_index[e]],
                [bottom_index[a], bottom_index[e], bottom_index[d]],
            ]
        )

        # Boundary directions follow the counter-clockwise top perimeter.
        if c == 0 or not cells[r, c - 1]:
            add_wall(a, d)
        if r == cell_rows - 1 or not cells[r + 1, c]:
            add_wall(d, e)
        if c == cell_cols - 1 or not cells[r, c + 1]:
            add_wall(e, b)
        if r == 0 or not cells[r - 1, c]:
            add_wall(b, a)

    return _canonicalise(
        trimesh.Trimesh(
            vertices=np.asarray(vertices, dtype=np.float64),
            faces=np.asarray(faces, dtype=np.int64),
            process=False,
        )
    )


def _apply_pocket(mesh: trimesh.Trimesh, recipe: ProductRecipe) -> trimesh.Trimesh:
    if recipe.pocket_diameter_mm is None:
        return mesh
    assert recipe.pocket_depth_mm is not None

    radius = recipe.pocket_diameter_mm / 2.0
    half_x = float(mesh.extents[0]) / 2.0
    half_y = float(mesh.extents[1]) / 2.0
    if abs(recipe.pocket_x_mm) + radius + recipe.pocket_edge_clearance_mm > half_x:
        raise ValueError("pocket exceeds X bounds or edge clearance")
    if abs(recipe.pocket_y_mm) + radius + recipe.pocket_edge_clearance_mm > half_y:
        raise ValueError("pocket exceeds Y bounds or edge clearance")

    overlap = 0.20
    cutter = trimesh.creation.cylinder(
        radius=radius,
        height=recipe.pocket_depth_mm + 2.0 * overlap,
        sections=96,
        transform=trimesh.transformations.translation_matrix(
            [
                recipe.pocket_x_mm,
                recipe.pocket_y_mm,
                recipe.pocket_depth_mm / 2.0 - overlap,
            ]
        ),
    )
    try:
        result = trimesh.boolean.difference(
            [mesh, cutter],
            engine="manifold",
            check_volume=True,
        )
    except Exception as exc:
        raise RuntimeError(
            "magnet pocket boolean requires a working manifold3d backend"
        ) from exc
    if result is None:
        raise RuntimeError("magnet pocket boolean returned no mesh")
    if isinstance(result, list):
        if len(result) != 1:
            raise RuntimeError("magnet pocket boolean produced multiple bodies")
        result = result[0]
    return _canonicalise(result)


def _open_edge_count(mesh: trimesh.Trimesh) -> int:
    counts = np.bincount(mesh.edges_unique_inverse)
    return int(np.count_nonzero(counts == 1))


def _component_count(mesh: trimesh.Trimesh) -> int:
    return len(mesh.split(only_watertight=False))


def _validate_mesh(mesh: trimesh.Trimesh, recipe: ProductRecipe) -> dict[str, Any]:
    bounds = np.asarray(mesh.bounds, dtype=np.float64)
    extents = np.asarray(mesh.extents, dtype=np.float64)
    open_edges = _open_edge_count(mesh)
    components = _component_count(mesh)
    expected_max_z = recipe.base_thickness_mm + recipe.relief_depth_mm
    actual_max_z = float(bounds[1, 2])
    actual_min_z = float(bounds[0, 2])

    failures: list[str] = []
    warnings: list[str] = []
    if not mesh.is_watertight:
        failures.append("mesh_not_watertight")
    if not mesh.is_winding_consistent:
        failures.append("winding_inconsistent")
    if not mesh.is_volume:
        failures.append("not_positive_volume")
    if open_edges != 0:
        failures.append("open_edges")
    if components != 1:
        failures.append("multiple_components")
    if abs(actual_min_z) > 1e-6:
        failures.append("back_plane_not_at_zero")
    if actual_max_z > expected_max_z + 0.02:
        failures.append("relief_exceeds_recipe")
    if actual_max_z < recipe.base_thickness_mm - 1e-6:
        failures.append("base_thickness_not_preserved")
    if recipe.grid_long_edge < 96:
        warnings.append("low_grid_resolution")
    if recipe.normalization_mode == "robust":
        warnings.append("legacy_robust_normalization_not_canonical")
    if recipe.pocket_diameter_mm is not None:
        warnings.append(
            "magnet_pocket_requires_bridge_retention_and_orientation_physical_test"
        )

    return {
        "digital_status": "validated" if not failures and not warnings else "needs_review",
        "production_status": (
            "physical_validation_required" if not failures and not warnings else "blocked"
        ),
        "physical_validation_required": True,
        "claim_scope": "phase0_digital_geometry_only",
        "digital_geometry_gate": "pass" if not failures else "fail",
        "watertight": bool(mesh.is_watertight),
        "winding_consistent": bool(mesh.is_winding_consistent),
        "is_volume": bool(mesh.is_volume),
        "open_edge_count": open_edges,
        "component_count": components,
        "bounds_mm": np.round(bounds, 6).tolist(),
        "extents_mm": np.round(extents, 6).tolist(),
        "volume_mm3": round(float(mesh.volume), 6),
        "back_plane_z_mm": actual_min_z,
        "maximum_z_mm": actual_max_z,
        "failures": failures,
        "warnings": warnings,
        "physical_validation": "pending",
    }


def build_product_relief(
    relief_map_path: Path,
    mask_path: Path,
    output_dir: Path,
    recipe: ProductRecipe,
) -> ProductBuildReport:
    recipe.validate()
    if not relief_map_path.is_file():
        raise FileNotFoundError(relief_map_path)
    if not mask_path.is_file():
        raise FileNotFoundError(mask_path)

    source = _load_relief(
        relief_map_path,
        require_16bit=recipe.normalization_mode == "absolute",
    )
    mask = _load_mask(mask_path, source.shape)
    source, mask, crop_box = _crop_inputs(source, mask)
    normalised, normalization = _normalise_relief(source, mask, recipe)

    rows, cols = _grid_shape(source.shape[1], source.shape[0], recipe.grid_long_edge)
    grid_relief = _resize_float(normalised, (cols, rows))
    grid_relief = np.clip(grid_relief, 0.0, 1.0)
    cells = _cell_mask(mask, rows, cols)

    width_mm = recipe.width_mm
    if recipe.height_mm is not None:
        height_mm = recipe.height_mm
    else:
        height_mm = width_mm * source.shape[0] / source.shape[1]

    mesh = _make_heightfield_mesh(
        grid_relief,
        cells,
        width_mm,
        height_mm,
        recipe.base_thickness_mm,
        recipe.relief_depth_mm,
    )
    mesh = _apply_pocket(mesh, recipe)
    validation = _validate_mesh(mesh, recipe)

    output_dir.mkdir(parents=True, exist_ok=True)
    stl_path = output_dir / "model.stl"
    glb_path = output_dir / "model.glb"
    three_mf_path = output_dir / "model.3mf"
    relief_path = output_dir / "relief-map-normalized-16.png"
    mask_output_path = output_dir / "silhouette-mask-normalized.png"

    mesh.export(stl_path, file_type="stl")
    glb_mesh = mesh.copy()
    glb_mesh.apply_scale(0.001)
    glb_path.write_bytes(glb_mesh.export(file_type="glb"))
    export_3mf(
        stl_path,
        three_mf_path,
        title="Renderhane Product Relief",
        source_unit="millimeter",
    )

    Image.fromarray(
        np.round(grid_relief * 65535.0).astype(np.uint16), mode="I;16"
    ).save(relief_path)
    Image.fromarray((cells * 255).astype(np.uint8), mode="L").save(mask_output_path)

    recipe_data = asdict(recipe)
    recipe_sha = hashlib.sha256(
        json.dumps(recipe_data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    artifact_paths = [stl_path, glb_path, three_mf_path, relief_path, mask_output_path]
    artifacts = {
        path.name: {"bytes": path.stat().st_size, "sha256": _sha256(path)}
        for path in artifact_paths
    }
    validation["crop_box_px"] = list(crop_box)
    validation["mask_trimmed"] = True
    validation["grid_vertices"] = [cols, rows]
    validation["grid_cells_foreground"] = int(cells.sum())
    validation["normalization"] = normalization

    report = ProductBuildReport(
        schema_version=1,
        engine_version=ENGINE_VERSION,
        recipe=recipe_data,
        recipe_sha256=recipe_sha,
        source_sha256=_sha256(relief_map_path),
        mask_sha256=_sha256(mask_path),
        validation=validation,
        artifacts=artifacts,
    )
    (output_dir / "manufacturing-report.json").write_text(
        json.dumps(report.to_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a silhouette-trimmed Relief Pro product mesh")
    parser.add_argument("--relief-map", type=Path, required=True)
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float)
    parser.add_argument("--base-mm", type=float, default=3.0)
    parser.add_argument("--relief-mm", type=float, default=1.2)
    parser.add_argument("--grid-long-edge", type=int, default=192)
    parser.add_argument("--gamma", type=float, default=1.0)
    parser.add_argument(
        "--normalization-mode",
        choices=("absolute", "robust"),
        default="absolute",
    )
    parser.add_argument("--invert-depth", action="store_true")
    parser.add_argument("--pocket-diameter-mm", type=float)
    parser.add_argument("--pocket-depth-mm", type=float)
    parser.add_argument("--pocket-x-mm", type=float, default=0.0)
    parser.add_argument("--pocket-y-mm", type=float, default=0.0)
    args = parser.parse_args(argv)

    recipe = ProductRecipe(
        width_mm=args.width_mm,
        height_mm=args.height_mm,
        base_thickness_mm=args.base_mm,
        relief_depth_mm=args.relief_mm,
        grid_long_edge=args.grid_long_edge,
        gamma=args.gamma,
        normalization_mode=args.normalization_mode,
        invert_depth=args.invert_depth,
        pocket_diameter_mm=args.pocket_diameter_mm,
        pocket_depth_mm=args.pocket_depth_mm,
        pocket_x_mm=args.pocket_x_mm,
        pocket_y_mm=args.pocket_y_mm,
    )
    try:
        report = build_product_relief(args.relief_map, args.mask, args.output, recipe)
    except Exception as exc:
        print(f"product relief build failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(report.to_dict(), ensure_ascii=False, sort_keys=True))
    return 0 if report.validation["digital_geometry_gate"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
