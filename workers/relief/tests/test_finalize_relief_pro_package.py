from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

from build_relief_pro_package import build_relief_pro_package
from finalize_relief_pro_package import finalize_package
from product_relief_builder import ProductRecipe


def _fixture(directory: Path, size: int = 128) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size * 0.40
    mask = (x - centre) ** 2 + (y - centre) ** 2 <= radius**2
    relief = np.clip(
        1.0 - np.sqrt((x - centre) ** 2 + (y - centre) ** 2) / radius,
        0.0,
        1.0,
    )
    relief[~mask] = 0.0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = 180
    rgba[..., 1] = 120
    rgba[..., 2] = 70
    rgba[..., 3] = (mask * 255).astype(np.uint8)

    paths = {
        "relief": directory / "relief.png",
        "mask": directory / "mask.png",
        "uv": directory / "uv.png",
        "white": directory / "white.png",
        "varnish": directory / "varnish.png",
    }
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(paths["relief"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["mask"])
    Image.fromarray(rgba, mode="RGBA").save(paths["uv"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["white"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["varnish"])
    return paths


def _build(paths: dict[str, Path], output: Path, grid: int = 96) -> None:
    build_relief_pro_package(
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        output_dir=output,
        recipe=ProductRecipe(
            width_mm=70.0,
            height_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.2,
            grid_long_edge=grid,
        ),
    )


def test_finalizer_includes_consistency_report_inside_sealed_zip(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture")
    package_dir = tmp_path / "package"
    _build(paths, package_dir, grid=96)

    result = finalize_package(package_dir)
    receipt = result["receipt"]

    assert receipt["digital_geometry_status"] == "ready"
    assert receipt["digital_artifact_consistency"] == "pass"
    assert receipt["physical_validation_status"] == "pending"
    assert receipt["production_status"] == "not_approved_pending_physical_validation"

    report_path = package_dir / "reports/artifact-consistency-report.json"
    assert report_path.is_file()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["decision"] == "pass"

    with zipfile.ZipFile(package_dir / receipt["package"]) as archive:
        names = set(archive.namelist())
    assert "reports/artifact-consistency-report.json" in names
    assert "manifest.json" in names
    assert "package-receipt.json" not in names


def test_finalizer_preserves_geometry_warnings_in_status(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture", size=96)
    package_dir = tmp_path / "package"
    _build(paths, package_dir, grid=64)

    result = finalize_package(package_dir)

    assert result["receipt"]["digital_geometry_status"] == "ready_with_warnings"
    assert "low_grid_resolution" in result["manifest"]["digital_warnings"]
    assert result["receipt"]["physical_validation_status"] == "pending"
