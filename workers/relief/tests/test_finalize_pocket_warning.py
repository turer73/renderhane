from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from build_relief_pro_package import build_relief_pro_package
from finalize_relief_pro_package import finalize_package
from product_relief_builder import ProductRecipe


def test_rear_magnet_pocket_forces_physical_bridge_warning(tmp_path: Path) -> None:
    size = 128
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size * 0.43
    mask = (x - centre) ** 2 + (y - centre) ** 2 <= radius**2
    relief = np.clip(
        1.0 - np.sqrt((x - centre) ** 2 + (y - centre) ** 2) / radius,
        0.0,
        1.0,
    )
    relief[~mask] = 0.0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., :3] = [150, 110, 80]
    rgba[..., 3] = (mask * 255).astype(np.uint8)

    fixture = tmp_path / "fixture"
    fixture.mkdir()
    relief_path = fixture / "relief.png"
    mask_path = fixture / "mask.png"
    uv_path = fixture / "uv.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(mask_path)
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
            pocket_diameter_mm=12.0,
            pocket_depth_mm=2.0,
        ),
    )

    result = finalize_package(package)

    assert result["receipt"]["digital_geometry_status"] == "needs_review"
    assert (
        "magnet_pocket_requires_bridge_retention_and_orientation_physical_test"
        in result["manifest"]["digital_warnings"]
    )
    assert result["receipt"]["physical_validation_status"] == "pending"
