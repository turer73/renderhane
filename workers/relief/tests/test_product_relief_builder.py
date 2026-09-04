from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import trimesh
from PIL import Image

from product_relief_builder import ProductRecipe, build_product_relief


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_round_fixture(directory: Path, size: int = 128) -> tuple[Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:size, 0:size]
    cx = cy = (size - 1) / 2.0
    radius = size * 0.43
    distance = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    mask = distance <= radius

    broad = np.clip(1.0 - distance / radius, 0.0, 1.0)
    detail = 0.10 * np.sin(x / 5.0) * np.cos(y / 7.0)
    relief = np.clip(0.15 + 0.75 * broad + detail, 0.0, 1.0)
    relief[~mask] = 0.0

    relief_path = directory / "relief-map-16.png"
    mask_path = directory / "mask.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(mask_path)
    return relief_path, mask_path


def test_silhouette_builder_creates_single_watertight_trimmed_product(tmp_path: Path) -> None:
    relief, mask = _write_round_fixture(tmp_path / "fixture")
    output = tmp_path / "out"
    recipe = ProductRecipe(
        width_mm=70.0,
        height_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.2,
        grid_long_edge=128,
    )

    report = build_product_relief(relief, mask, output, recipe)
    validation = report.validation

    assert validation["digital_geometry_gate"] == "pass"
    assert validation["watertight"] is True
    assert validation["winding_consistent"] is True
    assert validation["is_volume"] is True
    assert validation["open_edge_count"] == 0
    assert validation["component_count"] == 1
    assert validation["mask_trimmed"] is True
    assert validation["physical_validation"] == "pending"
    assert validation["extents_mm"][0] == pytest.approx(70.0, abs=0.7)
    assert validation["extents_mm"][1] == pytest.approx(70.0, abs=0.7)
    assert validation["extents_mm"][2] <= 4.2 + 0.02

    mesh = trimesh.load_mesh(output / "model.stl")
    assert mesh.is_watertight
    # A trimmed circular badge must use materially less volume than a full
    # 70x70 rectangular plate of the maximum height.
    assert mesh.volume < 70.0 * 70.0 * 4.2 * 0.90

    for name in ("model.stl", "model.glb", "model.3mf", "manufacturing-report.json"):
        assert (output / name).is_file()


def test_product_builder_is_deterministic_without_boolean_features(tmp_path: Path) -> None:
    relief, mask = _write_round_fixture(tmp_path / "fixture", size=96)
    recipe = ProductRecipe(
        width_mm=70.0,
        height_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.0,
        grid_long_edge=96,
    )
    first = tmp_path / "a"
    second = tmp_path / "b"
    build_product_relief(relief, mask, first, recipe)
    build_product_relief(relief, mask, second, recipe)

    for name in ("model.stl", "model.glb", "model.3mf", "relief-map-normalized-16.png"):
        assert _sha256(first / name) == _sha256(second / name), name


def test_magnet_pocket_preserves_watertight_single_body(tmp_path: Path) -> None:
    pytest.importorskip("manifold3d")
    relief, mask = _write_round_fixture(tmp_path / "fixture", size=96)

    plain_dir = tmp_path / "plain"
    pocket_dir = tmp_path / "pocket"
    base_recipe = ProductRecipe(
        width_mm=70.0,
        height_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.0,
        grid_long_edge=96,
    )
    pocket_recipe = ProductRecipe(
        width_mm=70.0,
        height_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.0,
        grid_long_edge=96,
        pocket_diameter_mm=12.0,
        pocket_depth_mm=2.0,
        minimum_remaining_base_mm=0.8,
    )

    plain = build_product_relief(relief, mask, plain_dir, base_recipe)
    pocket = build_product_relief(relief, mask, pocket_dir, pocket_recipe)

    assert pocket.validation["digital_geometry_gate"] == "pass"
    assert pocket.validation["watertight"] is True
    assert pocket.validation["component_count"] == 1
    removed_volume = plain.validation["volume_mm3"] - pocket.validation["volume_mm3"]
    expected = np.pi * 6.0**2 * 2.0
    assert removed_volume == pytest.approx(expected, rel=0.08)


def test_recipe_rejects_pocket_that_breaks_remaining_base() -> None:
    with pytest.raises(ValueError, match="minimum_remaining"):
        ProductRecipe(
            base_thickness_mm=3.0,
            relief_depth_mm=1.0,
            pocket_diameter_mm=12.0,
            pocket_depth_mm=2.5,
            minimum_remaining_base_mm=0.8,
        ).validate()
