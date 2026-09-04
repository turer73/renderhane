from __future__ import annotations

import hashlib
import importlib.util
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import pytest
import trimesh

WORKER_DIR = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("export_3mf", WORKER_DIR / "export_3mf.py")
assert SPEC and SPEC.loader
export_3mf_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(export_3mf_module)

export_3mf = export_3mf_module.export_3mf
CORE_NS = export_3mf_module.CORE_NS


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_exported_3mf_contains_valid_core_package_and_mm_units(tmp_path: Path) -> None:
    source = tmp_path / "source.stl"
    output = tmp_path / "model.3mf"
    mesh = trimesh.creation.box(extents=[70.0, 50.0, 4.2])
    mesh.export(source)

    report = export_3mf(source, output, title="Kapadokya Relief")

    assert report.unit == "millimeter"
    assert report.watertight is True
    assert report.is_volume is True
    assert report.extents_mm == pytest.approx([70.0, 50.0, 4.2], abs=1e-6)

    with zipfile.ZipFile(output) as archive:
        assert set(archive.namelist()) == {
            "3D/3dmodel.model",
            "[Content_Types].xml",
            "_rels/.rels",
        }
        root = ET.fromstring(archive.read("3D/3dmodel.model"))

    assert root.attrib["unit"] == "millimeter"
    vertices = root.findall(f".//{{{CORE_NS}}}vertex")
    triangles = root.findall(f".//{{{CORE_NS}}}triangle")
    assert len(vertices) == report.vertex_count
    assert len(triangles) == report.triangle_count


def test_3mf_export_is_byte_deterministic(tmp_path: Path) -> None:
    source = tmp_path / "source.stl"
    trimesh.creation.icosphere(subdivisions=2, radius=12.0).export(source)

    first = tmp_path / "first.3mf"
    second = tmp_path / "second.3mf"
    export_3mf(source, first, title="Same")
    export_3mf(source, second, title="Same")

    assert _sha256(first) == _sha256(second)


def test_3mf_export_converts_meter_source_coordinates_to_millimeters(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source-in-meters.stl"
    output = tmp_path / "model.3mf"
    trimesh.creation.box(extents=[0.07, 0.05, 0.0042]).export(source)

    report = export_3mf(source, output, source_unit="meter")

    assert report.source_unit == "meter"
    assert report.unit == "millimeter"
    assert report.extents_mm == pytest.approx([70.0, 50.0, 4.2], abs=1e-5)


def test_3mf_export_applies_scene_node_transform_before_unit_scaling(
    tmp_path: Path,
) -> None:
    source = tmp_path / "transformed-source.glb"
    output = tmp_path / "model.3mf"
    scene = trimesh.Scene()
    transform = trimesh.transformations.scale_and_translate(
        scale=[2.0, 3.0, 4.0],
        translate=[0.1, 0.2, 0.3],
    )
    scene.add_geometry(
        trimesh.creation.box(extents=[0.01, 0.02, 0.003]),
        node_name="transformed-box",
        transform=transform,
    )
    source.write_bytes(scene.export(file_type="glb"))

    report = export_3mf(source, output, source_unit="meter")

    assert report.extents_mm == pytest.approx([20.0, 60.0, 12.0], abs=1e-5)
    with zipfile.ZipFile(output) as archive:
        root = ET.fromstring(archive.read("3D/3dmodel.model"))
    vertices = root.findall(f".//{{{CORE_NS}}}vertex")
    coordinates = [
        [float(vertex.attrib[axis]) for axis in ("x", "y", "z")]
        for vertex in vertices
    ]
    assert [min(values) for values in zip(*coordinates)] == pytest.approx(
        [90.0, 170.0, 294.0],
        abs=1e-5,
    )
    assert [max(values) for values in zip(*coordinates)] == pytest.approx(
        [110.0, 230.0, 306.0],
        abs=1e-5,
    )


def test_3mf_export_rejects_unknown_source_unit(tmp_path: Path) -> None:
    source = tmp_path / "source.stl"
    trimesh.creation.box(extents=[70.0, 50.0, 4.2]).export(source)

    with pytest.raises(ValueError, match="source_unit"):
        export_3mf(source, tmp_path / "model.3mf", source_unit="inch")


def test_3mf_export_rejects_open_mesh(tmp_path: Path) -> None:
    source = tmp_path / "open.stl"
    output = tmp_path / "open.3mf"
    open_mesh = trimesh.Trimesh(
        vertices=[[0, 0, 0], [10, 0, 0], [0, 10, 0]],
        faces=[[0, 1, 2]],
        process=False,
    )
    open_mesh.export(source)

    with pytest.raises(ValueError, match="watertight"):
        export_3mf(source, output)
