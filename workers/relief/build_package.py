from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import zipfile
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from export_3mf import export_3mf
from relief_builder import BuildRecipe, build

FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
ENGINE_VERSION = "manufacturing-package-v0.1.0"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def _validate_shared_canvas(
    relief_map: Path,
    mask: Path | None,
    uv_artwork: Path | None,
    white_mask: Path | None,
    varnish_mask: Path | None,
) -> dict[str, Any]:
    expected = _read_size(relief_map)
    checked: dict[str, list[int]] = {"relief_map": list(expected)}
    mismatches: list[str] = []

    for label, path in (
        ("mask", mask),
        ("uv_artwork", uv_artwork),
        ("white_mask", white_mask),
        ("varnish_mask", varnish_mask),
    ):
        if path is None:
            continue
        if not path.is_file():
            raise FileNotFoundError(f"{label} not found: {path}")
        size = _read_size(path)
        checked[label] = list(size)
        if size != expected:
            mismatches.append(f"{label}={size[0]}x{size[1]} expected={expected[0]}x{expected[1]}")

    if mismatches:
        raise ValueError("Shared-canvas validation failed: " + "; ".join(mismatches))

    return {
        "pass": True,
        "width_px": expected[0],
        "height_px": expected[1],
        "checked": checked,
    }


def _report_to_dict(report: Any) -> dict[str, Any]:
    if is_dataclass(report):
        return asdict(report)
    if hasattr(report, "to_dict"):
        value = report.to_dict()
        if isinstance(value, dict):
            return value
    if hasattr(report, "__dict__"):
        return dict(report.__dict__)
    return {}


def _copy_optional(source: Path | None, destination: Path) -> Path | None:
    if source is None:
        return None
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    return destination


