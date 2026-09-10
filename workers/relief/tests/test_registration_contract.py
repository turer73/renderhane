from __future__ import annotations

import copy

import numpy as np
import pytest

from product_relief_builder import ProductRecipe
from registration_contract import (
    build_registration_contract,
    expanded_digital_uncertainty_mm,
    validate_registration_contract,
    verification_canvas_size,
)


def _apply(matrix: list[list[float]], vector: list[float]) -> np.ndarray:
    return np.asarray(matrix, dtype=np.float64) @ np.asarray(vector, dtype=np.float64)


def test_registration_v2_declares_invertible_pixel_and_model_frames() -> None:
    physical_width = 70.0
    physical_height = physical_width * 1400.0 / 1800.0
    verification_canvas = verification_canvas_size(
        physical_width,
        physical_height,
    )
    recipe = ProductRecipe(
        width_mm=physical_width,
        height_mm=physical_height,
        base_thickness_mm=3.0,
        relief_depth_mm=1.2,
        grid_long_edge=192,
    )
    contract = build_registration_contract(
        source_canvas_px=(2048, 2048),
        crop_box_px=(100, 200, 1900, 1600),
        physical_width_mm=physical_width,
        physical_height_mm=physical_height,
        contour={"source_mask_px": list(verification_canvas)},
        verification_canvas_px=verification_canvas,
        recipe=recipe,
        uv_artwork_path=None,
    )

    assert contract["schema_version"] == 2
    assert contract["verification_canvas_px"] == list(verification_canvas)
    assert contract["raster_convention"]["sample_location_px"] == [0.5, 0.5]
    assert contract["raster_convention"]["source_mask_resampler"] == (
        "pillow_box_uint8_then_threshold_ge_128"
    )
    assert contract["mirror_for_print"] is False
    assert contract["geometry_sampling"]["heightfield_grid_nodes_px"] == [192, 149]
    assert "expected_model_bounds_mm" not in contract
    assert "recipe_model_envelope_mm" in contract
    assert contract["uncertainty_budget"]["production_approval"] is False
    assert contract["layer_intents"]["cut_contour"]["geometry_binding"] == (
        "derived_from_final_glb_front_projection"
    )

    source_to_model = contract["transforms"]["source_pixel_edge_to_model_mm_4x4"]
    top_left = _apply(source_to_model, [100.0, 200.0, 0.0, 1.0])
    bottom_right = _apply(source_to_model, [1900.0, 1600.0, 0.0, 1.0])
    assert top_left[:2] == pytest.approx([-physical_width / 2, physical_height / 2])
    assert bottom_right[:2] == pytest.approx([physical_width / 2, -physical_height / 2])

    model_to_artwork = contract["transforms"]["model_mm_to_artwork_pixel_edge_3x3"]
    assert _apply(model_to_artwork, [-physical_width / 2, physical_height / 2, 1.0]) == pytest.approx(
        [0.0, 0.0, 1.0], abs=1e-9
    )
    interior_source = _apply(source_to_model, [123.5, 456.5, 0.0, 1.0])
    assert _apply(
        model_to_artwork,
        [interior_source[0], interior_source[1], 1.0],
    ) == pytest.approx([23.5, 256.5, 1.0], abs=1e-8)

    model_to_svg = contract["transforms"]["model_mm_to_svg_mm_3x3"]
    assert _apply(
        model_to_svg,
        [-physical_width / 2, physical_height / 2, 1.0],
    ) == pytest.approx([0.0, 0.0, 1.0], abs=1e-9)
    assert _apply(
        model_to_svg,
        [physical_width / 2, -physical_height / 2, 1.0],
    ) == pytest.approx([physical_width, physical_height, 1.0], abs=1e-9)
    assert expanded_digital_uncertainty_mm(contract) > 0


def test_registration_v2_rejects_spoofed_production_approval() -> None:
    recipe = ProductRecipe(width_mm=40.0, height_mm=30.0)
    contract = build_registration_contract(
        source_canvas_px=(400, 300),
        crop_box_px=(0, 0, 400, 300),
        physical_width_mm=40.0,
        physical_height_mm=30.0,
        contour={"source_mask_px": [1120, 840]},
        verification_canvas_px=(1120, 840),
        recipe=recipe,
        uv_artwork_path=None,
    )
    spoofed = copy.deepcopy(contract)
    spoofed["uncertainty_budget"]["production_approval"] = True

    with pytest.raises(ValueError, match="cannot grant production approval"):
        validate_registration_contract(spoofed)
