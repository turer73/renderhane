from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from generate_geometry_coupon import generate_geometry_coupon


def test_geometry_coupon_has_known_plateaus_and_matching_canvas(tmp_path: Path) -> None:
    manifest = generate_geometry_coupon(tmp_path, width_px=280, height_px=160)

    relief_path = tmp_path / manifest["files"]["relief_map_16"]
    mask_path = tmp_path / manifest["files"]["mask"]
    relief = np.asarray(Image.open(relief_path), dtype=np.uint16)
    mask = np.asarray(Image.open(mask_path).convert("L"), dtype=np.uint8)

    assert relief.shape == (160, 280)
    assert mask.shape == relief.shape
    assert manifest["maximum_relief_mm"] == 1.8
    assert [panel["target_relief_mm"] for panel in manifest["panels"]] == [0.6, 1.0, 1.4, 1.8]

    for panel in manifest["panels"]:
        left, top, right, bottom = panel["pixel_bounds"]
        # Sample away from the ramp and feature bars.
        sample_y = top + int((bottom - top) * 0.52)
        sample_x = left + int((right - left) * 0.50)
        observed = relief[sample_y, sample_x] / 65535.0
        assert abs(observed - panel["normalised_value"]) < 2.0 / 65535.0

    assert int(relief[0, 0]) == 0
    assert int(mask[0, 0]) == 0
    assert manifest["physical_validation_required"] is True
