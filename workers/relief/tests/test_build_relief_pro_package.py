from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from build_relief_pro_package import build_relief_pro_package
from product_relief_builder import ProductRecipe


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_fixture(directory: Path, size: int = 128) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size * 0.40
    mask = (x - centre) ** 2 + (y - centre) ** 2 <= radius**2
    relief = np.clip(0.10 + 0.80 * (1.0 - np.sqrt((x-centre)**2 + (y-centre)**2) / radius), 0.0, 1.0)
    relief[~mask] = 0.0

    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = np.round(x / (size - 1) * 255).astype(np.uint8)
    rgba[..., 1] = np.round(y / (size - 1) * 255).astype(np.uint8)
    rgba[..., 2] = 160
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


def _build(paths: dict[str, Path], output: Path) -> dict:
    return build_relief_pro_package(
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
            relief_depth_mm=1.0,
            grid_long_edge=96,
        ),
        title="Fixture Relief Pro",
    )


def test_relief_pro_package_contains_aligned_geometry_artwork_and_receipt(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture")
    output = tmp_path / "package"
    manifest = _build(paths, output)

    assert manifest["digital_geometry_status"] == "ready"
    assert manifest["uv_artwork_status"] == "complete"
    assert manifest["physical_validation_status"] == "pending"
    assert manifest["production_status"] == "not_approved_pending_physical_validation"

    required = {
        "geometry/model.glb",
        "geometry/model.stl",
        "geometry/model.3mf",
        "geometry/manufacturing-report.json",
        "artwork/uv-artwork-srgb.png",
        "artwork/white-mask.png",
        "artwork/varnish-mask.png",
        "artwork/cut-contour.svg",
        "artwork/registration.json",
        "manifest.json",
        "package-receipt.json",
        "relief-pro-production-candidate.zip",
    }
    for relative in required:
        assert (output / relative).is_file(), relative

    registration = json.loads((output / "artwork/registration.json").read_text(encoding="utf-8"))
    assert registration["physical_canvas_mm"] == pytest.approx([70.0, 70.0], abs=0.8)
    assert registration["scale_policy"] == "preserve_aspect_no_independent_xy_scaling"

    receipt = json.loads((output / "package-receipt.json").read_text(encoding="utf-8"))
    package = output / receipt["package"]
    assert receipt["sha256"] == _sha256(package)
    assert receipt["physical_validation_status"] == "pending"

    with zipfile.ZipFile(package) as archive:
        names = set(archive.namelist())
    assert "manifest.json" in names
    assert "geometry/model.3mf" in names
    assert "artwork/registration.json" in names
    assert "package-receipt.json" not in names


def test_relief_pro_package_is_deterministic(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    first = tmp_path / "first"
    second = tmp_path / "second"
    _build(paths, first)
    _build(paths, second)
    assert _sha256(first / "relief-pro-production-candidate.zip") == _sha256(
        second / "relief-pro-production-candidate.zip"
    )


def test_relief_pro_package_refuses_to_delete_unowned_directory(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    unsafe = tmp_path / "existing"
    unsafe.mkdir()
    (unsafe / "keep.txt").write_text("do not delete", encoding="utf-8")

    with pytest.raises(FileExistsError, match="not an existing Renderhane package"):
        _build(paths, unsafe)
    assert (unsafe / "keep.txt").read_text(encoding="utf-8") == "do not delete"


def test_relief_pro_package_rejects_canvas_mismatch(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    Image.new("L", (95, 96), 255).save(paths["white"])

    with pytest.raises(ValueError, match="shared-canvas mismatch"):
        _build(paths, tmp_path / "out")
