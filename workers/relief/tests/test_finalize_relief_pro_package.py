from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import finalize_relief_pro_package as finalizer_module
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
    _build(paths, package_dir, grid=192)

    result = finalize_package(package_dir)
    receipt = result["receipt"]

    assert receipt["digital_geometry_status"] == "ready"
    assert receipt["digital_artifact_consistency"] == "pass"
    assert receipt["digital_contour_registration"] == "pass"
    assert receipt["digital_final_glb_registration"] == "pass"
    assert receipt["digital_final_glb_silhouette_registration"] == "pass"
    assert receipt["digital_final_glb_depth_registration"] == "pass"
    assert receipt["physical_validation_status"] == "pending"
    assert receipt["production_status"] == "not_approved_pending_physical_validation"

    report_path = package_dir / "reports/artifact-consistency-report.json"
    assert report_path.is_file()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["decision"] == "pass"
    assert [artifact["path"] for artifact in report["artifacts"]] == [
        "geometry/model.stl",
        "geometry/model.glb",
        "geometry/model.3mf",
    ]
    registration_report_path = (
        package_dir / "reports/final-glb-silhouette-registration-report.json"
    )
    assert registration_report_path.is_file()
    registration_report = json.loads(
        registration_report_path.read_text(encoding="utf-8")
    )
    assert registration_report["decision"] == "pass"
    assert registration_report["evidence_source"] == (
        "fresh_final_glb_front_orthographic_silhouette"
    )
    assert registration_report["evidence_independence"] == "independent_cpu_mesh_rasterization"
    assert registration_report["guard_banded_maximum_edge_distance_mm"] <= 0.5
    overlay_path = package_dir / "reports/final-glb-silhouette-overlay.png"
    assert overlay_path.is_file()
    depth_report = json.loads(
        (package_dir / "reports/final-glb-depth-registration-report.json").read_text(
            encoding="utf-8"
        )
    )
    assert depth_report["decision"] == "pass"
    assert depth_report["guard_banded_maximum_error_mm"] <= 0.02
    assert (package_dir / "reports/final-glb-depth-difference.png").is_file()

    with zipfile.ZipFile(package_dir / receipt["package"]) as archive:
        names = set(archive.namelist())
    assert "reports/artifact-consistency-report.json" in names
    assert "reports/final-glb-silhouette-overlay.png" in names
    assert "reports/final-glb-silhouette-registration-report.json" in names
    assert "reports/final-glb-depth-registration-report.json" in names
    assert "reports/final-glb-depth-difference.png" in names
    assert "manifest.json" in names
    assert "package-receipt.json" not in names


def test_finalizer_preserves_geometry_warnings_in_status(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture", size=96)
    package_dir = tmp_path / "package"
    _build(paths, package_dir, grid=64)

    result = finalize_package(package_dir)

    assert result["receipt"]["digital_geometry_status"] == "failed"
    assert any(value.startswith("registration:") for value in result["manifest"]["digital_failures"])
    assert result["receipt"]["digital_final_glb_registration"] == "fail"
    assert "low_grid_resolution" in result["manifest"]["digital_warnings"]
    assert result["receipt"]["physical_validation_status"] == "pending"


def test_finalized_package_is_deterministic_across_roots(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture", size=96)
    first = tmp_path / "first"
    second = tmp_path / "second"
    _build(paths, first, grid=96)
    _build(paths, second, grid=96)

    first_result = finalize_package(first)
    second_result = finalize_package(second)

    assert first_result["receipt"]["sha256"] == second_result["receipt"]["sha256"]
    assert first_result["receipt"]["manifest_sha256"] == second_result["receipt"]["manifest_sha256"]


def test_finalizer_accepts_clean_non_round_physical_dimensions(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture", size=96)
    package_dir = tmp_path / "package"
    build_relief_pro_package(
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        output_dir=package_dir,
        recipe=ProductRecipe(
            width_mm=70.1234567,
            height_mm=53.7654321,
            grid_long_edge=192,
        ),
    )

    result = finalize_package(package_dir)

    assert result["receipt"]["digital_package_status"] == "ready"
    assert result["manifest"]["digital_failures"] == []


def test_incomplete_uv_set_never_finalizes_as_ready(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture", size=96)
    package_dir = tmp_path / "package"
    build_relief_pro_package(
        relief_map=paths["relief"],
        mask=paths["mask"],
        output_dir=package_dir,
        recipe=ProductRecipe(width_mm=70.0, height_mm=70.0, grid_long_edge=192),
    )

    result = finalize_package(package_dir)

    assert result["receipt"]["digital_package_status"] == "needs_review"
    assert "artwork_file_set_incomplete" in result["manifest"]["digital_warnings"]
    assert result["receipt"]["production_status"] == "not_approved_pending_physical_validation"


def test_finalizer_cli_returns_nonzero_for_needs_review(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        finalizer_module,
        "finalize_package",
        lambda *args, **kwargs: {
            "receipt": {"digital_geometry_status": "needs_review"}
        },
    )

    assert finalizer_module.main(["--package-dir", str(tmp_path)]) == 1
