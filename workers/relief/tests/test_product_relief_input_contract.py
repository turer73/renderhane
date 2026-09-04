from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from product_relief_builder import ProductRecipe, build_product_relief


def _mask(path: Path, size: int = 64) -> None:
    Image.fromarray(
        np.full((size, size), 255, dtype=np.uint8),
        mode="L",
    ).save(path)


def test_absolute_mode_preserves_low_uint16_code_values(tmp_path: Path) -> None:
    relief = np.zeros((64, 64), dtype=np.uint16)
    relief[:, 32:] = 1
    relief_path = tmp_path / "relief-16.png"
    mask_path = tmp_path / "mask.png"
    output = tmp_path / "output"
    Image.fromarray(relief, mode="I;16").save(relief_path)
    _mask(mask_path)

    report = build_product_relief(
        relief_path,
        mask_path,
        output,
        ProductRecipe(width_mm=40, height_mm=40, grid_long_edge=64),
    )

    normalized = np.asarray(
        Image.open(output / "relief-map-normalized-16.png"),
        dtype=np.int32,
    )
    assert int(normalized.min()) == 0
    assert int(normalized.max()) == 1
    assert report.validation["normalization"]["input_max"] == pytest.approx(
        1.0 / 65535.0
    )


def test_absolute_mode_rejects_signed_32bit_integer_image(tmp_path: Path) -> None:
    relief_path = tmp_path / "relief-32.tiff"
    mask_path = tmp_path / "mask.png"
    relief = np.zeros((64, 64), dtype=np.int32)
    relief[:, 32:] = 65535
    Image.fromarray(relief, mode="I").save(relief_path)
    _mask(mask_path)

    with pytest.raises(ValueError, match="16-bit grayscale"):
        build_product_relief(
            relief_path,
            mask_path,
            tmp_path / "output",
            ProductRecipe(width_mm=40, height_mm=40, grid_long_edge=64),
        )


def test_absolute_mode_rejects_uint16_tiff_mislabeled_as_png_source(
    tmp_path: Path,
) -> None:
    relief_path = tmp_path / "relief-16.tiff"
    mask_path = tmp_path / "mask.png"
    relief = np.full((64, 64), 32768, dtype=np.uint16)
    Image.fromarray(relief, mode="I;16").save(relief_path)
    _mask(mask_path)

    with pytest.raises(ValueError, match="16-bit grayscale PNG"):
        build_product_relief(
            relief_path,
            mask_path,
            tmp_path / "output",
            ProductRecipe(width_mm=40, height_mm=40, grid_long_edge=64),
        )


def test_robust_legacy_input_is_accepted_only_with_review_advisory(
    tmp_path: Path,
) -> None:
    relief_path = tmp_path / "legacy-8.png"
    mask_path = tmp_path / "mask.png"
    relief = np.tile(np.arange(64, dtype=np.uint8), (64, 1))
    Image.fromarray(relief, mode="L").save(relief_path)
    _mask(mask_path)

    report = build_product_relief(
        relief_path,
        mask_path,
        tmp_path / "output",
        ProductRecipe(
            width_mm=40,
            height_mm=40,
            grid_long_edge=96,
            normalization_mode="robust",
        ),
    )

    assert report.validation["digital_geometry_gate"] == "pass"
    assert report.validation["digital_status"] == "needs_review"
    assert (
        "legacy_robust_normalization_not_canonical"
        in report.validation["warnings"]
    )
