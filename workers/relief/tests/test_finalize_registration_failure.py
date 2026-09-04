from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from build_relief_pro_package import build_relief_pro_package
from finalize_relief_pro_package import finalize_package
from product_relief_builder import ProductRecipe


def test_finalizer_fails_shifted_geometry_registration(tmp_path: Path) -> None:
    size = 128
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    source_mask = (x - centre) ** 2 + (y - centre) ** 2 <= (size * 0.38) ** 2
    relief = np.clip(
        1.0 - np.sqrt((x - centre) ** 2 + (y - centre) ** 2) / (size * 0.38),
        0.0,
        1.0,
    )
    relief[~source_mask] = 0.0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., :3] = [170, 120, 80]
    rgba[..., 3] = (source_mask * 255).astype(np.uint8)

    fixture = tmp_path / "fixture"
    fixture.mkdir()
    relief_path = fixture / "relief.png"
    mask_path = fixture / "mask.png"
    uv_path = fixture / "uv.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray((source_mask * 255).astype(np.uint8), mode="L").save(mask_path)
    Image.fromarray(rgba, mode="RGBA").save(uv_path)

    package = tmp_path / "package"
    build_relief_pro_package(
        relief_map=relief_path,
        mask=mask_path,
        uv_artwork=uv_path,
        output_dir=package,
        recipe=ProductRecipe(
            width_mm=70.0,
            height_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.0,
            grid_long_edge=96,
        ),
    )

    geometry_mask_path = package / "geometry/silhouette-mask-normalized.png"
    geometry_mask = np.asarray(
        Image.open(geometry_mask_path).convert("L"),
        dtype=np.uint8,
    )
    shifted = np.zeros_like(geometry_mask)
    shifted[:, 3:] = geometry_mask[:, :-3]
    Image.fromarray(shifted, mode="L").save(geometry_mask_path)

    result = finalize_package(
        package,
        registration_tolerance_mm=0.5,
    )

    assert result["receipt"]["digital_geometry_status"] == "failed"
    assert result["receipt"]["digital_contour_registration"] == "fail"
    assert result["receipt"]["physical_validation_status"] == "pending"
    assert any(
        value.startswith("registration:")
        for value in result["manifest"]["digital_failures"]
    )
