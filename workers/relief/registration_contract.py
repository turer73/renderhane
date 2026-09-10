from __future__ import annotations

import hashlib
import math
from pathlib import Path
from typing import Any

from PIL import Image

REGISTRATION_SCHEMA_VERSION = 2
MIN_VERIFICATION_LONG_EDGE_PX = 1120


def verification_canvas_size(
    physical_width_mm: float,
    physical_height_mm: float,
    *,
    long_edge_px: int = MIN_VERIFICATION_LONG_EDGE_PX,
) -> tuple[int, int]:
    if not math.isfinite(physical_width_mm) or physical_width_mm <= 0:
        raise ValueError("physical_width_mm must be finite and positive")
    if not math.isfinite(physical_height_mm) or physical_height_mm <= 0:
        raise ValueError("physical_height_mm must be finite and positive")
    if long_edge_px < 64:
        raise ValueError("verification long edge must be at least 64 pixels")
    if physical_width_mm >= physical_height_mm:
        width = long_edge_px
        height = max(1, round(long_edge_px * physical_height_mm / physical_width_mm))
    else:
        height = long_edge_px
        width = max(1, round(long_edge_px * physical_width_mm / physical_height_mm))
    return int(width), int(height)


def model_mm_to_svg_transform(
    physical_width_mm: float,
    physical_height_mm: float,
) -> list[list[float]]:
    return _rounded_matrix(
        [
            [1.0, 0.0, physical_width_mm / 2.0],
            [0.0, -1.0, physical_height_mm / 2.0],
            [0.0, 0.0, 1.0],
        ]
    )


def _rounded_matrix(rows: list[list[float]]) -> list[list[float]]:
    return [[round(float(value), 12) for value in row] for row in rows]


