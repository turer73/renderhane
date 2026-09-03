from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

import numpy as np
import pytest
import trimesh
from PIL import Image

MODULE_PATH = Path(__file__).resolve().parents[1] / "relief_builder.py"
SPEC = importlib.util.spec_from_file_location("relief_builder", MODULE_PATH)
assert SPEC and SPEC.loader
relief_builder = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = relief_builder
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


def test_rectangle_build_is_digitally_validated_and_uses_physical_dimensions(tmp_path: Path) -> None:
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
    assert validation["degenerate_face_count"] == 0
    assert validation["connected_component_count"] == 1
    assert validation["warnings"] == []
    assert validation["digital_status"] == "validated"
    assert validation["production_status"] == "physical_validation_required"
    assert validation["physical_validation_required"] is True
    assert validation["extents_mm"] == pytest.approx([70.0, 46.666667, 4.2], abs=1e-5)
    assert validation["back_plane_flatness_mm"] == 0.0
    assert validation["actual_relief_max_mm"] == pytest.approx(1.2, abs=1e-5)

    stl_mesh = trimesh.load_mesh(output / "model.stl")
    assert stl_mesh.is_watertight
    assert stl_mesh.extents == pytest.approx([70.0, 46.666667, 4.2], abs=1e-4)

    glb_mesh = trimesh.load(output / "model.glb", force="mesh")
    assert glb_mesh.extents == pytest.approx([0.07, 0.046666667, 0.0042], abs=1e-6)

    threemf_mesh = trimesh.load(output / "model.3mf", force="mesh", process=False)
    assert threemf_mesh.is_watertight
    assert threemf_mesh.extents == pytest.approx([70.0, 46.666667, 4.2], abs=1e-4)
    with zipfile.ZipFile(output / "model.3mf") as archive:
        assert set(archive.namelist()) == {
            "[Content_Types].xml",
            "_rels/.rels",
            "3D/3dmodel.model",
        }
        root = ElementTree.fromstring(archive.read("3D/3dmodel.model"))
        assert root.attrib["unit"] == "millimeter"


def test_outputs_are_byte_deterministic_in_same_environment(tmp_path: Path) -> None:
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
        "model.3mf",
        "relief-map-normalized-16.png",
        "height-preview.png",
        "manufacturing-report.json",
        "artifact-manifest.json",
        "manufacturing-package.zip",
    ]:
        assert file_hash(out_a / name) == file_hash(out_b / name), name


