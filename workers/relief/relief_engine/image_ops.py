"""Input validation, raster normalization and aligned artwork transforms."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from .models import (
    BuildRecipe,
    NormalizationMode,
    ShapeMode,
    is_canonical_unsigned_16bit_png,
    validate_image_dimensions,
    validate_source_file,
)


def load_grayscale(path: Path, *, require_unsigned_16bit: bool = False) -> np.ndarray:
    validate_source_file(path)
    with Image.open(path) as image:
        validate_image_dimensions(image, "Relief map")
        canonical_unsigned_16bit_png = is_canonical_unsigned_16bit_png(path, image)
        if require_unsigned_16bit and not canonical_unsigned_16bit_png:
            raise ValueError(
                "canonical relief map must be an unsigned 16-bit grayscale PNG; "
                "use normalization_mode='robust' only for legacy candidate inputs"
            )
        if image.mode not in {"I;16", "I;16B", "I;16L", "I;16N", "I", "F", "L"}:
            image = image.convert("L")
        array = np.asarray(image)
    if array.ndim != 2:
        raise ValueError(f"Expected single-channel image, got shape {array.shape}")
    if require_unsigned_16bit and (
        not np.issubdtype(array.dtype, np.integer)
        or (array.size and (int(array.min()) < 0 or int(array.max()) > 65535))
    ):
        raise ValueError("canonical unsigned 16-bit PNG has out-of-range samples")
    array = array.astype(np.float32)
    if not np.isfinite(array).all():
        raise ValueError("Relief map contains NaN or infinite values")
    return array


def load_mask_at_source_size(path: Path | None, target_size: tuple[int, int]) -> np.ndarray | None:
    if path is None:
        return None
    validate_source_file(path)
    with Image.open(path) as image:
        validate_image_dimensions(image, "Mask")
        image = image.convert("L")
        if image.size != target_size:
            image = image.resize(target_size, Image.Resampling.LANCZOS)
        mask = np.asarray(image, dtype=np.float32) / 255.0
    mask = np.clip(mask, 0.0, 1.0)
    if not np.any(mask > 0.05):
        raise ValueError("Mask has no active pixels")
    return mask


def compute_crop_box(mask: np.ndarray | None, threshold: float, shape_mode: ShapeMode) -> tuple[int, int, int, int]:
    if mask is None or shape_mode == "rectangle":
        if mask is None:
            return (0, 0, 0, 0)
        height, width = mask.shape
        return (0, 0, width, height)

    active = mask >= threshold
    if not np.any(active):
        raise ValueError("Mask has no pixels above mask_threshold")
    ys, xs = np.nonzero(active)
    left = int(xs.min())
    top = int(ys.min())
    right = int(xs.max()) + 1
    bottom = int(ys.max()) + 1
    if right - left < 2 or bottom - top < 2:
        raise ValueError("Mask silhouette is too small")
    return (left, top, right, bottom)


def resize_float_map(
    array: np.ndarray,
    long_edge: int,
    *,
    normalization_mode: NormalizationMode = "robust",
) -> np.ndarray:
    height, width = array.shape
    scale = long_edge / max(width, height)
    new_width = max(2, int(round(width * scale)))
    new_height = max(2, int(round(height * scale)))

    if normalization_mode == "absolute":
        encoded = np.round(np.clip(array, 0.0, 65535.0)).astype(np.uint16)
    else:
        lo = float(array.min())
        hi = float(array.max())
        if math.isclose(lo, hi, rel_tol=0.0, abs_tol=1e-12):
            normalized = np.zeros_like(array, dtype=np.float32)
        else:
            normalized = (array - lo) / (hi - lo)
        encoded = np.round(normalized * 65535.0).astype(np.uint16)

    image = Image.fromarray(encoded)
    image = image.resize((new_width, new_height), Image.Resampling.BICUBIC)
    resized = np.asarray(image, dtype=np.float32) / 65535.0
    return np.clip(resized, 0.0, 1.0)


def resize_mask(mask: np.ndarray | None, target_size: tuple[int, int]) -> np.ndarray | None:
    if mask is None:
        return None
    image = Image.fromarray(np.round(mask * 255.0).astype(np.uint8))
    image = image.resize(target_size, Image.Resampling.LANCZOS)
    return np.clip(np.asarray(image, dtype=np.float32) / 255.0, 0.0, 1.0)


def normalize_relief(array: np.ndarray, recipe: BuildRecipe, mask: np.ndarray | None) -> np.ndarray:
    if mask is not None:
        active = mask > 0.05
        if not np.any(active):
            raise ValueError("Mask has no active pixels after resize")
        valid = array[active]
    else:
        active = np.ones_like(array, dtype=bool)
        valid = array.ravel()

    value_range = float(np.ptp(valid))
    if math.isclose(value_range, 0.0, rel_tol=0.0, abs_tol=1e-8):
        raise ValueError("Relief map has no usable dynamic range")

    if recipe.normalization_mode == "absolute":
        normalized = np.clip(array, 0.0, 1.0)
    else:
        low = float(np.percentile(valid, recipe.percentile_low))
        high = float(np.percentile(valid, recipe.percentile_high))
        if math.isclose(low, high, rel_tol=0.0, abs_tol=1e-8):
            raise ValueError("Relief map has no usable dynamic range after percentile clipping")
        normalized = np.clip((array - low) / (high - low), 0.0, 1.0)
    if recipe.invert_depth:
        normalized = 1.0 - normalized
    normalized = np.power(normalized, recipe.gamma, dtype=np.float32)

    if recipe.smoothing_sigma_px > 0:
        normalized = gaussian_filter(normalized, sigma=recipe.smoothing_sigma_px, mode="nearest")

    normalized = np.clip(normalized, 0.0, 1.0)
    if mask is not None:
        normalized *= mask

    peak = float(normalized[active].max())
    if peak <= 1e-8:
        raise ValueError("Relief map became flat after processing")
    if recipe.normalization_mode == "robust":
        normalized /= peak
    return np.clip(normalized, 0.0, 1.0).astype(np.float32, copy=False)


def save_relief_png(relief: np.ndarray, destination: Path) -> None:
    encoded = np.round(np.clip(relief, 0.0, 1.0) * 65535.0).astype(np.uint16)
    Image.fromarray(encoded).save(destination, optimize=False)


def save_height_preview(relief: np.ndarray, destination: Path) -> None:
    gy, gx = np.gradient(relief.astype(np.float32))
    detail_scale = 8.0
    nx = -gx * detail_scale
    ny = -gy * detail_scale
    nz = np.ones_like(relief, dtype=np.float32)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / norm, ny / norm, nz / norm
    light = np.asarray([-0.45, -0.55, 0.705], dtype=np.float32)
    light /= np.linalg.norm(light)
    shade = np.clip(nx * light[0] + ny * light[1] + nz * light[2], 0.0, 1.0)
    value = np.clip(0.20 + 0.62 * shade + 0.18 * relief, 0.0, 1.0)
    image = Image.fromarray(np.round(value * 255.0).astype(np.uint8), mode="L")
    image.thumbnail((768, 768), Image.Resampling.LANCZOS)
    image.save(destination, optimize=False)


def aligned_output_size(width_mm: float, height_mm: float, long_edge_px: int) -> tuple[int, int]:
    if width_mm >= height_mm:
        width_px = long_edge_px
        height_px = max(1, int(round(long_edge_px * height_mm / width_mm)))
    else:
        height_px = long_edge_px
        width_px = max(1, int(round(long_edge_px * width_mm / height_mm)))
    return width_px, height_px


def align_source_layer(
    source_path: Path,
    destination: Path,
    expected_source_size: tuple[int, int],
    source_extent_px: tuple[float, float, float, float],
    output_size: tuple[int, int],
    mask_like: bool,
) -> None:
    validate_source_file(source_path)
    with Image.open(source_path) as image:
        validate_image_dimensions(image, f"Aligned layer {source_path.name}")
        if image.size != expected_source_size:
            raise ValueError(
                f"Aligned layer {source_path.name} has canvas {image.size}; "
                f"expected {expected_source_size}"
            )
        if mask_like:
            image = image.convert("L")
        elif image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA")
        transformed = image.transform(
            output_size,
            Image.Transform.EXTENT,
            source_extent_px,
            resample=Image.Resampling.BICUBIC,
        )
        transformed.save(destination, optimize=False)