def _write_deterministic_zip(root: Path, output: Path, members: list[Path]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
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


def build_package(
    *,
    relief_map: Path,
    output_dir: Path,
    recipe: BuildRecipe,
    mask: Path | None = None,
    uv_artwork: Path | None = None,
    white_mask: Path | None = None,
    varnish_mask: Path | None = None,
    title: str = "Renderhane Relief",
) -> dict[str, Any]:
    if not relief_map.is_file():
        raise FileNotFoundError(relief_map)

    shared_canvas = _validate_shared_canvas(
        relief_map,
        mask,
        uv_artwork,
        white_mask,
        varnish_mask,
    )

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    geometry_dir = output_dir / "geometry"
    artwork_dir = output_dir / "artwork"
    reports_dir = output_dir / "reports"
    source_dir = output_dir / "source"
    for directory in (geometry_dir, artwork_dir, reports_dir, source_dir):
        directory.mkdir(parents=True, exist_ok=True)

    source_relief = source_dir / "relief-map-16.png"
    shutil.copyfile(relief_map, source_relief)
    source_mask = _copy_optional(mask, source_dir / "silhouette-mask.png")

    build_report = build(source_relief, geometry_dir, recipe, source_mask)
    persisted_build_report = geometry_dir / "manufacturing-report.json"
    if persisted_build_report.is_file():
        shutil.copyfile(persisted_build_report, reports_dir / "geometry-report.json")
        build_report_data = json.loads(persisted_build_report.read_text(encoding="utf-8"))
    else:
        build_report_data = _report_to_dict(build_report)
        (reports_dir / "geometry-report.json").write_text(
            json.dumps(build_report_data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

    stl_path = geometry_dir / "model.stl"
    glb_path = geometry_dir / "model.glb"
    if not stl_path.is_file() or not glb_path.is_file():
        raise RuntimeError("Relief builder did not produce model.stl and model.glb")

    three_mf_path = geometry_dir / "model.3mf"
    three_mf_report = export_3mf(stl_path, three_mf_path, title=title)
    (reports_dir / "3mf-report.json").write_text(
        json.dumps(three_mf_report.to_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    copied_artwork: list[Path] = []
    for source, name in (
        (uv_artwork, "uv-artwork-srgb.png"),
        (white_mask, "white-mask.png"),
        (varnish_mask, "varnish-mask.png"),
    ):
        copied = _copy_optional(source, artwork_dir / name)
        if copied:
            copied_artwork.append(copied)

    validation = build_report_data.get("validation", {}) if isinstance(build_report_data, dict) else {}
    digital_geometry_ready = (
        validation.get("production_status") == "ready"
        and validation.get("watertight") is True
        and validation.get("is_volume") is True
        and validation.get("open_edge_count") in (0, None)
        and three_mf_report.watertight
        and three_mf_report.is_volume
    )

    artifact_paths = [
        source_relief,
        geometry_dir / "model.stl",
        geometry_dir / "model.glb",
        geometry_dir / "model.3mf",
        geometry_dir / "relief-map-normalized-16.png",
        reports_dir / "geometry-report.json",
        reports_dir / "3mf-report.json",
        *copied_artwork,
    ]
    if source_mask:
        artifact_paths.append(source_mask)
    artifact_paths = [path for path in artifact_paths if path.is_file()]

    artifacts = {
        path.relative_to(output_dir).as_posix(): {
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted(artifact_paths)
    }

    recipe_data = _report_to_dict(recipe)
    if not recipe_data and hasattr(recipe, "__dict__"):
        recipe_data = dict(recipe.__dict__)
    recipe_hash = hashlib.sha256(
        json.dumps(recipe_data, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    manifest = {
        "schema_version": 1,
        "engine_version": ENGINE_VERSION,
        "title": title,
        "recipe": recipe_data,
        "recipe_sha256": recipe_hash,
        "shared_canvas": shared_canvas,
        "digital_geometry_status": "ready" if digital_geometry_ready else "needs_review",
        "uv_artwork_status": (
            "complete"
            if uv_artwork is not None and white_mask is not None and varnish_mask is not None
            else "incomplete"
        ),
        "physical_validation_status": "pending",
        "production_status": "pending_physical_validation",
        "artifacts": artifacts,
        "limitations": [
            "Digital geometry checks do not replace P1S/A1 mini test prints.",
            "UV registration requires a printer/RIP/material calibration coupon.",
            "Generic 3MF does not contain a Bambu Studio printer or filament profile.",
        ],
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    package_members = [*artifact_paths, manifest_path]
    zip_path = output_dir / "production-package.zip"
    _write_deterministic_zip(output_dir, zip_path, package_members)

    manifest["package"] = {
        "path": zip_path.name,
        "bytes": zip_path.stat().st_size,
        "sha256": _sha256(zip_path),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a deterministic Renderhane Relief Pro artifact package")
    parser.add_argument("--relief-map", type=Path, required=True)
    parser.add_argument("--mask", type=Path)
    parser.add_argument("--uv-artwork", type=Path)
    parser.add_argument("--white-mask", type=Path)
    parser.add_argument("--varnish-mask", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Renderhane Relief")
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float)
    parser.add_argument("--base-mm", type=float, default=3.0)
    parser.add_argument("--relief-mm", type=float, default=1.2)
    parser.add_argument("--grid-long-edge", type=int, default=192)
    args = parser.parse_args(argv)

    recipe_kwargs: dict[str, Any] = {
        "width_mm": args.width_mm,
        "base_thickness_mm": args.base_mm,
        "relief_depth_mm": args.relief_mm,
        "grid_long_edge": args.grid_long_edge,
    }
    if args.height_mm is not None:
        recipe_kwargs["height_mm"] = args.height_mm

    try:
        manifest = build_package(
            relief_map=args.relief_map,
            mask=args.mask,
            uv_artwork=args.uv_artwork,
            white_mask=args.white_mask,
            varnish_mask=args.varnish_mask,
            output_dir=args.output,
            recipe=BuildRecipe(**recipe_kwargs),
            title=args.title,
        )
    except Exception as exc:
        print(f"package build failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps({
        "digital_geometry_status": manifest["digital_geometry_status"],
        "uv_artwork_status": manifest["uv_artwork_status"],
        "physical_validation_status": manifest["physical_validation_status"],
        "package": manifest["package"],
    }, ensure_ascii=False, sort_keys=True))
    return 0 if manifest["digital_geometry_status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