def test_artifact_manifest_contains_hashes_and_package_is_complete(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    output = tmp_path / "out"
    write_gradient(source)
    build(source, output, BuildRecipe(grid_long_edge=32))

    manifest = json.loads((output / "artifact-manifest.json").read_text())
    assert manifest["engine_version"] == relief_builder.ENGINE_VERSION
    for item in manifest["artifacts"].values():
        path = output / item["file"]
        assert path.is_file()
        assert item["sha256"] == file_hash(path)
        assert item["bytes"] == path.stat().st_size

    with zipfile.ZipFile(output / "manufacturing-package.zip") as archive:
        assert set(archive.namelist()) == {
            "artifact-manifest.json",
            "contour.svg",
            "height-preview.png",
            "manufacturing-report.json",
            "model.3mf",
            "model.glb",
            "model.stl",
            "registration-overlay.svg",
            "relief-map-normalized-16.png",
        }


def test_mask_suppresses_relief_but_rectangle_plate_is_preserved(tmp_path: Path) -> None:
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


def test_silhouette_build_is_single_watertight_volume_and_fits_requested_size(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    mask_path = tmp_path / "mask.png"
    output = tmp_path / "out"
    write_gradient(source, width=96, height=96)

    yy, xx = np.ogrid[:96, :96]
    mask = (((xx - 48) / 35) ** 2 + ((yy - 48) / 42) ** 2 <= 1.0).astype(np.uint8) * 255
    Image.fromarray(mask).save(mask_path)

    report = build(
        source,
        output,
        BuildRecipe(
            width_mm=70.0,
            height_mm=78.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.0,
            grid_long_edge=96,
            shape_mode="silhouette",
        ),
        mask_path,
    )

    validation = report.validation
    assert validation["digital_status"] == "validated"
    assert validation["watertight"] is True
    assert validation["connected_component_count"] == 1
    assert validation["open_edge_count"] == 0
    assert validation["extents_mm"] == pytest.approx([70.0, 78.0, 4.0], abs=1e-4)
    assert report.source_crop_px != [0, 0, 96, 96]
    contour = (output / "contour.svg").read_text()
    assert 'width="70mm"' in contour
    assert 'height="78mm"' in contour
    assert "<path" in contour and " Z" in contour


def test_detached_silhouette_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    mask_path = tmp_path / "mask.png"
    write_gradient(source, width=64, height=64)
    mask = np.zeros((64, 64), dtype=np.uint8)
    mask[8:22, 8:22] = 255
    mask[42:56, 42:56] = 255
    Image.fromarray(mask).save(mask_path)

    with pytest.raises(ValueError, match="exactly one 4-connected component"):
        build(
            source,
            tmp_path / "out",
            BuildRecipe(shape_mode="silhouette", grid_long_edge=64),
            mask_path,
        )


def test_empty_mask_and_flat_map_are_rejected(tmp_path: Path) -> None:
    flat = tmp_path / "flat.png"
    empty_mask = tmp_path / "empty-mask.png"
    Image.fromarray(np.full((32, 32), 1000, dtype=np.uint16)).save(flat)
    Image.fromarray(np.zeros((32, 32), dtype=np.uint8)).save(empty_mask)

    with pytest.raises(ValueError, match="no active pixels"):
        build(flat, tmp_path / "mask-out", BuildRecipe(grid_long_edge=32), empty_mask)
    with pytest.raises(ValueError, match="no usable dynamic range"):
        build(flat, tmp_path / "flat-out", BuildRecipe(grid_long_edge=32))


def test_recipe_rejects_unsafe_or_invalid_values() -> None:
    invalid = [
        BuildRecipe(width_mm=0),
        BuildRecipe(base_thickness_mm=0.5),
        BuildRecipe(percentile_low=99, percentile_high=2),
        BuildRecipe(gamma=0),
        BuildRecipe(grid_long_edge=1024),
        BuildRecipe(mask_threshold=1.0),
        BuildRecipe(width_mm=float("nan")),
    ]
    for recipe in invalid:
        with pytest.raises(ValueError):
            recipe.validate()


def test_aligned_uv_layers_share_one_transform_and_canvas(tmp_path: Path) -> None:
    source = tmp_path / "relief.png"
    mask_path = tmp_path / "alpha.png"
    uv_path = tmp_path / "uv.png"
    white_path = tmp_path / "white.png"
    varnish_path = tmp_path / "varnish.png"
    output = tmp_path / "out"

    write_gradient(source, width=80, height=100)
    yy, xx = np.ogrid[:100, :80]
    alpha = (((xx - 40) / 30) ** 2 + ((yy - 50) / 43) ** 2 <= 1.0).astype(np.uint8) * 255
    Image.fromarray(alpha).save(mask_path)

    rgba = np.zeros((100, 80, 4), dtype=np.uint8)
    rgba[..., 0] = np.arange(80, dtype=np.uint8)[None, :] * 3
    rgba[..., 1] = np.arange(100, dtype=np.uint8)[:, None] * 2
    rgba[..., 2] = 120
    rgba[..., 3] = alpha
    Image.fromarray(rgba, mode="RGBA").save(uv_path)
    Image.fromarray(alpha).save(white_path)
    varnish = np.zeros_like(alpha)
    varnish[40:60, 28:52] = 255
    Image.fromarray(varnish).save(varnish_path)

    report = build(
        source,
        output,
        BuildRecipe(
            width_mm=70,
            height_mm=82,
            grid_long_edge=256,
            shape_mode="silhouette",
            artwork_long_edge_px=512,
        ),
        mask_path,
        {
            "uv_artwork": uv_path,
            "white_mask": white_path,
            "varnish_mask": varnish_path,
        },
    )

    expected_size = tuple(report.coordinate_system["aligned_artwork_size_px"])
    assert expected_size == (437, 512)
    for name in [
        "uv-print-aligned.png",
        "white-mask-aligned.png",
        "varnish-mask-aligned.png",
        "silhouette-mask-aligned.png",
    ]:
        with Image.open(output / name) as image:
            assert image.size == expected_size

    assert set(report.artifacts) >= {
        "uv_artwork",
        "white_mask",
        "varnish_mask",
        "silhouette_mask",
        "registration_overlay",
        "contour",
    }
    assert report.aligned_input_sha256 == {
        "uv_artwork": file_hash(uv_path),
        "varnish_mask": file_hash(varnish_path),
        "white_mask": file_hash(white_path),
    }
    assert (output / "white-mask-aligned.png").read_bytes() == (
        output / "silhouette-mask-aligned.png"
    ).read_bytes()
    assert report.coordinate_system["digital_boundary_quantization_mm"] < 1.0
    assert report.validation["advisories"] == [
        "explicit_height_changes_source_aspect_ratio_by_21.751_percent"
    ]


def test_silhouette_holes_are_rejected_in_phase0(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    mask_path = tmp_path / "ring-mask.png"
    write_gradient(source, width=96, height=96)
    yy, xx = np.ogrid[:96, :96]
    outer = ((xx - 48) ** 2 + (yy - 48) ** 2) <= 40**2
    inner = ((xx - 48) ** 2 + (yy - 48) ** 2) < 15**2
    Image.fromarray(((outer & ~inner).astype(np.uint8) * 255)).save(mask_path)

    with pytest.raises(ValueError, match="holes are not supported"):
        build(
            source,
            tmp_path / "out",
            BuildRecipe(shape_mode="silhouette", grid_long_edge=96),
            mask_path,
        )


def test_explicit_height_aspect_change_is_advisory_not_geometry_failure(tmp_path: Path) -> None:
    source = tmp_path / "gradient-16.png"
    write_gradient(source, width=100, height=50)
    report = build(
        source,
        tmp_path / "out",
        BuildRecipe(width_mm=70, height_mm=70, grid_long_edge=48),
    )
    assert report.validation["digital_status"] == "validated"
    assert report.coordinate_system["aspect_ratio_distortion_percent"] == pytest.approx(50.0)
    assert report.validation["advisories"] == [
        "explicit_height_changes_source_aspect_ratio_by_50.000_percent"
    ]


def test_low_effective_precision_is_reported_as_advisory(tmp_path: Path) -> None:
    source = tmp_path / "eight-bit.png"
    values = np.tile(np.arange(64, dtype=np.uint8), (64, 1))
    Image.fromarray(values, mode="L").save(source)
    report = build(source, tmp_path / "out", BuildRecipe(grid_long_edge=64))
    assert report.source_image_info["storage_bits_per_sample"] == 8
    assert report.source_image_info["effective_precision_bits_estimate"] <= 8
    assert "relief_map_has_8_bit_or_lower_effective_precision" in report.validation["advisories"]
    assert report.validation["digital_status"] == "validated"


def test_mismatched_aligned_layer_canvas_is_rejected(tmp_path: Path) -> None:
    source = tmp_path / "relief.png"
    uv_path = tmp_path / "uv.png"
    write_gradient(source, width=64, height=64)
    Image.new("RGBA", (32, 32), (255, 0, 0, 255)).save(uv_path)

    with pytest.raises(ValueError, match=r"expected \(64, 64\)"):
        build(
            source,
            tmp_path / "out",
            BuildRecipe(grid_long_edge=32),
            aligned_layer_paths={"uv_artwork": uv_path},
        )


def test_source_top_left_maps_to_model_negative_x_positive_y() -> None:
    relief = np.zeros((3, 3), dtype=np.float32)
    relief[0, 0] = 1.0
    mesh = relief_builder.build_rectangular_relief_mesh(
        relief,
        width_mm=30.0,
        height_mm=30.0,
        base_thickness_mm=3.0,
        relief_depth_mm=2.0,
    )
    top = mesh.vertices[np.argmax(mesh.vertices[:, 2])]
    assert top[0] == pytest.approx(-15.0)
    assert top[1] == pytest.approx(15.0)
    assert top[2] == pytest.approx(5.0)
    assert mesh.is_watertight
    assert mesh.is_winding_consistent
    assert mesh.is_volume
