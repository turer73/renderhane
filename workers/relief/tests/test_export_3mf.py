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
