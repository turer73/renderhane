"""Deterministic rectangular and grid-aligned silhouette mesh construction."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import trimesh
from scipy.ndimage import label

from .models import BuildRecipe, MeshValidation


def _grid_coordinates(rows: int, cols: int, width_mm: float, height_mm: float) -> tuple[np.ndarray, np.ndarray]:
    x_values = np.linspace(-width_mm / 2.0, width_mm / 2.0, cols, dtype=np.float64)
    # Source image row 0 is the visual top. Map it to positive model Y so a
    # +Z front view has the same orientation as the source and UV artwork.
    y_values = np.linspace(height_mm / 2.0, -height_mm / 2.0, rows, dtype=np.float64)
    return x_values, y_values


def _finalize_mesh(vertices: np.ndarray, faces: np.ndarray) -> trimesh.Trimesh:
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False, validate=False)
    mesh.remove_unreferenced_vertices()
    mesh.merge_vertices()
    trimesh.repair.fix_normals(mesh, multibody=True)
    return mesh


def build_rectangular_relief_mesh(
    relief: np.ndarray,
    width_mm: float,
    height_mm: float,
    base_thickness_mm: float,
    relief_depth_mm: float,
) -> trimesh.Trimesh:
    rows, cols = relief.shape
    x_values, y_values = _grid_coordinates(rows, cols, width_mm, height_mm)
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
            top_faces.extend(((a, c, d), (a, d, b)))
            bottom_faces.extend(((offset + a, offset + d, offset + c), (offset + a, offset + b, offset + d)))

    perimeter: list[int] = []
    perimeter.extend(range(0, cols))
    perimeter.extend(row * cols + (cols - 1) for row in range(1, rows))
    perimeter.extend((rows - 1) * cols + col for col in range(cols - 2, -1, -1))
    perimeter.extend(row * cols for row in range(rows - 2, 0, -1))
    perimeter.reverse()

    side_faces: list[tuple[int, int, int]] = []
    for index, top_a in enumerate(perimeter):
        top_b = perimeter[(index + 1) % len(perimeter)]
        bottom_a = offset + top_a
        bottom_b = offset + top_b
        side_faces.extend(((top_a, bottom_a, bottom_b), (top_a, bottom_b, top_b)))

    return _finalize_mesh(
        vertices,
        np.asarray(top_faces + bottom_faces + side_faces, dtype=np.int64),
    )


def _single_four_connected_component(active_cells: np.ndarray) -> None:
    structure = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=np.uint8)
    _, count = label(active_cells, structure=structure)
    if count != 1:
        raise ValueError(
            "Silhouette must contain exactly one 4-connected component; "
            f"found {count}. Remove detached islands or diagonal-only bridges."
        )


def trace_boundary_loops(
    boundary_edges: dict[tuple[int, int], tuple[int, int]],
) -> list[list[int]]:
    """Trace simple grid-boundary loops and reject point-touching contours."""
    adjacency: dict[int, set[int]] = {}
    undirected_edges: set[tuple[int, int]] = set()
    for a, b in boundary_edges.values():
        key = tuple(sorted((a, b)))
        undirected_edges.add(key)
        adjacency.setdefault(a, set()).add(b)
        adjacency.setdefault(b, set()).add(a)

    non_simple = sorted(vertex for vertex, neighbours in adjacency.items() if len(neighbours) != 2)
    if non_simple:
        raise ValueError(
            "Silhouette boundary is not a simple contour; remove point-touching cells "
            f"or branching edges near vertices {non_simple[:8]}"
        )

    unused = set(undirected_edges)
    loops: list[list[int]] = []
    while unused:
        start_edge = min(unused)
        start, current = start_edge
        loop = [start]
        previous = start
        unused.remove(start_edge)
        loop.append(current)

        while current != start:
            candidates = sorted(adjacency[current] - {previous})
            if len(candidates) != 1:
                raise ValueError("Silhouette boundary tracing failed")
            nxt = candidates[0]
            edge = tuple(sorted((current, nxt)))
            if nxt == start:
                if edge not in unused:
                    raise ValueError("Silhouette boundary closed through an already used edge")
                unused.remove(edge)
                break
            if edge not in unused:
                raise ValueError("Silhouette boundary contains a repeated or intersecting edge")
            unused.remove(edge)
            previous, current = current, nxt
            loop.append(current)

        loops.append(loop)
    return loops


def build_silhouette_relief_mesh(
    relief: np.ndarray,
    mask: np.ndarray,
    width_mm: float,
    height_mm: float,
    base_thickness_mm: float,
    relief_depth_mm: float,
    mask_threshold: float,
) -> tuple[trimesh.Trimesh, dict[str, Any], list[list[tuple[float, float]]]]:
    rows, cols = relief.shape
    if rows < 2 or cols < 2:
        raise ValueError("Silhouette grid must be at least 2 x 2")

    cell_score = (
        mask[:-1, :-1] + mask[:-1, 1:] + mask[1:, :-1] + mask[1:, 1:]
    ) / 4.0
    active_cells = cell_score >= mask_threshold
    if not np.any(active_cells):
        raise ValueError("Silhouette has no active cells at mask_threshold")
    _single_four_connected_component(active_cells)

    x_values, y_values = _grid_coordinates(rows, cols, width_mm, height_mm)
    active_positions = np.argwhere(active_cells)
    row_min, col_min = active_positions.min(axis=0)
    row_max, col_max = active_positions.max(axis=0)
    used_nodes: set[tuple[int, int]] = set()
    for row, col in active_positions:
        used_nodes.update(((row, col), (row, col + 1), (row + 1, col + 1), (row + 1, col)))

    ordered_nodes = sorted(used_nodes)
    node_index = {node: index for index, node in enumerate(ordered_nodes)}
    top_vertices = np.empty((len(ordered_nodes), 3), dtype=np.float64)
    for index, (row, col) in enumerate(ordered_nodes):
        top_vertices[index] = (
            x_values[col],
            y_values[row],
            base_thickness_mm + float(relief[row, col]) * relief_depth_mm,
        )
    bottom_vertices = top_vertices.copy()
    bottom_vertices[:, 2] = 0.0
    vertices = np.vstack((top_vertices, bottom_vertices))
    offset = len(ordered_nodes)

    top_faces: list[tuple[int, int, int]] = []
    bottom_faces: list[tuple[int, int, int]] = []
    boundary_edges: dict[tuple[int, int], tuple[int, int]] = {}

    for row, col in active_positions:
        a = node_index[(row, col)]
        b = node_index[(row, col + 1)]
        d = node_index[(row + 1, col + 1)]
        c = node_index[(row + 1, col)]
        top_faces.extend(((a, b, d), (a, d, c)))
        bottom_faces.extend(((offset + a, offset + d, offset + b), (offset + a, offset + c, offset + d)))

        for edge in ((a, c), (c, d), (d, b), (b, a)):
            key = tuple(sorted(edge))
            if key in boundary_edges:
                del boundary_edges[key]
            else:
                boundary_edges[key] = edge

    boundary_loops = trace_boundary_loops(boundary_edges)
    if len(boundary_loops) != 1:
        raise ValueError(
            "Silhouette holes are not supported in Phase 0; "
            f"found {len(boundary_loops)} boundary loops"
        )

    side_faces: list[tuple[int, int, int]] = []
    for top_a, top_b in boundary_edges.values():
        bottom_a = offset + top_a
        bottom_b = offset + top_b
        side_faces.extend(((top_a, bottom_a, bottom_b), (top_a, bottom_b, top_b)))

    mesh = _finalize_mesh(
        vertices,
        np.asarray(top_faces + bottom_faces + side_faces, dtype=np.int64),
    )

    # Width/height parameters describe the final silhouette, not the source
    # canvas including transparent margin. Fit the built silhouette exactly.
    extents = np.asarray(mesh.extents, dtype=np.float64)
    if extents[0] <= 0 or extents[1] <= 0:
        raise ValueError("Silhouette produced zero XY extent")
    scale_x = width_mm / extents[0]
    scale_y = height_mm / extents[1]
    mesh.apply_transform(
        np.array(
            [
                [scale_x, 0.0, 0.0, 0.0],
                [0.0, scale_y, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ],
            dtype=np.float64,
        )
    )
    translation_xy = -np.asarray(mesh.bounding_box.centroid[:2], dtype=np.float64)
    mesh.apply_translation([translation_xy[0], translation_xy[1], 0.0])

    contour_loops_mm: list[list[tuple[float, float]]] = []
    for loop in boundary_loops:
        points: list[tuple[float, float]] = []
        for index in loop:
            x, y = top_vertices[index, :2]
            points.append(
                (
                    float(x * scale_x + translation_xy[0]),
                    float(y * scale_y + translation_xy[1]),
                )
            )
        contour_loops_mm.append(points)

    alignment = {
        "grid_node_extent": [int(col_min), int(row_min), int(col_max + 1), int(row_max + 1)],
        "normalized_source_extent": [
            round(float(col_min / (cols - 1)), 12),
            round(float(row_min / (rows - 1)), 12),
            round(float((col_max + 1) / (cols - 1)), 12),
            round(float((row_max + 1) / (rows - 1)), 12),
        ],
        "boundary_quantization_mm": [
            round(float(width_mm / max(1, col_max + 1 - col_min)), 9),
            round(float(height_mm / max(1, row_max + 1 - row_min)), 9),
        ],
    }
    return mesh, alignment, contour_loops_mm


def count_open_edges(mesh: trimesh.Trimesh) -> int | None:
    try:
        unique_edges = mesh.edges_unique
        inverse = mesh.edges_unique_inverse
        counts = np.bincount(inverse, minlength=len(unique_edges))
        return int(np.count_nonzero(counts != 2))
    except Exception:
        return None


def validate_mesh(
    mesh: trimesh.Trimesh,
    recipe: BuildRecipe,
    resolved_height_mm: float,
    relief: np.ndarray,
    active_mask: np.ndarray | None,
    aspect_ratio_distortion_percent: float,
    boundary_quantization_mm: float,
) -> MeshValidation:
    warnings: list[str] = []
    advisories: list[str] = []
    limitations = [
        "Digital geometry validation only; P1S/A1 mini and UV physical validation is still required.",
        "Phase 0 does not include a magnet-pocket boolean or Bambu-specific slicer profile.",
        "Minimum printable feature analysis is not implemented in Phase 0.",
        "No generalized triangle-pair self-intersection scan is run; the result relies on the single-valued heightfield construction invariant.",
    ]
    if recipe.height_mm is not None and aspect_ratio_distortion_percent > 1.0:
        advisories.append(
            f"explicit_height_changes_source_aspect_ratio_by_{aspect_ratio_distortion_percent:.3f}_percent"
        )
    if recipe.shape_mode == "silhouette" and boundary_quantization_mm > 0.5:
        advisories.append("silhouette_boundary_quantization_exceeds_0_5_mm")

    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.faces)
    finite_geometry = bool(np.isfinite(vertices).all() and np.isfinite(faces).all())
    if not finite_geometry:
        warnings.append("non_finite_geometry")

    extents = np.asarray(mesh.extents, dtype=np.float64)
    bounds = np.asarray(mesh.bounds, dtype=np.float64)
    tolerance_xy = 0.01
    tolerance_z = max(0.01, recipe.relief_depth_mm * 0.005)
    expected_total_depth = recipe.base_thickness_mm + recipe.relief_depth_mm

    if abs(extents[0] - recipe.width_mm) > tolerance_xy:
        warnings.append("width_out_of_tolerance")
    if abs(extents[1] - resolved_height_mm) > tolerance_xy:
        warnings.append("height_out_of_tolerance")
    if abs(bounds[0, 2]) > 1e-6:
        warnings.append("back_plane_not_at_zero")
    if abs(extents[2] - expected_total_depth) > tolerance_z:
        warnings.append("total_depth_out_of_tolerance")

    z = vertices[:, 2]
    back_vertices = z[np.isclose(z, 0.0, atol=1e-9)]
    if back_vertices.size == 0:
        back_flatness = math.inf
        warnings.append("back_plane_missing")
    else:
        back_flatness = float(np.ptp(back_vertices))
        if back_flatness > 1e-8:
            warnings.append("back_plane_not_flat")

    active = active_mask > 0.05 if active_mask is not None else np.ones_like(relief, dtype=bool)
    active_values = relief[active]
    actual_relief_min = float(active_values.min()) * recipe.relief_depth_mm
    actual_relief_max = float(active_values.max()) * recipe.relief_depth_mm
    positive_z = z[z > 1e-9]
    minimum_solid_thickness = float(positive_z.min()) if positive_z.size else 0.0
    if minimum_solid_thickness + tolerance_z < recipe.base_thickness_mm:
        warnings.append("minimum_base_thickness_violated")
    if abs(actual_relief_max - recipe.relief_depth_mm) > tolerance_z:
        warnings.append("relief_peak_not_reached")

    areas = np.asarray(mesh.area_faces, dtype=np.float64)
    degenerate_count = int(np.count_nonzero(~np.isfinite(areas) | (areas <= 1e-12)))
    if degenerate_count:
        warnings.append("degenerate_faces_detected")

    open_edges = count_open_edges(mesh)
    if open_edges is None:
        warnings.append("open_edge_check_unavailable")
    elif open_edges != 0:
        warnings.append("open_edges_detected")

    watertight = bool(mesh.is_watertight)
    winding = bool(mesh.is_winding_consistent)
    is_volume = bool(mesh.is_volume)
    component_count = int(mesh.body_count)
    if not watertight:
        warnings.append("not_watertight")
    if not winding:
        warnings.append("inconsistent_winding")
    if not is_volume:
        warnings.append("not_a_closed_volume")
    if component_count != 1:
        warnings.append("multiple_connected_components")
    if float(abs(mesh.volume)) <= 0:
        warnings.append("non_positive_volume")

    digital_status = "validated" if not warnings else "needs_review"
    production_status = "physical_validation_required" if not warnings else "blocked"
    return MeshValidation(
        digital_status=digital_status,
        production_status=production_status,
        physical_validation_required=True,
        claim_scope="phase0_digital_geometry_only",
        watertight=watertight,
        winding_consistent=winding,
        is_volume=is_volume,
        finite_geometry=finite_geometry,
        connected_component_count=component_count,
        self_intersection_check="construction_invariant_heightfield",
        self_intersection_free_by_construction=bool(
            finite_geometry
            and component_count == 1
            and recipe.base_thickness_mm > 0
            and degenerate_count == 0
            and watertight
            and winding
        ),
        euler_number=int(mesh.euler_number),
        vertex_count=int(len(vertices)),
        face_count=int(len(faces)),
        degenerate_face_count=degenerate_count,
        extents_mm=[round(float(value), 6) for value in extents],
        bounds_mm=[[round(float(value), 6) for value in row] for row in bounds],
        volume_mm3=round(float(abs(mesh.volume)), 6),
        min_z_mm=round(float(bounds[0, 2]), 6),
        max_z_mm=round(float(bounds[1, 2]), 6),
        back_plane_flatness_mm=round(back_flatness, 9) if math.isfinite(back_flatness) else math.inf,
        minimum_solid_thickness_mm=round(minimum_solid_thickness, 6),
        actual_relief_min_mm=round(actual_relief_min, 6),
        actual_relief_max_mm=round(actual_relief_max, 6),
        open_edge_count=open_edges,
        warnings=sorted(set(warnings)),
        advisories=sorted(set(advisories)),
        limitations=limitations,
    )