def _colour_contract(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {
            "source_present": False,
            "source_assignment": "not_applicable",
            "output_space": "sRGB",
            "alpha_mode": "not_applicable",
        }
    with Image.open(path) as image:
        info = dict(image.info)
        mode = image.mode
    icc = info.get("icc_profile")
    if isinstance(icc, str):
        icc = icc.encode("latin-1", errors="ignore")
    return {
        "source_present": True,
        "source_mode": mode,
        "embedded_icc": bool(icc),
        "embedded_icc_sha256": hashlib.sha256(icc).hexdigest() if icc else None,
        "srgb_chunk_present": "srgb" in {str(key).lower() for key in info},
        "gamma_chunk": float(info["gamma"]) if "gamma" in info else None,
        "source_assignment": "embedded_icc" if icc else "assumed_srgb_unprofiled",
        "output_space": "sRGB",
        "conversion": "source_pixels_preserved_no_rip_conversion",
        "alpha_mode": "straight_unassociated" if "A" in mode else "opaque",
    }


def build_registration_contract(
    *,
    source_canvas_px: tuple[int, int],
    crop_box_px: tuple[int, int, int, int],
    physical_width_mm: float,
    physical_height_mm: float,
    contour: dict[str, Any],
    verification_canvas_px: tuple[int, int],
    recipe: Any,
    uv_artwork_path: Path | None,
) -> dict[str, Any]:
    source_width, source_height = source_canvas_px
    left, top, right, bottom = crop_box_px
    crop_width = right - left
    crop_height = bottom - top
    verification_width, verification_height = verification_canvas_px
    if source_width <= 0 or source_height <= 0:
        raise ValueError("source canvas must be positive")
    if not (0 <= left < right <= source_width and 0 <= top < bottom <= source_height):
        raise ValueError("crop box is outside the source canvas")
    if verification_width <= 0 or verification_height <= 0:
        raise ValueError("verification canvas must be positive")
    if not math.isfinite(physical_width_mm) or physical_width_mm <= 0:
        raise ValueError("physical width must be finite and positive")
    if not math.isfinite(physical_height_mm) or physical_height_mm <= 0:
        raise ValueError("physical height must be finite and positive")

    artwork_pitch_x = physical_width_mm / crop_width
    artwork_pitch_y = physical_height_mm / crop_height
    verification_pitch_x = physical_width_mm / verification_width
    verification_pitch_y = physical_height_mm / verification_height
    expanded_digital_uncertainty = math.hypot(
        verification_pitch_x,
        verification_pitch_y,
    )

    source_scale_x = physical_width_mm / crop_width
    source_scale_y = physical_height_mm / crop_height
    source_to_model = _rounded_matrix(
        [
            [source_scale_x, 0.0, 0.0, -physical_width_mm / 2.0 - left * source_scale_x],
            [0.0, -source_scale_y, 0.0, physical_height_mm / 2.0 + top * source_scale_y],
            [0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0],
        ]
    )
    model_to_artwork = _rounded_matrix(
        [
            [crop_width / physical_width_mm, 0.0, crop_width / 2.0],
            [0.0, -crop_height / physical_height_mm, crop_height / 2.0],
            [0.0, 0.0, 1.0],
        ]
    )
    model_to_verification = _rounded_matrix(
        [
            [verification_width / physical_width_mm, 0.0, verification_width / 2.0],
            [0.0, -verification_height / physical_height_mm, verification_height / 2.0],
            [0.0, 0.0, 1.0],
        ]
    )
    model_to_svg = model_mm_to_svg_transform(physical_width_mm, physical_height_mm)

    source_aspect = crop_width / crop_height
    physical_aspect = physical_width_mm / physical_height_mm
    aspect_error = abs(physical_aspect / source_aspect - 1.0)
    scale_policy = (
        "preserve_aspect_no_independent_xy_scaling"
        if aspect_error <= 1e-6
        else "explicit_physical_canvas_xy_scaling"
    )
    base_thickness_mm = float(getattr(recipe, "base_thickness_mm"))
    relief_depth_mm = float(getattr(recipe, "relief_depth_mm"))
    grid_long_edge = int(getattr(recipe, "grid_long_edge"))
    if crop_width >= crop_height:
        grid_cols = grid_long_edge
        grid_rows = max(3, int(round(grid_long_edge * crop_height / crop_width)))
    else:
        grid_rows = grid_long_edge
        grid_cols = max(3, int(round(grid_long_edge * crop_width / crop_height)))

    contract = {
        "schema_version": REGISTRATION_SCHEMA_VERSION,
        "coordinate_system": "front-view-top-left-raster-model-centred",
        "source_canvas_px": [source_width, source_height],
        "crop_box_px": [left, top, right, bottom],
        "artwork_canvas_px": [crop_width, crop_height],
        "verification_canvas_px": [verification_width, verification_height],
        "physical_canvas_mm": [
            round(physical_width_mm, 6),
            round(physical_height_mm, 6),
        ],
        "pixel_pitch_mm": [
            round(artwork_pitch_x, 10),
            round(artwork_pitch_y, 10),
        ],
        "artwork_pixel_pitch_mm": [
            round(artwork_pitch_x, 10),
            round(artwork_pitch_y, 10),
        ],
        "verification_pixel_pitch_mm": [
            round(verification_pitch_x, 10),
            round(verification_pitch_y, 10),
        ],
        "recipe_model_envelope_mm": [
            [
                round(-physical_width_mm / 2.0, 6),
                round(-physical_height_mm / 2.0, 6),
                0.0,
            ],
            [
                round(physical_width_mm / 2.0, 6),
                round(physical_height_mm / 2.0, 6),
                round(base_thickness_mm + relief_depth_mm, 6),
            ],
        ],
        "model_frame": {
            "units": "millimetre",
            "origin": "physical_xy_centre_base_bottom",
            "x_axis": "right",
            "y_axis": "up",
            "z_axis": "toward_front_viewer",
            "camera": "orthographic_positive_z_looking_negative_z",
        },
        "raster_convention": {
            "coordinates": "pixel_edges",
            "sample_location_px": [0.5, 0.5],
            "row_axis": "down",
            "source_mask_resampler": "pillow_box_uint8_then_threshold_ge_128",
            "categorical_resampler": "nearest",
            "continuous_height_resampler": "bicubic",
            "alpha_mode": "straight_unassociated",
        },
        "transforms": {
            "source_pixel_edge_to_model_mm_4x4": source_to_model,
            "model_mm_to_artwork_pixel_edge_3x3": model_to_artwork,
            "model_mm_to_verification_pixel_edge_3x3": model_to_verification,
            "model_mm_to_svg_mm_3x3": model_to_svg,
        },
        "geometry_sampling": {
            "heightfield_grid_nodes_px": [grid_cols, grid_rows],
            "heightfield_cell_pitch_mm": [
                round(physical_width_mm / (grid_cols - 1), 10),
                round(physical_height_mm / (grid_rows - 1), 10),
            ],
            "registration_policy": (
                "measured_final_geometry; low resolution never widens tolerance and may require review"
            ),
        },
        "depth_encoding": {
            "format": "unsigned_16_bit_png",
            "normalised_value": "sample_integer_divided_by_65535",
            "physical_height_mm": "base_thickness_mm + normalised_value * relief_depth_mm",
            "base_thickness_mm": round(base_thickness_mm, 6),
            "relief_depth_mm": round(relief_depth_mm, 6),
            "gamma": round(float(getattr(recipe, "gamma")), 10),
            "invert_depth": bool(getattr(recipe, "invert_depth")),
            "normalization_mode": str(getattr(recipe, "normalization_mode")),
        },
        "scale_policy": scale_policy,
        "source_to_physical_aspect_relative_error": round(aspect_error, 12),
        "mirror_for_print": False,
        "contour": contour,
        "layer_intents": {
            "uv_artwork": {
                "role": "manufacturing_colour_artwork",
                "geometry_binding": "declared_shared_canvas_not_geometry_verified",
                "verification_status": "metadata_and_derivation_only",
            },
            "white_mask": {
                "role": "underbase_ink_coverage",
                "geometry_binding": "declared_shared_canvas_not_geometry_verified",
                "verification_status": "metadata_and_derivation_only",
            },
            "varnish_mask": {
                "role": "spot_varnish_coverage",
                "geometry_binding": "declared_shared_canvas_not_geometry_verified",
                "verification_status": "metadata_and_derivation_only",
            },
            "cut_contour": {
                "role": "physical_cut_path",
                "geometry_binding": "derived_from_final_glb_front_projection",
            },
        },
        "colour_management": _colour_contract(uv_artwork_path),
        "uncertainty_budget": {
            "scope": "digital_raster_registration_only",
            "expanded_digital_uncertainty_mm": round(expanded_digital_uncertainty, 10),
            "basis": (
                "one verification-pixel diagonal for raster edge localisation; mesh "
                "discretisation remains a measured geometry difference, not hidden uncertainty"
            ),
            "physical_printer_rip_material_uncertainty": "pending_measurement",
            "production_approval": False,
        },
        "notice": (
            "Artwork and final geometry share this declared front-view transform. "
            "The final GLB is independently rasterised for the digital gate. RIP colour "
            "conversion and printer/material registration still require physical calibration."
        ),
    }
    validate_registration_contract(contract)
    return contract


def validate_registration_contract(contract: dict[str, Any]) -> None:
    if contract.get("schema_version") != REGISTRATION_SCHEMA_VERSION:
        raise ValueError("unsupported registration schema version")
    for key in ("source_canvas_px", "artwork_canvas_px", "verification_canvas_px"):
        value = contract.get(key)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f"registration field {key} must contain two values")
        if any(not isinstance(item, int) or item <= 0 for item in value):
            raise ValueError(f"registration field {key} must be positive integers")
    crop = contract.get("crop_box_px")
    if not isinstance(crop, list) or len(crop) != 4:
        raise ValueError("registration crop_box_px must contain four values")
    source_width, source_height = contract["source_canvas_px"]
    left, top, right, bottom = crop
    if not all(isinstance(value, int) for value in crop):
        raise ValueError("registration crop values must be integers")
    if not (0 <= left < right <= source_width and 0 <= top < bottom <= source_height):
        raise ValueError("registration crop is outside the source canvas")
    if contract["artwork_canvas_px"] != [right - left, bottom - top]:
        raise ValueError("registration artwork canvas does not match crop")
    for key in ("physical_canvas_mm", "verification_pixel_pitch_mm"):
        value = contract.get(key)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f"registration field {key} must contain two values")
        if any(not isinstance(item, (int, float)) or not math.isfinite(item) or item <= 0 for item in value):
            raise ValueError(f"registration field {key} must be finite and positive")
    transforms = contract.get("transforms")
    if not isinstance(transforms, dict):
        raise ValueError("registration transforms are missing")
    shapes = {
        "source_pixel_edge_to_model_mm_4x4": (4, 4),
        "model_mm_to_artwork_pixel_edge_3x3": (3, 3),
        "model_mm_to_verification_pixel_edge_3x3": (3, 3),
        "model_mm_to_svg_mm_3x3": (3, 3),
    }
    for key, (row_count, column_count) in shapes.items():
        matrix = transforms.get(key)
        if not isinstance(matrix, list) or len(matrix) != row_count:
            raise ValueError(f"registration transform {key} has an invalid shape")
        for row in matrix:
            if not isinstance(row, list) or len(row) != column_count:
                raise ValueError(f"registration transform {key} has an invalid shape")
            if any(not isinstance(item, (int, float)) or not math.isfinite(item) for item in row):
                raise ValueError(f"registration transform {key} contains non-finite values")
    uncertainty = contract.get("uncertainty_budget")
    expanded = uncertainty.get("expanded_digital_uncertainty_mm") if isinstance(uncertainty, dict) else None
    if not isinstance(expanded, (int, float)) or not math.isfinite(expanded) or expanded < 0:
        raise ValueError("registration digital uncertainty is invalid")
    if uncertainty.get("production_approval") is not False:
        raise ValueError("digital registration contract cannot grant production approval")


def expanded_digital_uncertainty_mm(contract: dict[str, Any]) -> float:
    validate_registration_contract(contract)
    return float(contract["uncertainty_budget"]["expanded_digital_uncertainty_mm"])
