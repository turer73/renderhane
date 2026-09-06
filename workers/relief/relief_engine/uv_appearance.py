"""Deterministic, same-canvas UV appearance aids with no physical-Z claim."""
from __future__ import annotations

import hashlib
import math
import os
import re
import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Mapping

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from .image_ops import load_grayscale
from .models import (
    MAX_SOURCE_FILE_BYTES,
    canonical_json_bytes,
    sha256_file,
    validate_image_dimensions,
    validate_source_file,
)

ENGINE_VERSION = "uv-appearance-v0.2.0"
SCHEMA_VERSION = 1
MAX_PIXELS = 4_194_304
_SHA = re.compile(r"^[0-9a-f]{64}$")
_PRESET = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_LIGHT = np.asarray((-0.45, -0.55, 0.705), dtype=np.float64)
_LIGHT /= np.linalg.norm(_LIGHT)

DEFAULT_SPEC: dict[str, Any] = {
    "schema_version": 1,
    "shading": {
        "normal_strength": 0.8,
        "macro_radius_mm": 1.5,
        "detail_radius_mm": 0.35,
        "diffuse_strength": 0.22,
        "cavity_strength": 0.12,
        "curvature_strength": 0.06,
        "minimum_linear_gain": 0.72,
        "maximum_linear_gain": 1.18,
    },
    "color_management": {
        "output_icc_profile_sha256": None,
        "rendering_intent": "relative_colorimetric",
        "black_point_compensation": False,
        "rip_preset_id": None,
    },
    "white": {"underbase_mode": "not_specified", "choke_mm": None, "rip_preset_id": None},
    "varnish": {"mode": "appearance_only", "threshold": 0.55, "rip_preset_id": None, "pass_count": None},
    "measurement": {
        "viewing_condition": "ISO_3664:2025_D50",
        "spectral_condition": "ISO_13655_M1",
        "status": "not_calibrated",
    },
}


def _number(value: Any, name: str, low: float, high: float) -> float:
    if type(value) not in (int, float):
        raise TypeError(f"{name} must be a finite number")
    result = float(value)
    if not math.isfinite(result) or not low <= result <= high:
        raise ValueError(f"{name} must be between {low:g} and {high:g}")
    return result


