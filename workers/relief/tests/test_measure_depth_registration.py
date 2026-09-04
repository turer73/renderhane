from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from measure_depth_registration import (
    measure_depth_registration,
    rasterize_canonical_heightfield,
    write_depth_difference_overlay,
)


def _write_u16(path: Path, values: np.ndarray) -> Path:
    Image.fromarray(values.astype(np.uint16)).save(path)
    return path


def _write_mask(path: Path, values: np.ndarray) -> Path:
    Image.fromarray(values.astype(np.uint8) * 255, mode="L").save(path)
    return path


def test_heightfield_rasterizer_uses_builder_triangle_diagonal(tmp_path: Path) -> None:
    nodes = np.asarray([[0, 0], [0, 65535]], dtype=np.uint16)
    node_path = _write_u16(tmp_path / "nodes.png", nodes)
    cell_path = _write_mask(tmp_path / "cells.png", np.ones((1, 1), dtype=bool))

    mask, normalized = rasterize_canonical_heightfield(
        node_path,
        cell_path,
        canvas_px=(2, 2),
    )

    assert mask.all()
    assert np.allclose(normalized, [[0.25, 0.25], [0.25, 0.75]])


def test_matching_final_glb_depth_passes_strict_physical_gate(tmp_path: Path) -> None:
    nodes = np.asarray([[0, 65535], [0, 65535]], dtype=np.uint16)
    node_path = _write_u16(tmp_path / "nodes.png", nodes)
    cell_path = _write_mask(tmp_path / "cells.png", np.ones((1, 1), dtype=bool))
    expected_mask, expected = rasterize_canonical_heightfield(
        node_path,
        cell_path,
        canvas_px=(64, 32),
    )
    observed_path = _write_u16(
        tmp_path / "observed.png",
        np.round(expected * 65535.0),
    )
    observed_mask_path = _write_mask(tmp_path / "observed-mask.png", expected_mask)

    report = measure_depth_registration(
        normalized_height_path=node_path,
        cell_mask_path=cell_path,
        observed_depth_path=observed_path,
        observed_silhouette_path=observed_mask_path,
        relief_depth_mm=1.2,
        tolerance_mm=0.02,
    )

    assert report.decision == "pass"
    assert report.maximum_absolute_error_mm < report.quantization_uncertainty_mm
    assert report.guard_banded_maximum_error_mm < 0.02


def test_mirrored_depth_fails_even_when_silhouette_is_identical(tmp_path: Path) -> None:
    nodes = np.asarray([[0, 65535], [0, 65535]], dtype=np.uint16)
    node_path = _write_u16(tmp_path / "nodes.png", nodes)
    cell_path = _write_mask(tmp_path / "cells.png", np.ones((1, 1), dtype=bool))
    expected_mask, expected = rasterize_canonical_heightfield(
        node_path,
        cell_path,
        canvas_px=(64, 32),
    )
    observed_path = _write_u16(
        tmp_path / "mirrored.png",
        np.round(np.fliplr(expected) * 65535.0),
    )
    observed_mask_path = _write_mask(tmp_path / "observed-mask.png", expected_mask)

    report = measure_depth_registration(
        normalized_height_path=node_path,
        cell_mask_path=cell_path,
        observed_depth_path=observed_path,
        observed_silhouette_path=observed_mask_path,
        relief_depth_mm=1.2,
        tolerance_mm=0.02,
    )

    assert report.decision == "fail"
    assert report.maximum_absolute_error_mm > 1.0
    assert "maximum_height_error_exceeds_tolerance" in report.failures


def test_depth_difference_overlay_encodes_height_and_coverage_errors(tmp_path: Path) -> None:
    nodes = np.asarray([[0, 65535], [0, 65535]], dtype=np.uint16)
    node_path = _write_u16(tmp_path / "nodes.png", nodes)
    cell_path = _write_mask(tmp_path / "cells.png", np.ones((1, 1), dtype=bool))
    expected_mask, expected = rasterize_canonical_heightfield(
        node_path,
        cell_path,
        canvas_px=(8, 4),
    )
    observed = np.round(expected * 65535.0).astype(np.uint16)
    observed[:, 4:] = 0
    observed_mask = expected_mask.copy()
    observed_mask[:, 0] = False
    observed_path = _write_u16(tmp_path / "observed.png", observed)
    observed_mask_path = _write_mask(tmp_path / "observed-mask.png", observed_mask)
    overlay_path = tmp_path / "difference.png"

    write_depth_difference_overlay(
        normalized_height_path=node_path,
        cell_mask_path=cell_path,
        observed_depth_path=observed_path,
        observed_silhouette_path=observed_mask_path,
        relief_depth_mm=1.0,
        tolerance_mm=0.02,
        destination=overlay_path,
    )

    overlay = np.asarray(Image.open(overlay_path).convert("RGB"), dtype=np.uint8)
    assert np.array_equal(overlay[0, 0], [0, 90, 255])
    assert int(overlay[0, -1, 0]) == 255
    assert int(overlay[0, -1, 1]) == 0
