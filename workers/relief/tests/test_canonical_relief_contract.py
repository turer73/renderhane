from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from product_relief_builder import ProductRecipe, build_product_relief


def test_absolute_canonical_map_preserves_declared_height_fractions(tmp_path: Path) -> None:
    height = width = 100
    levels = np.asarray([0.0, 1.0 / 3.0, 5.0 / 9.0, 7.0 / 9.0, 1.0])
    relief = np.zeros((height, width), dtype=np.float64)
    band_width = width // len(levels)
    for index, level in enumerate(levels):
        left = index * band_width
        right = width if index == len(levels) - 1 else (index + 1) * band_width
        relief[:, left:right] = level
    mask = np.ones((height, width), dtype=np.uint8) * 255

    relief_path = tmp_path / "canonical-16.png"
    mask_path = tmp_path / "mask.png"
    output = tmp_path / "output"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray(mask, mode="L").save(mask_path)

    report = build_product_relief(
        relief_path,
        mask_path,
        output,
        ProductRecipe(
            width_mm=50.0,
            height_mm=50.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.8,
            grid_long_edge=100,
            normalization_mode="absolute",
        ),
    )

    normalized = np.asarray(
        Image.open(output / "relief-map-normalized-16.png"),
        dtype=np.uint16,
    ).astype(np.float64) / 65535.0
    observed = []
    for index in range(len(levels)):
        left = index * band_width
        right = width if index == len(levels) - 1 else (index + 1) * band_width
        # Avoid bicubic transition pixels at band boundaries.
        observed.append(float(np.median(normalized[20:80, left + 3 : right - 3])))

    assert observed == pytest.approx(levels.tolist(), abs=2.0 / 65535.0)
    assert report.validation["normalization"]["mode"] == "absolute"
    assert report.validation["maximum_z_mm"] == pytest.approx(4.8, abs=0.02)
    assert report.validation["digital_geometry_gate"] == "pass"


def test_robust_mode_is_explicit_and_not_the_canonical_default(tmp_path: Path) -> None:
    relief = np.linspace(0.25, 0.75, 64 * 64, dtype=np.float64).reshape(64, 64)
    mask = np.ones((64, 64), dtype=np.uint8) * 255
    relief_path = tmp_path / "candidate-16.png"
    mask_path = tmp_path / "mask.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray(mask, mode="L").save(mask_path)

    absolute = build_product_relief(
        relief_path,
        mask_path,
        tmp_path / "absolute",
        ProductRecipe(
            width_mm=40,
            height_mm=40,
            relief_depth_mm=2.0,
            grid_long_edge=64,
            normalization_mode="absolute",
        ),
    )
    robust = build_product_relief(
        relief_path,
        mask_path,
        tmp_path / "robust",
        ProductRecipe(
            width_mm=40,
            height_mm=40,
            relief_depth_mm=2.0,
            grid_long_edge=64,
            normalization_mode="robust",
            percentile_low=0,
            percentile_high=100,
        ),
    )

    assert absolute.validation["maximum_z_mm"] == pytest.approx(4.5, abs=0.02)
    assert robust.validation["maximum_z_mm"] == pytest.approx(5.0, abs=0.02)
    assert ProductRecipe().normalization_mode == "absolute"


def test_non_16bit_map_is_rejected_by_default(tmp_path: Path) -> None:
    relief_path = tmp_path / "relief-8.png"
    mask_path = tmp_path / "mask.png"
    Image.fromarray(np.full((64, 64), 128, dtype=np.uint8), mode="L").save(relief_path)
    Image.fromarray(np.full((64, 64), 255, dtype=np.uint8), mode="L").save(mask_path)

    with pytest.raises(ValueError, match="16-bit grayscale"):
        build_product_relief(
            relief_path,
            mask_path,
            tmp_path / "out",
            ProductRecipe(width_mm=40, height_mm=40, grid_long_edge=64),
        )
