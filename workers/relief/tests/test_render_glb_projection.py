from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import trimesh
from PIL import Image

from measure_registration import measure_registration
from render_glb_projection import (
    MAX_PROJECTED_TRIANGLES,
    _enforce_projected_triangle_limit,
    render_glb_front_orthographic,
)


def _write_asymmetric_glb(
    path: Path,
    *,
    mirror_x: bool = False,
    translate_x_mm: float = 0.0,
) -> Path:
    horizontal = trimesh.creation.box(extents=(36.0, 8.0, 2.0))
    horizontal.apply_translation((0.0, -8.0, 1.0))
    vertical = trimesh.creation.box(extents=(8.0, 16.0, 2.0))
    vertical.apply_translation((-14.0, 4.0, 1.0))
    meshes = [horizontal, vertical]
    for mesh in meshes:
        if mirror_x:
            mesh.vertices[:, 0] *= -1.0
        mesh.apply_translation((translate_x_mm, 0.0, 0.0))
        mesh.apply_scale(0.001)
    scene = trimesh.Scene({"horizontal": horizontal, "vertical": vertical})
    path.write_bytes(scene.export(file_type="glb"))
    return path


def _render(path: Path) -> tuple[np.ndarray, np.ndarray, dict]:
    return render_glb_front_orthographic(
        path,
        canvas_px=(240, 180),
        expected_xy_bounds_mm=(-20.0, -15.0, 20.0, 15.0),
        base_thickness_mm=1.0,
        relief_depth_mm=1.0,
    )


def test_fixed_physical_frame_detects_mirror_with_equal_extents(tmp_path: Path) -> None:
    correct_mask, correct_depth, correct_evidence = _render(
        _write_asymmetric_glb(tmp_path / "correct.glb")
    )
    mirrored_mask, _, mirrored_evidence = _render(
        _write_asymmetric_glb(tmp_path / "mirrored.glb", mirror_x=True)
    )

    assert correct_evidence["actual_extents_mm"] == mirrored_evidence["actual_extents_mm"]
    assert not np.array_equal(correct_mask, mirrored_mask)
    assert np.array_equal(correct_mask, np.fliplr(mirrored_mask))
    assert int(correct_depth[correct_mask].max()) == 65535

    source_path = tmp_path / "source.png"
    geometry_path = tmp_path / "mirrored.png"
    Image.fromarray(correct_mask.astype(np.uint8) * 255, mode="L").save(source_path)
    Image.fromarray(mirrored_mask.astype(np.uint8) * 255, mode="L").save(geometry_path)
    report = measure_registration(
        source_mask_path=source_path,
        geometry_mask_path=geometry_path,
        crop_box_px=(0, 0, 240, 180),
        physical_width_mm=40.0,
        physical_height_mm=30.0,
        tolerance_mm=0.5,
        source_resampling="coverage",
        evidence_source="injection_test_final_glb",
        evidence_independence="independent_cpu_mesh_rasterization",
    )
    assert report.decision == "fail"
    assert report.maximum_edge_distance_mm > 10.0


def test_fixed_physical_frame_does_not_refit_translation(tmp_path: Path) -> None:
    original, _, _ = _render(_write_asymmetric_glb(tmp_path / "original.glb"))
    translated, _, _ = _render(
        _write_asymmetric_glb(
            tmp_path / "translated.glb",
            translate_x_mm=2.0,
        )
    )

    original_x = float(np.argwhere(original)[:, 1].mean())
    translated_x = float(np.argwhere(translated)[:, 1].mean())
    assert translated_x - original_x == 12.0


def test_projection_rejects_unbounded_visible_triangle_count() -> None:
    _enforce_projected_triangle_limit(MAX_PROJECTED_TRIANGLES)

    with pytest.raises(ValueError, match="visible triangles"):
        _enforce_projected_triangle_limit(MAX_PROJECTED_TRIANGLES + 1)
