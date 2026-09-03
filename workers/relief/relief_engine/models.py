"""Data contracts, limits and deterministic utility functions for Relief Phase 0."""

from __future__ import annotations

import hashlib
import json
import math
import platform
from dataclasses import dataclass
from importlib import metadata as importlib_metadata
from pathlib import Path
from typing import Any, Literal

import numpy as np
from PIL import Image


ENGINE_NAME = "renderhane-relief-builder"
ENGINE_VERSION = "0.2.0-phase0"
REPORT_SCHEMA_VERSION = 2
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
MAX_SOURCE_PIXELS = 20_000_000
MAX_SOURCE_FILE_BYTES = 64 * 1024 * 1024

ShapeMode = Literal["rectangle", "silhouette"]


@dataclass(frozen=True)
class BuildRecipe:
    width_mm: float = 70.0
    height_mm: float | None = None
    base_thickness_mm: float = 3.0
    relief_depth_mm: float = 1.0
    percentile_low: float = 2.0
    percentile_high: float = 98.0
    gamma: float = 1.0
    smoothing_sigma_px: float = 1.0
    grid_long_edge: int = 256
    invert_depth: bool = False
    shape_mode: ShapeMode = "rectangle"
    mask_threshold: float = 0.5
    artwork_long_edge_px: int = 2048

    def validate(self) -> None:
        numeric = {
            "width_mm": self.width_mm,
            "height_mm": self.height_mm,
            "base_thickness_mm": self.base_thickness_mm,
            "relief_depth_mm": self.relief_depth_mm,
            "percentile_low": self.percentile_low,
            "percentile_high": self.percentile_high,
            "gamma": self.gamma,
            "smoothing_sigma_px": self.smoothing_sigma_px,
            "mask_threshold": self.mask_threshold,
            "artwork_long_edge_px": self.artwork_long_edge_px,
        }
        for name, value in numeric.items():
            if value is not None and not math.isfinite(float(value)):
                raise ValueError(f"{name} must be finite")

        if not 0 < self.width_mm <= 1000:
            raise ValueError("width_mm must be > 0 and <= 1000")
        if self.height_mm is not None and not 0 < self.height_mm <= 1000:
            raise ValueError("height_mm must be > 0 and <= 1000 when supplied")
        if not 0.8 <= self.base_thickness_mm <= 100:
            raise ValueError("base_thickness_mm must be between 0.8 and 100")
        if not 0 < self.relief_depth_mm <= 100:
            raise ValueError("relief_depth_mm must be > 0 and <= 100")
        if self.base_thickness_mm + self.relief_depth_mm > 150:
            raise ValueError("total model depth must be <= 150 mm")
        if not 0 <= self.percentile_low < self.percentile_high <= 100:
            raise ValueError("percentiles must satisfy 0 <= low < high <= 100")
        if self.gamma <= 0:
            raise ValueError("gamma must be > 0")
        if self.smoothing_sigma_px < 0:
            raise ValueError("smoothing_sigma_px must be >= 0")
        if not 16 <= self.grid_long_edge <= 512:
            raise ValueError("grid_long_edge must be between 16 and 512 in Phase 0")
        if self.shape_mode not in {"rectangle", "silhouette"}:
            raise ValueError("shape_mode must be rectangle or silhouette")
        if not 0.05 <= self.mask_threshold <= 0.95:
            raise ValueError("mask_threshold must be between 0.05 and 0.95")
        if not 256 <= self.artwork_long_edge_px <= 4096:
            raise ValueError("artwork_long_edge_px must be between 256 and 4096")


@dataclass
class MeshValidation:
    digital_status: str
    production_status: str
    physical_validation_required: bool
    claim_scope: str
    watertight: bool
    winding_consistent: bool
    is_volume: bool
    finite_geometry: bool
    connected_component_count: int
    self_intersection_check: str
    self_intersection_free_by_construction: bool
    euler_number: int
    vertex_count: int
    face_count: int
    degenerate_face_count: int
    extents_mm: list[float]
    bounds_mm: list[list[float]]
    volume_mm3: float
    min_z_mm: float
    max_z_mm: float
    back_plane_flatness_mm: float
    minimum_solid_thickness_mm: float
    actual_relief_min_mm: float
    actual_relief_max_mm: float
    open_edge_count: int | None
    warnings: list[str]
    advisories: list[str]
    limitations: list[str]


@dataclass
class BuildReport:
    schema_version: int
    engine: str
    engine_version: str
    environment: dict[str, str]
    source_sha256: str
    mask_sha256: str | None
    aligned_input_sha256: dict[str, str]
    recipe_sha256: str
    recipe: dict[str, Any]
    source_dimensions_px: list[int]
    source_image_info: dict[str, Any]
    source_crop_px: list[int]
    grid_dimensions_px: list[int]
    resolved_height_mm: float
    coordinate_system: dict[str, Any]
    relief_statistics: dict[str, float]
    validation: dict[str, Any]
    export_validation: dict[str, Any]
    artifacts: dict[str, dict[str, Any]]
    manifest_file: str
    package_file: str


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def dependency_versions() -> dict[str, str]:
    result = {"python": platform.python_version()}
    for distribution in ("numpy", "Pillow", "scipy", "trimesh"):
        try:
            result[distribution] = importlib_metadata.version(distribution)
        except importlib_metadata.PackageNotFoundError:
            result[distribution] = "unknown"
    return result


def validate_source_file(path: Path) -> None:
    if not path.is_file():
        raise ValueError(f"Input file does not exist: {path}")
    size = path.stat().st_size
    if size <= 0:
        raise ValueError(f"Input file is empty: {path}")
    if size > MAX_SOURCE_FILE_BYTES:
        raise ValueError(f"Input file exceeds {MAX_SOURCE_FILE_BYTES} bytes")


def validate_image_dimensions(image: Image.Image, label_name: str) -> tuple[int, int]:
    width, height = image.size
    if width < 2 or height < 2:
        raise ValueError(f"{label_name} must be at least 2 x 2 pixels")
    if width * height > MAX_SOURCE_PIXELS:
        raise ValueError(f"{label_name} exceeds {MAX_SOURCE_PIXELS} pixels")
    return width, height


def inspect_source_image(path: Path, array: np.ndarray) -> dict[str, Any]:
    with Image.open(path) as image:
        mode = image.mode
    storage_bits = {
        "L": 8,
        "I;16": 16,
        "I;16B": 16,
        "I;16L": 16,
        "I": 32,
        "F": 32,
    }.get(mode)
    unique_count = int(np.unique(array).size)
    effective_bits = int(math.ceil(math.log2(max(1, unique_count))))
    return {
        "pil_mode": mode,
        "storage_bits_per_sample": storage_bits,
        "unique_value_count": unique_count,
        "effective_precision_bits_estimate": effective_bits,
        "minimum_value": float(array.min()),
        "maximum_value": float(array.max()),
    }
