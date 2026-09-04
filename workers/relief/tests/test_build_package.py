from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from build_package import build_package
from generate_synthetic_benchmark import generate
from relief_builder import BuildRecipe


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_rgba(path: Path, size: tuple[int, int]) -> None:
    width, height = size
    yy, xx = np.mgrid[0:height, 0:width]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = np.round(xx / max(width - 1, 1) * 255).astype(np.uint8)
    rgba[..., 1] = np.round(yy / max(height - 1, 1) * 255).astype(np.uint8)
    rgba[..., 2] = 128
    rgba[..., 3] = 255
    Image.fromarray(rgba, mode="RGBA").save(path)


def test_build_package_generates_geometry_uv_and_pending_physical_status(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    uv = fixture / "uv.png"
    _write_rgba(uv, (96, 72))
    white = fixture / "white.png"
    varnish = fixture / "varnish.png"
    Image.open(fixture / "silhouette-mask.png").save(white)
    Image.open(fixture / "silhouette-mask.png").save(varnish)

    first = tmp_path / "first"
    second = tmp_path / "second"
    recipe = BuildRecipe(
        width_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.2,
        grid_long_edge=64,
    )

    manifest_a = build_package(
        relief_map=fixture / "relief-map-16.png",
        mask=fixture / "silhouette-mask.png",
        uv_artwork=uv,
        white_mask=white,
        varnish_mask=varnish,
        output_dir=first,
        recipe=recipe,
        title="Fixture Relief",
    )
    manifest_b = build_package(
        relief_map=fixture / "relief-map-16.png",
        mask=fixture / "silhouette-mask.png",
        uv_artwork=uv,
        white_mask=white,
        varnish_mask=varnish,
        output_dir=second,
        recipe=recipe,
        title="Fixture Relief",
    )

    assert manifest_a["digital_geometry_status"] == "ready"
    assert manifest_a["uv_artwork_status"] == "complete"
    assert manifest_a["physical_validation_status"] == "pending"
    assert manifest_a["production_status"] == "pending_physical_validation"

    for relative in (
        "geometry/model.glb",
        "geometry/model.stl",
        "geometry/model.3mf",
        "artwork/uv-artwork-srgb.png",
        "artwork/white-mask.png",
        "artwork/varnish-mask.png",
        "reports/geometry-report.json",
        "reports/3mf-report.json",
        "manifest.json",
        "production-package.zip",
    ):
        assert (first / relative).is_file(), relative

    assert _sha256(first / "production-package.zip") == _sha256(second / "production-package.zip")
    persisted = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
    assert persisted["package"]["sha256"] == _sha256(first / "production-package.zip")


def test_build_package_rejects_misaligned_uv_canvas(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    wrong = fixture / "wrong.png"
    _write_rgba(wrong, (95, 72))

    with pytest.raises(ValueError, match="Shared-canvas validation failed"):
        build_package(
            relief_map=fixture / "relief-map-16.png",
            mask=fixture / "silhouette-mask.png",
            uv_artwork=wrong,
            output_dir=tmp_path / "out",
            recipe=BuildRecipe(width_mm=70.0, relief_depth_mm=1.0, grid_long_edge=64),
        )
