from __future__ import annotations

import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from build_relief_pro_package import MARKER_CONTENT, MARKER_NAME, build_relief_pro_package
from product_relief_builder import ProductRecipe


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_directory_link(link: Path, target: Path) -> None:
    if os.name == "nt":
        created = subprocess.run(
            ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(target)],
            check=False,
            capture_output=True,
            text=True,
        )
        assert created.returncode == 0, created.stderr or created.stdout
    else:
        link.symlink_to(target, target_is_directory=True)


def _remove_directory_link(link: Path) -> None:
    if os.name == "nt":
        link.rmdir()
    else:
        link.unlink()


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


def _build(
    paths: dict[str, Path],
    output: Path,
    *,
    recipe: ProductRecipe | None = None,
) -> dict:
    return build_relief_pro_package(
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        output_dir=output,
        recipe=recipe
        or ProductRecipe(
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

    assert manifest["schema_version"] == 2
    assert manifest["engine_version"] == "relief-pro-package-v0.2.0"
    assert manifest["digital_geometry_status"] == "ready"
    assert manifest["product_validation"]["digital_status"] == "validated"
    assert manifest["product_validation"]["warnings"] == []
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
        "source/uv-artwork-original.bin",
        "source/white-mask-original.bin",
        "source/varnish-mask-original.bin",
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
    assert receipt["production_status"] == "not_approved_pending_physical_validation"

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
    for relative in (
        MARKER_NAME,
        "geometry/manufacturing-report.json",
        "artwork/cut-contour.svg",
        "artwork/registration.json",
        "manifest.json",
        "package-receipt.json",
    ):
        assert b"\r\n" not in (first / relative).read_bytes()


def test_relief_pro_package_refuses_to_delete_unowned_directory(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    unsafe = tmp_path / "existing"
    unsafe.mkdir()
    (unsafe / "keep.txt").write_text("do not delete", encoding="utf-8")

    with pytest.raises(FileExistsError, match="not an existing Renderhane package"):
        _build(paths, unsafe)
    assert (unsafe / "keep.txt").read_text(encoding="utf-8") == "do not delete"


def test_relief_pro_package_rejects_linked_ownership_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    unsafe = tmp_path / "existing"
    unsafe.mkdir()
    keep = unsafe / "keep.txt"
    keep.write_text("do not delete", encoding="utf-8")
    marker = unsafe / MARKER_NAME
    marker.write_text(MARKER_CONTENT, encoding="utf-8", newline="\n")
    original_is_symlink = Path.is_symlink
    monkeypatch.setattr(
        Path,
        "is_symlink",
        lambda path: path == marker or original_is_symlink(path),
    )

    with pytest.raises(FileExistsError, match="not an existing Renderhane package"):
        _build(paths, unsafe)

    assert keep.read_text(encoding="utf-8") == "do not delete"


def test_relief_pro_package_rejects_input_inside_reused_output(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    output = tmp_path / "package"
    _build(paths, output)
    source = output / "source/relief-map-16.png"
    original = source.read_bytes()

    with pytest.raises(ValueError, match="input cannot be inside"):
        build_relief_pro_package(
            relief_map=source,
            mask=output / "source/silhouette-mask.png",
            output_dir=output,
            recipe=ProductRecipe(width_mm=70.0, grid_long_edge=96),
        )

    assert source.read_bytes() == original


def test_relief_pro_package_rejects_junction_output_without_touching_target(
    tmp_path: Path,
) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    target = tmp_path / "target"
    target.mkdir()
    sentinel = target / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (target / MARKER_NAME).write_text(
        MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_output = tmp_path / "linked-output"
    _create_directory_link(linked_output, target)

    try:
        with pytest.raises(ValueError, match="linked output directory"):
            _build(paths, linked_output)
    finally:
        _remove_directory_link(linked_output)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


def test_relief_pro_package_rejects_ancestor_junction_without_touching_target(
    tmp_path: Path,
) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    target_parent = tmp_path / "target-parent"
    owned_output = target_parent / "package"
    owned_output.mkdir(parents=True)
    sentinel = owned_output / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (owned_output / MARKER_NAME).write_text(
        MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_parent = tmp_path / "linked-parent"
    _create_directory_link(linked_parent, target_parent)

    try:
        with pytest.raises(ValueError, match="linked output directory"):
            _build(paths, linked_parent / "package")
    finally:
        _remove_directory_link(linked_parent)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


def test_relief_pro_package_rejects_canvas_mismatch(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    Image.new("L", (95, 96), 255).save(paths["white"])

    with pytest.raises(ValueError, match="shared-canvas mismatch"):
        _build(paths, tmp_path / "out")


def test_pocket_package_requires_review_before_finalization(tmp_path: Path) -> None:
    paths = _write_fixture(tmp_path / "fixture", size=96)
    output = tmp_path / "package"
    manifest = _build(
        paths,
        output,
        recipe=ProductRecipe(
            width_mm=70.0,
            height_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.0,
            grid_long_edge=96,
            pocket_diameter_mm=12.0,
            pocket_depth_mm=2.0,
        ),
    )

    pocket_warning = "magnet_pocket_requires_bridge_retention_and_orientation_physical_test"
    assert manifest["digital_geometry_status"] == "needs_review"
    assert manifest["product_validation"]["digital_status"] == "needs_review"
    assert pocket_warning in manifest["product_validation"]["warnings"]
    assert manifest["physical_validation_status"] == "pending"
    assert manifest["production_status"] == "not_approved_pending_physical_validation"

    stored_manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
    assert stored_manifest["product_validation"] == manifest["product_validation"]
    receipt = json.loads((output / "package-receipt.json").read_text(encoding="utf-8"))
    assert receipt["digital_geometry_status"] == "needs_review"
    assert receipt["physical_validation_status"] == "pending"
    assert receipt["production_status"] == "not_approved_pending_physical_validation"
