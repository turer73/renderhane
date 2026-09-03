from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import numpy as np
import pytest
import trimesh
from PIL import Image

MODULE_PATH = Path(__file__).resolve().parents[1] / "relief_builder.py"
SPEC = importlib.util.spec_from_file_location("relief_builder", MODULE_PATH)
assert SPEC and SPEC.loader
relief_builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relief_builder)

BuildRecipe = relief_builder.BuildRecipe
build = relief_builder.build


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_gradient(path: Path, width: int = 96, height: int = 64) -> None:
    x = np.linspace(0.0, 1.0, width, dtype=np.float32)
    y = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    surface = 0.65 * x + 0.35 * y
    bump = 0.15 * np.exp(-(((x[None, :] - 0.5) / 0.18) ** 2 + ((y - 0.5) / 0.24) ** 2))
    image = np.clip(surface + bump, 0.0, 1.0)
    Image.fromarray(np.round(image * 65535.0).astype(np.uint16)).save(path)


def test_build_is_watertight_and_uses_physical_dimensions(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    output = tmp_path / "out"
    write_gradient(source)

    report = build(
        source,
        output,
        BuildRecipe(
            width_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.2,
            grid_long_edge=64,
        ),
    )

    validation = report.validation
    assert validation["watertight"] is True
    assert validation["winding_consistent"] is True
    assert validation["is_volume"] is True
    assert validation["open_edge_count"] == 0
    assert validation["warnings"] == []
    assert validation["production_status"] == "ready"
    assert validation["extents_mm"] == pytest.approx([70.0, 46.666667, 4.2], abs=1e-5)

    stl_mesh = trimesh.load_mesh(output / "model.stl")
    assert stl_mesh.is_watertight
    assert stl_mesh.extents == pytest.approx([70.0, 46.666667, 4.2], abs=1e-4)

    glb_mesh = trimesh.load(output / "model.glb", force="mesh")
    assert glb_mesh.extents == pytest.approx([0.07, 0.046666667, 0.0042], abs=1e-6)


def test_build_outputs_are_deterministic(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    write_gradient(source)
    recipe = BuildRecipe(width_mm=70.0, relief_depth_mm=1.0, grid_long_edge=48)

    out_a = tmp_path / "a"
    out_b = tmp_path / "b"
    build(source, out_a, recipe)
    build(source, out_b, recipe)

    for name in [
        "model.stl",
        "model.glb",
        "relief-map-normalized-16.png",
        "manufacturing-report.json",
    ]:
        assert file_hash(out_a / name) == file_hash(out_b / name)


def test_mask_suppresses_relief_but_does_not_trim_phase0_plate(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    mask_path = tmp_path / "mask.png"
    output = tmp_path / "out"
    write_gradient(source, width=64, height=64)

    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[16:48, 16:48] = 255
    Image.fromarray(mask).save(mask_path)

    report = build(
        source,
        output,
        BuildRecipe(width_mm=70.0, height_mm=70.0, relief_depth_mm=1.0, grid_long_edge=64),
        mask_path,
    )

    assert report.validation["watertight"] is True
    assert report.validation["extents_mm"] == pytest.approx([70.0, 70.0, 4.0], abs=1e-5)
    normalized = np.asarray(Image.open(output / "relief-map-normalized-16.png"), dtype=np.uint16)
    assert int(normalized[0, 0]) == 0
    assert int(normalized[32, 32]) > 0


def test_recipe_rejects_unsafe_or_invalid_values() -> None:
    with pytest.raises(ValueError):
        BuildRecipe(width_mm=0).validate()
    with pytest.raises(ValueError):
        BuildRecipe(base_thickness_mm=0.5).validate()
    with pytest.raises(ValueError):
        BuildRecipe(percentile_low=99, percentile_high=2).validate()
    with pytest.raises(ValueError):
        BuildRecipe(gamma=0).validate()
