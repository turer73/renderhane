from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from measure_registration import measure_registration


def _write_mask(path: Path, array: np.ndarray) -> Path:
    Image.fromarray((array * 255).astype(np.uint8), mode="L").save(path)
    return path


def test_identical_source_and_geometry_masks_pass(tmp_path: Path) -> None:
    mask = np.zeros((100, 100), dtype=bool)
    mask[20:80, 25:75] = True
    source = _write_mask(tmp_path / "source.png", mask)
    geometry = _write_mask(tmp_path / "geometry.png", mask)

    report = measure_registration(
        source_mask_path=source,
        geometry_mask_path=geometry,
        crop_box_px=(0, 0, 100, 100),
        physical_width_mm=70.0,
        physical_height_mm=70.0,
        tolerance_mm=0.5,
    )

    assert report.decision == "pass"
    assert report.intersection_over_union == 1.0
    assert report.maximum_edge_distance_mm == 0.0
    assert report.p95_edge_distance_mm == 0.0


def test_one_pixel_shift_is_reported_in_millimetres(tmp_path: Path) -> None:
    source_mask = np.zeros((100, 100), dtype=bool)
    source_mask[20:80, 25:75] = True
    shifted = np.zeros_like(source_mask)
    shifted[20:80, 26:76] = True
    source = _write_mask(tmp_path / "source.png", source_mask)
    geometry = _write_mask(tmp_path / "geometry.png", shifted)

    report = measure_registration(
        source_mask_path=source,
        geometry_mask_path=geometry,
        crop_box_px=(0, 0, 100, 100),
        physical_width_mm=70.0,
        physical_height_mm=70.0,
        tolerance_mm=0.5,
    )

    assert report.decision == "fail"
    assert report.maximum_edge_distance_mm == 0.7
    assert "maximum_contour_registration_exceeds_tolerance" in report.failures


def test_source_crop_is_resized_to_geometry_canvas_before_comparison(tmp_path: Path) -> None:
    full = np.zeros((200, 200), dtype=bool)
    full[40:160, 50:150] = True
    geometry = np.ones((60, 50), dtype=bool)
    source_path = _write_mask(tmp_path / "source.png", full)
    geometry_path = _write_mask(tmp_path / "geometry.png", geometry)

    report = measure_registration(
        source_mask_path=source_path,
        geometry_mask_path=geometry_path,
        crop_box_px=(50, 40, 150, 160),
        physical_width_mm=70.0,
        physical_height_mm=84.0,
        tolerance_mm=0.5,
    )

    assert report.decision == "pass"
    assert report.comparison_canvas_px == [50, 60]
    assert report.physical_canvas_mm == [70.0, 84.0]