def _object(value: Any, fields: set[str], name: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{name} has an invalid contract")
    return value


def _preset(value: Any, name: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not _PRESET.fullmatch(value):
        raise ValueError(f"{name} must be null or a safe preset identifier")
    return value


def normalize_spec(spec: Mapping[str, Any] | None = None) -> dict[str, Any]:
    """Reject unknown fields and retain only bounded, uncalibrated controls."""
    root = _object(
        DEFAULT_SPEC if spec is None else spec,
        {"schema_version", "shading", "color_management", "white", "varnish", "measurement"},
        "appearance spec",
    )
    if root["schema_version"] != SCHEMA_VERSION:
        raise ValueError("unsupported appearance spec schema_version")
    raw = _object(
        root["shading"],
        {
            "normal_strength", "macro_radius_mm", "detail_radius_mm", "diffuse_strength",
            "cavity_strength", "curvature_strength", "minimum_linear_gain", "maximum_linear_gain",
        },
        "appearance shading",
    )
    shading = {
        "normal_strength": _number(raw["normal_strength"], "normal_strength", 0, 4),
        "macro_radius_mm": _number(raw["macro_radius_mm"], "macro_radius_mm", 0.01, 100),
        "detail_radius_mm": _number(raw["detail_radius_mm"], "detail_radius_mm", 0.01, 100),
        "diffuse_strength": _number(raw["diffuse_strength"], "diffuse_strength", 0, 1),
        "cavity_strength": _number(raw["cavity_strength"], "cavity_strength", 0, 1),
        "curvature_strength": _number(raw["curvature_strength"], "curvature_strength", 0, 1),
        "minimum_linear_gain": _number(raw["minimum_linear_gain"], "minimum_linear_gain", 0.25, 1),
        "maximum_linear_gain": _number(raw["maximum_linear_gain"], "maximum_linear_gain", 1, 2),
    }
    if shading["detail_radius_mm"] > shading["macro_radius_mm"]:
        raise ValueError("detail_radius_mm must not exceed macro_radius_mm")
    color = _object(
        root["color_management"],
        {"output_icc_profile_sha256", "rendering_intent", "black_point_compensation", "rip_preset_id"},
        "appearance color_management",
    )
    profile = color["output_icc_profile_sha256"]
    if profile is not None and (not isinstance(profile, str) or not _SHA.fullmatch(profile)):
        raise ValueError("output_icc_profile_sha256 must be null or a lowercase SHA-256")
    if color["rendering_intent"] not in {"relative_colorimetric", "perceptual"}:
        raise ValueError("invalid color_management")
    if type(color["black_point_compensation"]) is not bool:
        raise ValueError("invalid color_management")
    white = _object(root["white"], {"underbase_mode", "choke_mm", "rip_preset_id"}, "appearance white")
    if white["underbase_mode"] not in {"not_specified", "rip_generated"}:
        raise ValueError("unsupported underbase_mode")
    choke = white["choke_mm"]
    if choke is not None:
        choke = _number(choke, "choke_mm", 0, 5)
    varnish = _object(root["varnish"], {"mode", "threshold", "rip_preset_id", "pass_count"}, "appearance varnish")
    if varnish["mode"] != "appearance_only":
        raise ValueError("invalid appearance varnish")
    if varnish["pass_count"] is not None and (
        type(varnish["pass_count"]) is not int or not 1 <= varnish["pass_count"] <= 32
    ):
        raise ValueError("invalid appearance varnish")
    measurement = _object(root["measurement"], {"viewing_condition", "spectral_condition", "status"}, "appearance measurement")
    if measurement != DEFAULT_SPEC["measurement"]:
        raise ValueError("appearance measurement must remain uncalibrated ISO placeholders")
    return {
        "schema_version": 1,
        "shading": shading,
        "color_management": {
            "output_icc_profile_sha256": profile,
            "rendering_intent": color["rendering_intent"],
            "black_point_compensation": color["black_point_compensation"],
            "rip_preset_id": _preset(color["rip_preset_id"], "color_management.rip_preset_id"),
        },
        "white": {"underbase_mode": white["underbase_mode"], "choke_mm": choke, "rip_preset_id": _preset(white["rip_preset_id"], "white.rip_preset_id")},
        "varnish": {"mode": "appearance_only", "threshold": _number(varnish["threshold"], "varnish.threshold", 0, 1), "rip_preset_id": _preset(varnish["rip_preset_id"], "varnish.rip_preset_id"), "pass_count": varnish["pass_count"]},
        "measurement": dict(measurement),
    }


def _load_png(path: Path, label: str, mode: str) -> np.ndarray:
    if path.is_symlink():
        raise ValueError(f"{label} symlinks are not accepted")
    validate_source_file(path)
    if path.stat().st_size > MAX_SOURCE_FILE_BYTES:
        raise ValueError(f"{label} exceeds the safe file-size limit")
    with Image.open(path) as image:
        validate_image_dimensions(image, label)
        if image.format != "PNG" or getattr(image, "n_frames", 1) != 1 or image.mode != mode:
            raise ValueError(f"{label} must be a single-frame {mode} PNG")
        if "transparency" in image.info:
            raise ValueError(f"{label} must not use colour-key transparency")
        image.load()
        return np.asarray(image, dtype=np.uint8)


def _silhouette(path: Path) -> np.ndarray:
    mask = _load_png(path, "silhouette mask", "L")
    if np.any((mask != 0) & (mask != 255)):
        raise ValueError("silhouette mask must contain only 0 or 255")
    active = mask == 255
    if not np.any(active):
        raise ValueError("silhouette mask must contain an active pixel")
    return active


def _artwork(path: Path) -> tuple[np.ndarray, str]:
    """Load only canonical RGB/RGBA artwork; alpha never substitutes for a mask."""
    if path.is_symlink():
        raise ValueError("UV artwork symlinks are not accepted")
    validate_source_file(path)
    if path.stat().st_size > MAX_SOURCE_FILE_BYTES:
        raise ValueError("UV artwork exceeds the safe file-size limit")
    with Image.open(path) as image:
        validate_image_dimensions(image, "UV artwork")
        if image.format != "PNG" or getattr(image, "n_frames", 1) != 1:
            raise ValueError("UV artwork must be a single-frame PNG")
        if image.mode not in {"RGB", "RGBA"}:
            raise ValueError("UV artwork must be a single-frame RGB or RGBA PNG")
        if image.mode == "RGB" and "transparency" in image.info:
            raise ValueError("RGB UV artwork must not use colour-key transparency")
        image.load()
        return np.asarray(image, dtype=np.uint8), image.mode


def _png(array: np.ndarray, mode: str) -> bytes:
    buffer = BytesIO()
    image = Image.fromarray(array)
    if image.mode != mode:
        raise ValueError(f"internal PNG mode mismatch: expected {mode}")
    image.save(buffer, format="PNG", optimize=False)
    return buffer.getvalue()


def _write(path: Path, payload: bytes) -> None:
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        if os.name == "posix":
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        if temporary.exists():
            temporary.unlink()


def _linear(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float64) / 255
    return np.where(values <= 0.04045, values / 12.92, ((values + 0.055) / 1.055) ** 2.4)


def _srgb(values: np.ndarray) -> np.ndarray:
    values = np.clip(values, 0, 1)
    values = np.where(values <= 0.0031308, values * 12.92, 1.055 * values ** (1 / 2.4) - 0.055)
    return np.rint(np.clip(values, 0, 1) * 255).astype(np.uint8)


def _masked_derivative(values: np.ndarray, active: np.ndarray, spacing: float, axis: int) -> np.ndarray:
    """Use only active neighbours; never derive a slope through the silhouette."""
    before_values = np.zeros_like(values)
    after_values = np.zeros_like(values)
    before_active = np.zeros_like(active)
    after_active = np.zeros_like(active)
    if axis == 0:
        before_values[1:] = values[:-1]
        after_values[:-1] = values[1:]
        before_active[1:] = active[:-1]
        after_active[:-1] = active[1:]
    else:
        before_values[:, 1:] = values[:, :-1]
        after_values[:, :-1] = values[:, 1:]
        before_active[:, 1:] = active[:, :-1]
        after_active[:, :-1] = active[:, 1:]
    derivative = np.zeros_like(values)
    central = active & before_active & after_active
    forward = active & after_active & ~before_active
    backward = active & before_active & ~after_active
    derivative[central] = (after_values[central] - before_values[central]) / (2 * spacing)
    derivative[forward] = (after_values[forward] - values[forward]) / spacing
    derivative[backward] = (values[backward] - before_values[backward]) / spacing
    return derivative


def _masked_gaussian(values: np.ndarray, active: np.ndarray, sigma: tuple[float, float]) -> np.ndarray:
    """Normalized convolution so inactive canvas pixels cannot bleed into the shape."""
    weight = active.astype(np.float64)
    denominator = gaussian_filter(weight, sigma=sigma, mode="constant", cval=0.0)
    numerator = gaussian_filter(values * weight, sigma=sigma, mode="constant", cval=0.0)
    return np.divide(numerator, denominator, out=np.zeros_like(values), where=denominator > 1e-12)


def _signed_shading(gain: np.ndarray, active: np.ndarray, shading: Mapping[str, float]) -> np.ndarray:
    """Encode signed gain, with exactly 32768 reserved for visually neutral gain 1."""
    image = np.full(gain.shape, 32768, dtype=np.uint16)
    lower = active & (gain < 1)
    upper = active & (gain > 1)
    image[lower] = np.rint(32768 + (gain[lower] - 1) / (1 - shading["minimum_linear_gain"]) * 32768).astype(np.uint16)
    image[upper] = np.rint(32768 + (gain[upper] - 1) / (shading["maximum_linear_gain"] - 1) * 32767).astype(np.uint16)
    return image


def _metric(value: float) -> float:
    return round(float(value), 9)


def build_uv_appearance(
    relief_map_path: Path,
    uv_artwork_path: Path,
    silhouette_mask_path: Path,
    output_dir: Path,
    *,
    physical_width_mm: float,
    physical_height_mm: float,
    relief_depth_mm: float,
    spec: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Create bounded visual aids without resampling, warping, or a physical-Z result claim."""
    width_mm = _number(physical_width_mm, "physical_width_mm", 0.01, 1000)
    height_mm = _number(physical_height_mm, "physical_height_mm", 0.01, 1000)
    depth_mm = _number(relief_depth_mm, "relief_depth_mm", 0.001, 100)
    contract = normalize_spec(spec)
    if relief_map_path.is_symlink():
        raise ValueError("relief map symlinks are not accepted")
    codes = load_grayscale(relief_map_path, require_unsigned_16bit=True)
    artwork, artwork_mode = _artwork(uv_artwork_path)
    active = _silhouette(silhouette_mask_path)
    if codes.shape != artwork.shape[:2] or codes.shape != active.shape:
        raise ValueError("relief map, UV artwork and silhouette mask must share the exact source canvas")
    rows, cols = codes.shape
    if codes.size > MAX_PIXELS:
        raise ValueError("appearance canvas exceeds the safe resource limit")
    if artwork_mode == "RGBA":
        alpha = artwork[:, :, 3]
        if np.any((alpha != 0) & (alpha != 255)):
            raise ValueError("RGBA artwork alpha must contain only 0 or 255")
        if not np.array_equal(alpha == 255, active):
            raise ValueError("RGBA artwork alpha coverage must exactly match the explicit silhouette mask")
        alpha_policy = "binary_alpha_must_exactly_match_explicit_silhouette; alpha_preserved"
    else:
        alpha_policy = "no_alpha_channel"
    normalized_height = codes.astype(np.float64) / 65535
    height = depth_mm * normalized_height
    pitch_x, pitch_y = width_mm / cols, height_mm / rows
    shade = contract["shading"]
    dx = _masked_derivative(height, active, pitch_x, axis=1)
    dy = _masked_derivative(height, active, pitch_y, axis=0)
    normal = np.stack((-dx * shade["normal_strength"], -dy * shade["normal_strength"], np.ones_like(height)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    normal[~active] = (0.0, 0.0, 1.0)
    macro = _masked_gaussian(height, active, (shade["macro_radius_mm"] / pitch_y, shade["macro_radius_mm"] / pitch_x))
    fine = _masked_gaussian(height, active, (shade["detail_radius_mm"] / pitch_y, shade["detail_radius_mm"] / pitch_x))
    active_heights = height[active]
    surface_range = float(active_heights.max() - active_heights.min())
    signal = max(surface_range, depth_mm / 65535)
    cavity = np.zeros_like(height)
    curvature = np.zeros_like(height)
    cavity[active] = np.clip((macro[active] - height[active]) / signal, 0, 1)
    curvature[active] = np.clip(np.abs(height[active] - fine[active]) / signal, 0, 1)
    gain = np.ones_like(height)
    gain[active] = 1 + (
        shade["diffuse_strength"] * (np.einsum("ijk,k->ij", normal, _LIGHT)[active] - float(_LIGHT[2]))
        - shade["cavity_strength"] * cavity[active]
        - shade["curvature_strength"] * curvature[active]
    )
    gain[active] = np.clip(gain[active], shade["minimum_linear_gain"], shade["maximum_linear_gain"])
    linear = _linear(artwork[:, :, :3])
    adjusted_linear = linear * gain[:, :, None]
    linear_clipped_pixels = int(np.count_nonzero(active & np.any((adjusted_linear < 0) | (adjusted_linear > 1), axis=2)))
    enhanced = artwork.copy()
    changed = active & (gain != 1)
    enhanced[changed, :3] = _srgb(adjusted_linear[changed])
    out_of_mask_changed_pixels = int(
        np.count_nonzero(np.any(enhanced[~active] != artwork[~active], axis=1))
    )
    normal_image = np.rint(np.clip((normal + 1) * 0.5, 0, 1) * 255).astype(np.uint8)
    shading_image = _signed_shading(gain, active, shade)
    varnish_image = np.where(active & (normalized_height >= contract["varnish"]["threshold"]) & (gain >= 1), 255, 0).astype(np.uint8)
    slope = np.hypot(dx, dy)
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "depth_enhanced_artwork": output_dir / "uv-artwork-depth-enhanced.png",
        "shading_map": output_dir / "shading-map-16.png",
        "appearance_normal": output_dir / "appearance-normal.png",
        "appearance_varnish_mask": output_dir / "appearance-varnish-mask.png",
        "job_ticket": output_dir / "uv-appearance-job-ticket.json",
    }
    if any(path.exists() or path.is_symlink() for path in paths.values()):
        raise FileExistsError("appearance output paths must be new and non-linked")
    payloads = {
        "depth_enhanced_artwork": _png(enhanced, artwork_mode),
        "shading_map": _png(shading_image, "I;16"),
        "appearance_normal": _png(normal_image, "RGB"),
        "appearance_varnish_mask": _png(varnish_image, "L"),
    }
    for name, payload in payloads.items():
        _write(paths[name], payload)
    artifacts = {
        name: {"file": paths[name].name, "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
        for name, payload in sorted(payloads.items())
    }
    ticket = {
        "schema_version": 1,
        "engine": ENGINE_VERSION,
        "appearance_status": "not_calibrated",
        "physical_z_mm": None,
        "braille_status": "not_requested",
        "alignment_policy": "exact_canvas_no_resize_no_warp",
        "artwork_up_axis": "-y",
        "orientation_contract": "fixed_top_left_light_is_bound_to_artwork_up_axis; recompile_after_rotation",
        "light": {"direction": "fixed_top_left", "vector": [_metric(value) for value in _LIGHT]},
        "physical_canvas_mm": [width_mm, height_mm],
        "relief_depth_mm": depth_mm,
        "canvas_px": [cols, rows],
        "pixel_pitch_mm": [pitch_x, pitch_y],
        "source_artwork_mode": artwork_mode,
        "output_artwork_mode": artwork_mode,
        "alpha_policy": alpha_policy,
        "source": {"relief_map_sha256": sha256_file(relief_map_path), "uv_artwork_sha256": sha256_file(uv_artwork_path), "silhouette_mask_sha256": sha256_file(silhouette_mask_path)},
        "spec": contract,
        "artifacts": artifacts,
        "shading_map_encoding": "signed_linear_gain; neutral_gain_1_is_uint16_32768",
        "surface_height_range_mm": _metric(surface_range),
        "slope_diagnostic_mm_per_mm": {"p95": _metric(np.percentile(slope[active], 95)), "max": _metric(slope[active].max())},
        "out_of_mask_changed_pixels": out_of_mask_changed_pixels,
        "linear_clipped_pixels": linear_clipped_pixels,
        "printer_profile_max_surface_variation_mm": None,
        "uneven_surface_validation_status": "not_validated",
        "limitations": [
            "Appearance-only shading does not modify or validate physical relief geometry.",
            "Varnish output is a suggested appearance mask, not ink-thickness, head-clearance or braille evidence.",
            "Steep slopes and vertical surfaces require printer-profile validation; no universal surface-variation gate is applied.",
            "Rotate artwork only before this stage and recompile the assist, or the fixed-light cue can invert perceived convexity.",
            "ICC, RIP, white-underbase and measurement fields are uncalibrated placeholders until a physical coupon is measured.",
        ],
    }
    _write(paths["job_ticket"], canonical_json_bytes(ticket) + b"\n")
    return ticket
