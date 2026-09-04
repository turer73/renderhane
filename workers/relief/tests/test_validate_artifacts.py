from __future__ import annotations

from pathlib import Path

import pytest
import trimesh

from export_3mf import export_3mf
from validate_artifacts import validate_artifact_set


def _write_consistent_box(directory: Path) -> tuple[Path, Path, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    stl = directory / "model.stl"
    glb = directory / "model.glb"
    three_mf = directory / "model.3mf"

    mesh_mm = trimesh.creation.box(extents=[70.0, 50.0, 4.2])
    mesh_mm.apply_translation([12.0, -4.0, 2.1])
    mesh_mm.export(stl)

    mesh_m = mesh_mm.copy()
    mesh_m.apply_scale(0.001)
    glb.write_bytes(mesh_m.export(file_type="glb"))
    export_3mf(stl, three_mf, source_unit="millimeter")
    return stl, glb, three_mf


def test_cross_format_validator_accepts_same_geometry_with_correct_units(tmp_path: Path) -> None:
    stl, glb, three_mf = _write_consistent_box(tmp_path / "artifacts")

    report = validate_artifact_set(
        stl_path=stl,
        glb_path=glb,
        three_mf_path=three_mf,
        tolerance_mm=0.02,
    )

    assert report.decision == "pass"
    assert report.failures == []
    assert all(comparison["pass"] for comparison in report.comparisons)
    formats = {artifact["format"]: artifact for artifact in report.artifacts}
    assert formats["stl"]["source_unit"] == "millimeter"
    assert formats["glb"]["source_unit"] == "meter"
    assert formats["glb"]["scale_to_mm"] == 1000.0
    assert formats["3mf"]["source_unit"] == "millimeter"
    assert formats["3mf"]["extents_mm"] == pytest.approx([70.0, 50.0, 4.2], abs=1e-5)


def test_cross_format_validator_rejects_glb_scale_mismatch(tmp_path: Path) -> None:
    stl, _glb, three_mf = _write_consistent_box(tmp_path / "artifacts")
    wrong_glb = tmp_path / "artifacts" / "wrong.glb"
    # This GLB encodes 70 metres, not 70 millimetres.
    wrong_glb.write_bytes(
        trimesh.creation.box(extents=[70.0, 50.0, 4.2]).export(file_type="glb")
    )

    report = validate_artifact_set(
        stl_path=stl,
        glb_path=wrong_glb,
        three_mf_path=three_mf,
        tolerance_mm=0.02,
    )

    assert report.decision == "fail"
    assert "stl_vs_glb:coordinate_mismatch" in report.failures


def test_cross_format_validator_rejects_open_3mf_geometry(tmp_path: Path) -> None:
    stl, glb, _three_mf = _write_consistent_box(tmp_path / "artifacts")
    open_source = tmp_path / "artifacts" / "open.stl"
    open_3mf = tmp_path / "artifacts" / "open.3mf"
    open_mesh = trimesh.Trimesh(
        vertices=[[0, 0, 0], [10, 0, 0], [0, 10, 0]],
        faces=[[0, 1, 2]],
        process=False,
    )
    open_mesh.export(open_source)

    # The exporter must reject it before the consistency validator sees it.
    with pytest.raises(ValueError, match="watertight"):
        export_3mf(open_source, open_3mf)

    assert stl.is_file()
    assert glb.is_file()
