from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import stat
import sys
import zipfile
from dataclasses import asdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image

from product_relief_builder import ProductRecipe, build_product_relief

ENGINE_VERSION = "relief-pro-package-v0.2.0"
MANIFEST_SCHEMA_VERSION = 2
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
MARKER_NAME = ".renderhane-relief-package-root"
MARKER_CONTENT = (
    "Renderhane Relief Pro package workspace. Safe to replace by this tool only.\n"
)
MAX_CANVAS_PIXELS = 36_000_000


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_link_like(path: Path) -> bool:
    try:
        metadata = path.lstat()
    except OSError:
        return False
    reparse_flag = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
    attributes = getattr(metadata, "st_file_attributes", 0)
    return path.is_symlink() or bool(reparse_flag and attributes & reparse_flag)


def _has_link_like_component(path: Path) -> bool:
    current = path
    while True:
        if _is_link_like(current):
            return True
        if current == current.parent:
            return False
        current = current.parent


def _safe_prepare_output(
    output_dir: Path,
    inputs: tuple[Path | None, ...],
) -> Path:
    candidate = output_dir.expanduser().absolute()
    if _has_link_like_component(candidate):
        raise ValueError(f"refusing linked output directory: {candidate}")
    resolved = candidate.resolve()
    protected = {Path("/").resolve(), Path.home().resolve(), Path.cwd().resolve()}
    if resolved in protected or len(resolved.parts) < 3:
        raise ValueError(f"refusing unsafe output directory: {resolved}")
    for source in inputs:
        if source is not None and source.expanduser().resolve().is_relative_to(resolved):
            raise ValueError("package input cannot be inside the output directory")

    if resolved.exists():
        marker = resolved / MARKER_NAME
        children = list(resolved.iterdir())
        marker_is_valid = False
        if children and not _is_link_like(marker) and marker.is_file():
            try:
                marker_is_valid = marker.read_text(encoding="utf-8") == MARKER_CONTENT
            except (OSError, UnicodeError):
                marker_is_valid = False
        if children and not marker_is_valid:
            raise FileExistsError(
                f"output directory is not an existing Renderhane package: {resolved}"
            )
        shutil.rmtree(resolved)

    resolved.mkdir(parents=True, exist_ok=False)
    (resolved / MARKER_NAME).write_text(
        MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    return resolved


def _image_size(path: Path) -> tuple[int, int]:
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        width, height = image.size
    if width <= 0 or height <= 0:
        raise ValueError(f"invalid image dimensions: {path}")
    if width * height > MAX_CANVAS_PIXELS:
        raise ValueError(
            f"image canvas exceeds {MAX_CANVAS_PIXELS} pixels: {path}"
        )
    return width, height


def _validate_shared_canvas(paths: dict[str, Path | None]) -> tuple[int, int]:
    sizes: dict[str, tuple[int, int]] = {}
    for label, path in paths.items():
        if path is not None:
            sizes[label] = _image_size(path)
    if "relief_map" not in sizes or "mask" not in sizes:
        raise ValueError("relief_map and mask are required")
    expected = sizes["relief_map"]
    mismatches = [
        f"{name}={size[0]}x{size[1]}"
        for name, size in sizes.items()
        if size != expected
    ]
    if mismatches:
        raise ValueError(
            "shared-canvas mismatch; expected "
            f"{expected[0]}x{expected[1]}: " + "; ".join(mismatches)
        )
    return expected


def _crop_image(source: Path, crop_box: tuple[int, int, int, int], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        cropped = image.crop(crop_box)
        cropped.save(destination)


def _load_boolean_mask(path: Path) -> np.ndarray:
    with Image.open(path) as image:
        return np.asarray(image.convert("L"), dtype=np.uint8) > 127


def _boundary_edges(cells: np.ndarray) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    rows, cols = cells.shape
    edges: list[tuple[tuple[int, int], tuple[int, int]]] = []
    for row, col in np.argwhere(cells):
        r, c = int(row), int(col)
        if r == 0 or not cells[r - 1, c]:
            edges.append(((c, r), (c + 1, r)))
        if c == cols - 1 or not cells[r, c + 1]:
            edges.append(((c + 1, r), (c + 1, r + 1)))
        if r == rows - 1 or not cells[r + 1, c]:
            edges.append(((c + 1, r + 1), (c, r + 1)))
        if c == 0 or not cells[r, c - 1]:
            edges.append(((c, r + 1), (c, r)))
    return edges


def _trace_largest_loop(
    edges: list[tuple[tuple[int, int], tuple[int, int]]]
) -> list[tuple[int, int]]:
    if not edges:
        raise ValueError("normalised silhouette contains no boundary")
    outgoing: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for start, end in edges:
        outgoing.setdefault(start, []).append(end)
    for values in outgoing.values():
        values.sort()

    unused = set(edges)
    loops: list[list[tuple[int, int]]] = []
    while unused:
        start_edge = min(unused)
        unused.remove(start_edge)
        start, current = start_edge
        loop = [start, current]
        while current != start:
            candidates = [end for end in outgoing.get(current, []) if (current, end) in unused]
            if not candidates:
                raise ValueError("silhouette boundary is open or branched")
            next_point = candidates[0]
            unused.remove((current, next_point))
            current = next_point
            loop.append(current)
            if len(loop) > len(edges) + 2:
                raise ValueError("silhouette boundary trace did not close")
        loops.append(loop)
    return max(loops, key=len)


def _point_line_distance(
    point: tuple[float, float],
    start: tuple[float, float],
    end: tuple[float, float],
) -> float:
    px, py = point
    sx, sy = start
    ex, ey = end
    dx, dy = ex - sx, ey - sy
    if dx == 0 and dy == 0:
        return math.hypot(px - sx, py - sy)
    parameter = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
    parameter = min(1.0, max(0.0, parameter))
    nearest = (sx + parameter * dx, sy + parameter * dy)
    return math.hypot(px - nearest[0], py - nearest[1])


def _rdp(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    start, end = points[0], points[-1]
    maximum = -1.0
    index = 0
    for current_index, point in enumerate(points[1:-1], start=1):
        distance = _point_line_distance(point, start, end)
        if distance > maximum:
            maximum = distance
            index = current_index
    if maximum > epsilon:
        left = _rdp(points[: index + 1], epsilon)
        right = _rdp(points[index:], epsilon)
        return left[:-1] + right
    return [start, end]


def _contour_svg(
    mask_path: Path,
    destination: Path,
    *,
    width_mm: float,
    height_mm: float,
    simplify_mm: float = 0.08,
) -> dict[str, Any]:
    cells = _load_boolean_mask(mask_path)
    loop = _trace_largest_loop(_boundary_edges(cells))
    rows, cols = cells.shape
    points_mm = [
        (point[0] * width_mm / cols, point[1] * height_mm / rows)
        for point in loop
    ]
    # RDP operates on an open sequence. Preserve closure explicitly.
    open_points = points_mm[:-1]
    simplified = _rdp(open_points + [open_points[0]], simplify_mm)
    if simplified[0] != simplified[-1]:
        simplified.append(simplified[0])

    commands = [f"M {simplified[0][0]:.6f} {simplified[0][1]:.6f}"]
    commands.extend(f"L {x:.6f} {y:.6f}" for x, y in simplified[1:-1])
    commands.append("Z")
    path_data = " ".join(commands)
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width_mm:.6f}mm" '
        f'height="{height_mm:.6f}mm" viewBox="0 0 {width_mm:.6f} {height_mm:.6f}">\n'
        "  <title>Renderhane Relief Pro cut contour</title>\n"
        "  <desc>Derived from the exact normalised geometry silhouette. Do not scale.</desc>\n"
        f'  <path id="CUT" d="{path_data}" fill="none" stroke="#000000" stroke-width="0.05"/>\n'
        "</svg>\n"
    )
    destination.write_text(svg, encoding="utf-8", newline="\n")
    return {
        "source_mask_px": [cols, rows],
        "points_before_simplify": len(points_mm),
        "points_after_simplify": len(simplified),
        "simplify_mm": simplify_mm,
    }


def _registration_contract(
    *,
    source_canvas_px: tuple[int, int],
    crop_box_px: tuple[int, int, int, int],
    physical_width_mm: float,
    physical_height_mm: float,
    contour: dict[str, Any],
) -> dict[str, Any]:
    crop_width = crop_box_px[2] - crop_box_px[0]
    crop_height = crop_box_px[3] - crop_box_px[1]
    return {
        "schema_version": 1,
        "coordinate_system": "front-view-top-left-origin",
        "source_canvas_px": list(source_canvas_px),
        "crop_box_px": list(crop_box_px),
        "artwork_canvas_px": [crop_width, crop_height],
        "physical_canvas_mm": [
            round(physical_width_mm, 6),
            round(physical_height_mm, 6),
        ],
        "pixel_pitch_mm": [
            round(physical_width_mm / crop_width, 10),
            round(physical_height_mm / crop_height, 10),
        ],
        "scale_policy": "preserve_aspect_no_independent_xy_scaling",
        "mirror_for_print": False,
        "contour": contour,
        "notice": (
            "Artwork and geometry share this front-view canvas. RIP colour conversion and "
            "printer-specific registration remain external calibration steps."
        ),
    }


def _write_zip(root: Path, destination: Path, members: Iterable[Path]) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(members, key=lambda item: item.relative_to(root).as_posix()):
            relative = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(relative, date_time=FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(
                info,
                path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def build_relief_pro_package(
    *,
    relief_map: Path,
    mask: Path,
    output_dir: Path,
    recipe: ProductRecipe,
    uv_artwork: Path | None = None,
    white_mask: Path | None = None,
    varnish_mask: Path | None = None,
    title: str = "Renderhane Relief Pro",
) -> dict[str, Any]:
    canvas = _validate_shared_canvas(
        {
            "relief_map": relief_map,
            "mask": mask,
            "uv_artwork": uv_artwork,
            "white_mask": white_mask,
            "varnish_mask": varnish_mask,
        }
    )
    root = _safe_prepare_output(
        output_dir,
        (relief_map, mask, uv_artwork, white_mask, varnish_mask),
    )
    geometry_dir = root / "geometry"
    artwork_dir = root / "artwork"
    reports_dir = root / "reports"
    source_dir = root / "source"
    for directory in (geometry_dir, artwork_dir, reports_dir, source_dir):
        directory.mkdir(parents=True, exist_ok=True)

    shutil.copyfile(relief_map, source_dir / "relief-map-16.png")
    shutil.copyfile(mask, source_dir / "silhouette-mask.png")
    for source, name in (
        (uv_artwork, "uv-artwork-original.bin"),
        (white_mask, "white-mask-original.bin"),
        (varnish_mask, "varnish-mask-original.bin"),
    ):
        if source is not None:
            shutil.copyfile(source, source_dir / name)

    build_report = build_product_relief(relief_map, mask, geometry_dir, recipe)
    validation = build_report.validation
    crop_box = tuple(int(value) for value in validation["crop_box_px"])
    physical_width = float(validation["extents_mm"][0])
    physical_height = float(validation["extents_mm"][1])

    copied_artwork: dict[str, str] = {}
    for label, source, name in (
        ("uv_artwork", uv_artwork, "uv-artwork-srgb.png"),
        ("white_mask", white_mask, "white-mask.png"),
        ("varnish_mask", varnish_mask, "varnish-mask.png"),
    ):
        if source is not None:
            destination = artwork_dir / name
            _crop_image(source, crop_box, destination)
            copied_artwork[label] = destination.relative_to(root).as_posix()

    contour_path = artwork_dir / "cut-contour.svg"
    contour_info = _contour_svg(
        geometry_dir / "silhouette-mask-normalized.png",
        contour_path,
        width_mm=physical_width,
        height_mm=physical_height,
    )

    registration = _registration_contract(
        source_canvas_px=canvas,
        crop_box_px=crop_box,
        physical_width_mm=physical_width,
        physical_height_mm=physical_height,
        contour=contour_info,
    )
    registration_path = artwork_dir / "registration.json"
    registration_path.write_text(
        json.dumps(registration, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    complete_uv_set = all(value is not None for value in (uv_artwork, white_mask, varnish_mask))
    product_validation = {
        "digital_status": str(validation.get("digital_status") or "needs_review"),
        "digital_geometry_gate": str(validation.get("digital_geometry_gate") or "fail"),
        "failures": [str(value) for value in validation.get("failures") or []],
        "warnings": [str(value) for value in validation.get("warnings") or []],
    }
    if (
        product_validation["digital_geometry_gate"] != "pass"
        or product_validation["failures"]
    ):
        digital_geometry_status = "failed"
    elif (
        product_validation["digital_status"] != "validated"
        or product_validation["warnings"]
    ):
        digital_geometry_status = "needs_review"
    else:
        digital_geometry_status = "ready"
    manifest = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "engine_version": ENGINE_VERSION,
        "title": title,
        "product_line": "relief-pro",
        "recipe": asdict(recipe),
        "recipe_sha256": build_report.recipe_sha256,
        "source_hashes": {
            "relief_map_sha256": _sha256(relief_map),
            "mask_sha256": _sha256(mask),
            "uv_artwork_sha256": _sha256(uv_artwork) if uv_artwork else None,
            "white_mask_sha256": _sha256(white_mask) if white_mask else None,
            "varnish_mask_sha256": _sha256(varnish_mask) if varnish_mask else None,
        },
        "product_validation": product_validation,
        "digital_geometry_status": digital_geometry_status,
        "uv_artwork_status": "complete" if complete_uv_set else "incomplete",
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
        "registration": registration,
        "limitations": [
            "Generic 3MF contains geometry in millimetres but no Bambu printer/filament profile.",
            "Digital manifold checks do not prove print quality or dimensional tolerance.",
            "UV colour, white and varnish registration must be measured on the actual RIP/printer/material.",
            "This package is a production candidate until physical benchmark rows are accepted.",
        ],
    }

    members = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.name != MARKER_NAME
    ]
    artifacts = {
        path.relative_to(root).as_posix(): {
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted(members)
    }
    manifest["artifacts"] = artifacts
    manifest_path = root / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    package_path = root / "relief-pro-production-candidate.zip"
    _write_zip(root, package_path, [*members, manifest_path])
    receipt = {
        "schema_version": 1,
        "package": package_path.name,
        "bytes": package_path.stat().st_size,
        "sha256": _sha256(package_path),
        "manifest_sha256": _sha256(manifest_path),
        "digital_geometry_status": digital_geometry_status,
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
    }
    receipt_path = root / "package-receipt.json"
    receipt_path.write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return {**manifest, "package_receipt": receipt}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a Relief Pro geometry + UV production candidate package")
    parser.add_argument("--relief-map", type=Path, required=True)
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--uv-artwork", type=Path)
    parser.add_argument("--white-mask", type=Path)
    parser.add_argument("--varnish-mask", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Renderhane Relief Pro")
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
        help="absolute requires the canonical 16-bit PNG master; robust is legacy/advisory",
    )
    parser.add_argument("--invert-depth", action="store_true")
    parser.add_argument("--pocket-diameter-mm", type=float)
    parser.add_argument("--pocket-depth-mm", type=float)
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
    )
    try:
        manifest = build_relief_pro_package(
            relief_map=args.relief_map,
            mask=args.mask,
            uv_artwork=args.uv_artwork,
            white_mask=args.white_mask,
            varnish_mask=args.varnish_mask,
            output_dir=args.output,
            recipe=recipe,
            title=args.title,
        )
    except Exception as exc:
        print(f"Relief Pro package build failed: {exc}", file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "digital_geometry_status": manifest["digital_geometry_status"],
                "product_validation": manifest["product_validation"],
                "uv_artwork_status": manifest["uv_artwork_status"],
                "physical_validation_status": manifest["physical_validation_status"],
                "production_status": manifest["production_status"],
                "package_receipt": manifest["package_receipt"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0 if manifest["digital_geometry_status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
