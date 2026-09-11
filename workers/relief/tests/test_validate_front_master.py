from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

from validate_front_master import validate_front_master


def _write_transparent_badge(path: Path, size: int = 256, margin: int = 24) -> Path:
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size / 2.0 - margin
    mask = (x - centre) ** 2 + (y - centre) ** 2 <= radius**2
    rgba[..., 0] = 40
    rgba[..., 1] = 130
    rgba[..., 2] = 210
    rgba[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    Image.fromarray(rgba, mode="RGBA").save(path)
    return path


def _write_mask(path: Path, size: int = 256, margin: int = 24) -> Path:
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size / 2.0 - margin
    mask = ((x - centre) ** 2 + (y - centre) ** 2 <= radius**2).astype(np.uint8) * 255
    Image.fromarray(mask, mode="L").save(path)
    return path


def test_explicit_mask_and_declarations_pass_with_vector_warning(tmp_path: Path) -> None:
    image = _write_transparent_badge(tmp_path / "front.png")
    mask = _write_mask(tmp_path / "mask.png")

    report = validate_front_master(
        image,
        mask_path=mask,
        minimum_long_edge_px=256,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert report["decision"] == "pass_with_warnings"
    assert report["failures"] == []
    assert report["human_checks_required"] == []
    assert "text_or_logo_vector_not_supplied" in report["warnings"]
    assert report["mask"]["source"] == "explicit-mask"


def test_missing_declarations_never_silently_pass(tmp_path: Path) -> None:
    image = _write_transparent_badge(tmp_path / "front.png")
    mask = _write_mask(tmp_path / "mask.png")

    report = validate_front_master(image, mask_path=mask, minimum_long_edge_px=256)

    assert report["decision"] == "needs_review"
    assert "confirm_front_orthographic_projection" in report["human_checks_required"]
    assert "confirm_no_cast_shadow_or_studio_floor" in report["human_checks_required"]


def test_edge_touching_foreground_is_rejected(tmp_path: Path) -> None:
    rgba = np.zeros((256, 256, 4), dtype=np.uint8)
    rgba[0:200, 20:230, :3] = 100
    rgba[0:200, 20:230, 3] = 255
    image = tmp_path / "edge.png"
    mask = tmp_path / "edge-mask.png"
    Image.fromarray(rgba, mode="RGBA").save(image)
    Image.fromarray(rgba[..., 3], mode="L").save(mask)

    report = validate_front_master(
        image,
        mask_path=mask,
        minimum_long_edge_px=256,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert report["decision"] == "reject_input"
    assert "foreground_touches_canvas_edge" in report["failures"]


def test_low_resolution_is_rejected(tmp_path: Path) -> None:
    image = _write_transparent_badge(tmp_path / "small.png", size=128, margin=16)
    mask = _write_mask(tmp_path / "small-mask.png", size=128, margin=16)

    report = validate_front_master(
        image,
        mask_path=mask,
        minimum_long_edge_px=2048,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert report["decision"] == "reject_input"
    assert "resolution_below_required_long_edge" in report["failures"]
