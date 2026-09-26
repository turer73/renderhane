"""Compile stable semantic labels into a physical, absolute relief height map.

The compiler is an upstream stage of the canonical heightfield mesh builder. It
does not infer semantics, resize inputs, or claim that an AI depth candidate is
ground truth. Semantic masks bound every region; physical millimetre parameters
bound every generated height.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Literal, Mapping

import numpy as np
from PIL import Image
from scipy import ndimage

from .image_ops import save_height_preview
from .models import (
    MAX_SOURCE_PIXELS,
    canonical_json_bytes,
    dependency_versions,
    sha256_file,
    validate_image_dimensions,
    validate_source_file,
)


SEMANTIC_ENGINE_VERSION = "semantic-relief-compiler-v0.2.0"
SEMANTIC_RECIPE_SCHEMA_VERSION = 1
SEMANTIC_REPORT_SCHEMA_VERSION = 1
MAX_REGIONS = 256
MAX_REGION_PIXEL_WORK = 33_554_432
MAX_REGION_NAME_LENGTH = 128
Profile = Literal["flat", "linear", "smoothstep", "convex"]


class SemanticReliefInputError(ValueError):
    """Raised when semantic inputs cannot be compiled without guessing."""


@dataclass(frozen=True)
class SemanticRegion:
    id: int
    name: str
    rank: int
    edge_height_mm: float
    plateau_height_mm: float
    bevel_width_mm: float
    profile: Profile
    candidate_weight: float
    detail_gain_mm: float


@dataclass(frozen=True)
class SemanticFilters:
    outer_bevel_width_mm: float
    candidate_low_percentile: float
    candidate_high_percentile: float
    candidate_low_pass_sigma_mm: float
    candidate_orientation: Literal["direct", "inverted"]
    detail_small_sigma_mm: float
    detail_large_sigma_mm: float
    detail_clip_percentile: float
    detail_orientation: Literal["direct", "inverted"]


def _finite_number(value: Any, name: str, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or type(value) not in (int, float):
        raise TypeError(f"{name} must be a finite number")
    converted = float(value)
    if not math.isfinite(converted) or not minimum <= converted <= maximum:
        raise SemanticReliefInputError(
            f"{name} must be finite and between {minimum:g} and {maximum:g}"
        )
    return converted


def _positive_dimension(value: Any, name: str) -> float:
    return _finite_number(value, name, minimum=1e-9, maximum=10_000.0)


def _parse_region(raw: Mapping[str, Any], relief_depth_mm: float) -> SemanticRegion:
    if not isinstance(raw, Mapping):
        raise SemanticReliefInputError("each semantic region must be an object")
    expected = {
        "id",
        "name",
        "rank",
        "edge_height_mm",
        "plateau_height_mm",
        "bevel_width_mm",
        "profile",
        "candidate_weight",
        "detail_gain_mm",
    }
    if set(raw) != expected:
        raise SemanticReliefInputError(
            f"semantic region fields must be exactly {sorted(expected)}"
        )
    region_id = raw["id"]
    rank = raw["rank"]
    name = raw["name"]
    profile = raw["profile"]
    if isinstance(region_id, bool) or not isinstance(region_id, int) or not 1 <= region_id <= 65535:
        raise SemanticReliefInputError("semantic region id must be an integer from 1 through 65535")
    if isinstance(rank, bool) or not isinstance(rank, int) or rank < 0:
        raise SemanticReliefInputError("semantic region rank must be a non-negative integer")
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > MAX_REGION_NAME_LENGTH:
        raise SemanticReliefInputError(
            f"semantic region name must contain 1..{MAX_REGION_NAME_LENGTH} characters"
        )
    if profile not in {"flat", "linear", "smoothstep", "convex"}:
        raise SemanticReliefInputError("semantic region profile is unsupported")
    edge = _finite_number(
        raw["edge_height_mm"],
        f"region {region_id} edge_height_mm",
        minimum=0.0,
        maximum=relief_depth_mm,
    )
    plateau = _finite_number(
        raw["plateau_height_mm"],
        f"region {region_id} plateau_height_mm",
        minimum=0.0,
        maximum=relief_depth_mm,
    )
    bevel = _finite_number(
        raw["bevel_width_mm"],
        f"region {region_id} bevel_width_mm",
        minimum=0.0,
        maximum=relief_depth_mm * 100.0,
    )
    candidate_weight = _finite_number(
        raw["candidate_weight"],
        f"region {region_id} candidate_weight",
        minimum=0.0,
        maximum=1.0,
    )
    detail_gain = _finite_number(
        raw["detail_gain_mm"],
        f"region {region_id} detail_gain_mm",
        minimum=0.0,
        maximum=relief_depth_mm,
    )
    if edge > plateau:
        raise SemanticReliefInputError(
            f"region {region_id} edge_height_mm must not exceed plateau_height_mm"
        )
    if profile == "flat" and not math.isclose(edge, plateau, abs_tol=1e-12):
        raise SemanticReliefInputError(
            f"region {region_id} flat profile requires equal edge and plateau heights"
        )
    if profile != "flat" and bevel <= 0:
        raise SemanticReliefInputError(
            f"region {region_id} non-flat profile requires bevel_width_mm > 0"
        )
    return SemanticRegion(
        id=region_id,
        name=name.strip(),
        rank=rank,
        edge_height_mm=edge,
        plateau_height_mm=plateau,
        bevel_width_mm=bevel,
        profile=profile,
        candidate_weight=candidate_weight,
        detail_gain_mm=detail_gain,
    )


def _parse_filters(raw: Mapping[str, Any], relief_depth_mm: float) -> SemanticFilters:
    if not isinstance(raw, Mapping):
        raise SemanticReliefInputError("semantic filters must be an object")
    expected = {
        "outer_bevel_width_mm",
        "candidate_low_percentile",
        "candidate_high_percentile",
        "candidate_low_pass_sigma_mm",
        "candidate_orientation",
        "detail_small_sigma_mm",
        "detail_large_sigma_mm",
        "detail_clip_percentile",
        "detail_orientation",
    }
    if set(raw) != expected:
        raise SemanticReliefInputError(
            f"semantic filters fields must be exactly {sorted(expected)}"
        )
    outer_bevel = _finite_number(
        raw["outer_bevel_width_mm"],
        "outer_bevel_width_mm",
        minimum=0.0,
        maximum=relief_depth_mm * 100.0,
    )
    candidate_low = _finite_number(
        raw["candidate_low_percentile"],
        "candidate_low_percentile",
        minimum=0.0,
        maximum=100.0,
    )
    candidate_high = _finite_number(
        raw["candidate_high_percentile"],
        "candidate_high_percentile",
        minimum=0.0,
        maximum=100.0,
    )
    if candidate_low >= candidate_high:
        raise SemanticReliefInputError(
            "candidate percentiles must satisfy low < high"
        )
    candidate_sigma = _finite_number(
        raw["candidate_low_pass_sigma_mm"],
        "candidate_low_pass_sigma_mm",
        minimum=0.0,
        maximum=1_000.0,
    )
    candidate_orientation = raw["candidate_orientation"]
    if candidate_orientation not in {"direct", "inverted"}:
        raise SemanticReliefInputError("candidate_orientation must be direct or inverted")
    detail_small = _finite_number(
        raw["detail_small_sigma_mm"],
        "detail_small_sigma_mm",
        minimum=0.0,
        maximum=1_000.0,
    )
    detail_large = _finite_number(
        raw["detail_large_sigma_mm"],
        "detail_large_sigma_mm",
        minimum=0.0,
        maximum=1_000.0,
    )
    if detail_large <= detail_small:
        raise SemanticReliefInputError(
            "detail_large_sigma_mm must be greater than detail_small_sigma_mm"
        )
    detail_clip = _finite_number(
        raw["detail_clip_percentile"],
        "detail_clip_percentile",
        minimum=50.0,
        maximum=100.0,
    )
    orientation = raw["detail_orientation"]
    if orientation not in {"direct", "inverted"}:
        raise SemanticReliefInputError("detail_orientation must be direct or inverted")
    return SemanticFilters(
        outer_bevel_width_mm=outer_bevel,
        candidate_low_percentile=candidate_low,
        candidate_high_percentile=candidate_high,
        candidate_low_pass_sigma_mm=candidate_sigma,
        candidate_orientation=candidate_orientation,
        detail_small_sigma_mm=detail_small,
        detail_large_sigma_mm=detail_large,
        detail_clip_percentile=detail_clip,
        detail_orientation=orientation,
    )


def _parse_recipe(
    manifest: Mapping[str, Any], relief_depth_mm: float
) -> tuple[list[SemanticRegion], SemanticFilters]:
    if set(manifest) != {"schema_version", "regions", "filters"}:
        raise SemanticReliefInputError(
            "semantic recipe must contain exactly schema_version, regions and filters"
        )
    if manifest["schema_version"] != SEMANTIC_RECIPE_SCHEMA_VERSION:
        raise SemanticReliefInputError("unsupported semantic recipe schema_version")
    raw_regions = manifest["regions"]
    if not isinstance(raw_regions, list) or not 1 <= len(raw_regions) <= MAX_REGIONS:
        raise SemanticReliefInputError(f"semantic recipe must declare 1..{MAX_REGIONS} regions")
    regions = [_parse_region(raw, relief_depth_mm) for raw in raw_regions]
    ids = [region.id for region in regions]
    ranks = [region.rank for region in regions]
    names = [region.name for region in regions]
    if len(set(ids)) != len(ids):
        raise SemanticReliefInputError("semantic region ids must be unique")
    if len(set(ranks)) != len(ranks):
        raise SemanticReliefInputError("semantic region ranks must be unique")
    if len(set(names)) != len(names):
        raise SemanticReliefInputError("semantic region names must be unique")
    ordered = sorted(regions, key=lambda region: region.rank)
    for back, front in zip(ordered, ordered[1:]):
        if front.edge_height_mm + 1e-12 < back.edge_height_mm:
            raise SemanticReliefInputError(
                "semantic edge heights must be non-decreasing with rank"
            )
        if front.plateau_height_mm + 1e-12 < back.plateau_height_mm:
            raise SemanticReliefInputError(
                "semantic plateau heights must be non-decreasing with rank"
            )
    raw_filters = manifest["filters"]
    if not isinstance(raw_filters, Mapping):
        raise TypeError("semantic filters must be an object")
    return sorted(regions, key=lambda region: region.id), _parse_filters(
        raw_filters, relief_depth_mm
    )


def _load_labels(path: Path) -> np.ndarray:
    validate_source_file(path)
    with Image.open(path) as image:
        validate_image_dimensions(image, "Semantic label map")
        if image.format != "PNG" or image.mode not in {"L", "I;16", "I;16B", "I;16L", "I;16N"}:
            raise SemanticReliefInputError(
                "semantic label map must be an 8-bit or unsigned 16-bit grayscale PNG"
            )
        if "transparency" in image.info:
            raise SemanticReliefInputError(
                "semantic label map must not use colour-key transparency"
            )
        image.load()
        labels = np.asarray(image)
    if labels.ndim != 2 or labels.dtype.kind != "u":
        raise SemanticReliefInputError("semantic label map samples must be unsigned integers")
    return labels.astype(np.uint16, copy=False)


def _srgb_luminance(rgb: np.ndarray) -> np.ndarray:
    values = rgb.astype(np.float64) / 255.0
    linear = np.where(
        values <= 0.04045,
        values / 12.92,
        ((values + 0.055) / 1.055) ** 2.4,
    )
    return (
        0.2126 * linear[..., 0]
        + 0.7152 * linear[..., 1]
        + 0.0722 * linear[..., 2]
    )


def _load_scalar(path: Path, expected_shape: tuple[int, int], role: str) -> np.ndarray:
    validate_source_file(path)
    with Image.open(path) as image:
        validate_image_dimensions(image, role)
        if image.size != (expected_shape[1], expected_shape[0]):
            raise SemanticReliefInputError(
                f"{role} must use exact semantic canvas {expected_shape[1]}x{expected_shape[0]}"
            )
        image.load()
        values = np.asarray(image)
        if values.ndim == 3:
            values = _srgb_luminance(values[..., :3])
        else:
            values = values.astype(np.float64)
            maximum = float(values.max()) if values.size else 0.0
            if maximum > 1.0:
                values /= 65535.0 if maximum > 255.0 else 255.0
    if values.ndim != 2 or not np.isfinite(values).all():
        raise SemanticReliefInputError(f"{role} must contain finite scalar samples")
    return np.clip(values, 0.0, 1.0).astype(np.float64, copy=False)


def _robust_normalize(
    values: np.ndarray,
    active: np.ndarray,
    low_percentile: float,
    high_percentile: float,
) -> np.ndarray:
    samples = values[active]
    low = float(np.percentile(samples, low_percentile))
    high = float(np.percentile(samples, high_percentile))
    if high - low <= 1e-12:
        raise SemanticReliefInputError("depth candidate has no usable dynamic range")
    normalized = np.clip((values - low) / (high - low), 0.0, 1.0)
    normalized[~active] = 0.0
    return normalized


def _masked_gaussian(
    values: np.ndarray,
    mask: np.ndarray,
    sigma_px: tuple[float, float],
) -> np.ndarray:
    if max(sigma_px) <= 1e-12:
        result = values.copy()
        result[~mask] = 0.0
        return result
    weights = ndimage.gaussian_filter(
        mask.astype(np.float64), sigma=sigma_px, mode="constant", cval=0.0
    )
    weighted = ndimage.gaussian_filter(
        values * mask, sigma=sigma_px, mode="constant", cval=0.0
    )
    result = np.divide(weighted, weights, out=np.zeros_like(weighted), where=weights > 1e-12)
    result[~mask] = 0.0
    return result


def _profile(distance_mm: np.ndarray, region: SemanticRegion) -> np.ndarray:
    if region.profile == "flat":
        return np.ones(distance_mm.shape, dtype=np.float64)
    t = np.clip(distance_mm / region.bevel_width_mm, 0.0, 1.0)
    if region.profile == "linear":
        return t
    if region.profile == "smoothstep":
        return t * t * (3.0 - 2.0 * t)
    return np.sqrt(t)


def _component_diameters_mm(
    region_mask: np.ndarray, sampling: tuple[float, float]
) -> list[float]:
    labels, count = ndimage.label(region_mask, structure=ndimage.generate_binary_structure(2, 1))
    diameters: list[float] = []
    for label in range(1, count + 1):
        component = labels == label
        padded = np.pad(component, 1, mode="constant", constant_values=False)
        distance = ndimage.distance_transform_edt(padded, sampling=sampling)[1:-1, 1:-1]
        diameters.append(2.0 * float(distance.max()))
    return diameters


def _half_up_quantize(normalized: np.ndarray) -> np.ndarray:
    return np.floor(np.clip(normalized, 0.0, 1.0) * 65535.0 + 0.5).astype(np.uint16)


def _canonical_recipe(
    regions: list[SemanticRegion], filters: SemanticFilters
) -> dict[str, Any]:
    """Return normalized recipe data for deterministic hashing and evidence."""

    return {
        "schema_version": SEMANTIC_RECIPE_SCHEMA_VERSION,
        "regions": [asdict(region) for region in sorted(regions, key=lambda item: item.id)],
        "filters": asdict(filters),
    }


def _canonical_recipe_sha256(recipe: Mapping[str, Any]) -> str:
    return hashlib.sha256(canonical_json_bytes(recipe)).hexdigest()


def compile_semantic_relief(
    labels_path: Path,
    recipe_path: Path,
    output_dir: Path,
    *,
    physical_width_mm: float,
    physical_height_mm: float,
    relief_depth_mm: float,
    minimum_feature_mm: float = 0.6,
    depth_candidate_path: Path | None = None,
    detail_source_path: Path | None = None,
) -> dict[str, Any]:
    """Compile a deterministic absolute relief map and JSON-safe evidence report."""

    width_mm = _positive_dimension(physical_width_mm, "physical_width_mm")
    height_mm = _positive_dimension(physical_height_mm, "physical_height_mm")
    depth_mm = _positive_dimension(relief_depth_mm, "relief_depth_mm")
    minimum_feature = _positive_dimension(minimum_feature_mm, "minimum_feature_mm")
    validate_source_file(recipe_path)
    try:
        manifest = json.loads(recipe_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SemanticReliefInputError("semantic recipe must be readable UTF-8 JSON") from exc
    if not isinstance(manifest, Mapping):
        raise TypeError("semantic recipe must be a JSON object")
    regions, filters = _parse_recipe(manifest, depth_mm)
    canonical_recipe = _canonical_recipe(regions, filters)
    canonical_recipe_sha256 = _canonical_recipe_sha256(canonical_recipe)
    labels = _load_labels(labels_path)
    height_px, width_px = labels.shape
    if labels.size > MAX_SOURCE_PIXELS:
        raise SemanticReliefInputError("semantic label map exceeds the safe pixel limit")
    if len(regions) * labels.size > MAX_REGION_PIXEL_WORK:
        raise SemanticReliefInputError(
            "semantic region pixel work exceeds the safe computation limit"
        )
    active = labels > 0
    if not np.any(active):
        raise SemanticReliefInputError("semantic label map has no active region")
    declared = {region.id for region in regions}
    observed = {int(value) for value in np.unique(labels) if value != 0}
    undeclared = sorted(observed - declared)
    missing = sorted(declared - observed)
    if undeclared:
        raise SemanticReliefInputError(f"semantic label map contains undeclared ids: {undeclared}")
    if missing:
        raise SemanticReliefInputError(f"semantic recipe regions are missing from label map: {missing}")

    needs_candidate = any(region.candidate_weight > 0 for region in regions)
    needs_detail = any(region.detail_gain_mm > 0 for region in regions)
    if needs_candidate and depth_candidate_path is None:
        raise SemanticReliefInputError("recipe requires a depth candidate")
    if needs_detail and detail_source_path is None:
        raise SemanticReliefInputError("recipe requires a detail source")

    pitch_x_mm = width_mm / width_px
    pitch_y_mm = height_mm / height_px
    sampling = (pitch_y_mm, pitch_x_mm)
    sigma_candidate = (
        filters.candidate_low_pass_sigma_mm / pitch_y_mm,
        filters.candidate_low_pass_sigma_mm / pitch_x_mm,
    )
    sigma_detail_small = (
        filters.detail_small_sigma_mm / pitch_y_mm,
        filters.detail_small_sigma_mm / pitch_x_mm,
    )
    sigma_detail_large = (
        filters.detail_large_sigma_mm / pitch_y_mm,
        filters.detail_large_sigma_mm / pitch_x_mm,
    )

    candidate = None
    if depth_candidate_path is not None:
        candidate = _robust_normalize(
            _load_scalar(depth_candidate_path, labels.shape, "Depth candidate"),
            active,
            filters.candidate_low_percentile,
            filters.candidate_high_percentile,
        )
        if filters.candidate_orientation == "inverted":
            candidate = 1.0 - candidate
    detail_source = (
        _load_scalar(detail_source_path, labels.shape, "Detail source")
        if detail_source_path is not None
        else None
    )

    height_field_mm = np.zeros(labels.shape, dtype=np.float64)
    warnings: list[str] = []
    region_reports: list[dict[str, Any]] = []
    total_detail_clipped = 0
    total_detail_samples = 0
    for region in regions:
        region_mask = labels == region.id
        distance_mm = ndimage.distance_transform_edt(region_mask, sampling=sampling)
        shape_profile = _profile(distance_mm, region)
        candidate_profile = shape_profile
        if candidate is not None and region.candidate_weight > 0:
            candidate_profile = _masked_gaussian(candidate, region_mask, sigma_candidate)
        mixed_profile = (
            (1.0 - region.candidate_weight) * shape_profile
            + region.candidate_weight * candidate_profile
        )
        region_height = region.edge_height_mm + (
            region.plateau_height_mm - region.edge_height_mm
        ) * np.clip(mixed_profile, 0.0, 1.0)

        detail_clipped = 0
        detail_has_no_local_dynamic_range = False
        if detail_source is not None and region.detail_gain_mm > 0:
            small = _masked_gaussian(detail_source, region_mask, sigma_detail_small)
            large = _masked_gaussian(detail_source, region_mask, sigma_detail_large)
            band = small - large
            samples = band[region_mask]
            centre = float(np.median(samples))
            absolute = np.abs(samples - centre)
            clip = float(np.percentile(absolute, filters.detail_clip_percentile))
            total_detail_samples += int(region_mask.sum())
            if clip > 1e-12:
                normalized_detail = np.clip((band - centre) / clip, -1.0, 1.0)
                if filters.detail_orientation == "inverted":
                    normalized_detail *= -1.0
                raw_height = region_height + normalized_detail * region.detail_gain_mm
                clipped_height = np.clip(raw_height, 0.0, depth_mm)
                detail_clipped = int(np.count_nonzero((raw_height != clipped_height) & region_mask))
                region_height = clipped_height
                total_detail_clipped += detail_clipped
            else:
                detail_has_no_local_dynamic_range = True

        height_field_mm[region_mask] = region_height[region_mask]
        component_diameters = _component_diameters_mm(region_mask, sampling)
        smallest_component = min(component_diameters)
        maximum_inradius = float(distance_mm.max())
        plateau_fraction = (
            1.0
            if region.profile == "flat"
            else float(np.count_nonzero(distance_mm[region_mask] >= region.bevel_width_mm))
            / int(region_mask.sum())
        )
        region_warnings: list[str] = []
        if smallest_component + 1e-12 < minimum_feature:
            region_warnings.append("component_below_minimum_feature_mm")
        if region.profile != "flat" and plateau_fraction == 0:
            region_warnings.append("bevel_never_reaches_plateau")
        if detail_clipped:
            region_warnings.append("detail_height_clipped")
        if detail_has_no_local_dynamic_range:
            region_warnings.append("detail_source_has_no_local_dynamic_range")
        warnings.extend(f"region_{region.id}:{warning}" for warning in region_warnings)
        region_reports.append(
            {
                "id": region.id,
                "name": region.name,
                "rank": region.rank,
                "pixels": int(region_mask.sum()),
                "area_mm2": round(float(region_mask.sum()) * pitch_x_mm * pitch_y_mm, 10),
                "component_count_4_connected": len(component_diameters),
                "smallest_component_inscribed_diameter_mm": round(smallest_component, 10),
                "maximum_inscribed_radius_mm": round(maximum_inradius, 10),
                "plateau_fraction": round(plateau_fraction, 10),
                "detail_clipped_pixels": detail_clipped,
                "minimum_generated_height_mm": round(float(region_height[region_mask].min()), 10),
                "maximum_generated_height_mm": round(float(region_height[region_mask].max()), 10),
                "warnings": region_warnings,
            }
        )

    if filters.outer_bevel_width_mm > 0:
        outer_distance = ndimage.distance_transform_edt(active, sampling=sampling)
        outer_t = np.clip(outer_distance / filters.outer_bevel_width_mm, 0.0, 1.0)
        outer_profile = outer_t * outer_t * (3.0 - 2.0 * outer_t)
        height_field_mm *= outer_profile
    height_field_mm[~active] = 0.0
    if not np.isfinite(height_field_mm).all():
        raise SemanticReliefInputError("semantic compiler produced non-finite heights")
    if float(height_field_mm.min()) < -1e-12 or float(height_field_mm.max()) > depth_mm + 1e-12:
        raise SemanticReliefInputError("semantic compiler exceeded the physical height budget")

    maximum_pitch = max(pitch_x_mm, pitch_y_mm)
    if maximum_pitch > minimum_feature / 3.0:
        warnings.append("pixel_pitch_exceeds_one_third_of_minimum_feature_mm")
    detail_clipped_fraction = (
        total_detail_clipped / total_detail_samples if total_detail_samples else 0.0
    )
    if detail_clipped_fraction > 0:
        warnings.append("detail_clipping_requires_review")
    warnings = sorted(set(warnings))

    normalized = np.clip(height_field_mm / depth_mm, 0.0, 1.0)
    gradient_y, gradient_x = np.gradient(height_field_mm, pitch_y_mm, pitch_x_mm)
    slope_degrees = np.degrees(np.arctan(np.hypot(gradient_x, gradient_y)))
    active_slope = slope_degrees[active]
    encoded = _half_up_quantize(normalized)
    reconstructed_mm = encoded.astype(np.float64) / 65535.0 * depth_mm
    maximum_quantization_error_mm = float(np.max(np.abs(reconstructed_mm - height_field_mm)))

    if output_dir.exists() and any(output_dir.iterdir()):
        raise SemanticReliefInputError(f"output directory is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    relief_path = output_dir / "relief-map-16.png"
    preview_path = output_dir / "height-preview.png"
    report_path = output_dir / "semantic-relief-report.json"
    Image.fromarray(encoded).save(relief_path, optimize=False)
    silhouette_path = output_dir / "silhouette-mask.png"
    Image.fromarray(np.where(active, 255, 0).astype(np.uint8), mode="L").save(
        silhouette_path, optimize=False
    )
    save_height_preview(normalized.astype(np.float32), preview_path)

    report: dict[str, Any] = {
        "schema_version": SEMANTIC_REPORT_SCHEMA_VERSION,
        "engine_version": SEMANTIC_ENGINE_VERSION,
        "compiler_status": "needs_review" if warnings else "validated",
        "semantic_structure_status": "validated",
        "artwork_semantic_registration_status": "not_independently_validated",
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
        "physical_validation_required": True,
        "alignment_policy": "exact_source_canvas_no_fitting_no_resampling",
        "canvas_px": [width_px, height_px],
        "physical_canvas_mm": [round(width_mm, 10), round(height_mm, 10)],
        "pixel_pitch_mm": [round(pitch_x_mm, 12), round(pitch_y_mm, 12)],
        "relief_depth_mm": round(depth_mm, 10),
        "minimum_feature_mm": round(minimum_feature, 10),
        "height_range_mm": [
            round(float(height_field_mm[active].min()), 10),
            round(float(height_field_mm[active].max()), 10),
        ],
        "quantization": {
            "encoding": "unsigned_16bit_absolute_height_fraction",
            "rounding": "half_up_floor_x_plus_0_5",
            "maximum_observed_error_mm": round(maximum_quantization_error_mm, 12),
            "theoretical_maximum_error_mm": round(depth_mm / (2.0 * 65535.0), 12),
        },
        "detail_clipped_fraction": round(detail_clipped_fraction, 12),
        "surface_slope_degrees": {
            "max": round(float(active_slope.max()), 9),
            "p95": round(float(np.percentile(active_slope, 95.0)), 9),
            "pitch_x_mm": round(pitch_x_mm, 12),
            "pitch_y_mm": round(pitch_y_mm, 12),
            "purpose": "diagnostic_only_physical_printer_profile_validation_required",
        },
        "regions": region_reports,
        "warnings": warnings,
        "inputs": {
            "semantic_labels_sha256": sha256_file(labels_path),
            "semantic_recipe_sha256": sha256_file(recipe_path),
            "canonical_recipe_sha256": canonical_recipe_sha256,
            "depth_candidate_sha256": (
                sha256_file(depth_candidate_path) if depth_candidate_path else None
            ),
            "detail_source_sha256": (
                sha256_file(detail_source_path) if detail_source_path else None
            ),
        },
        "recipe": canonical_recipe,
        "environment": dependency_versions(),
        "artifacts": {
            "relief_map_16": {
                "file": relief_path.name,
                "sha256": sha256_file(relief_path),
                "media_type": "image/png",
            },
            "height_preview": {
                "file": preview_path.name,
                "sha256": sha256_file(preview_path),
                "media_type": "image/png",
            },
            "silhouette_mask": {
                "file": silhouette_path.name,
                "sha256": sha256_file(silhouette_path),
                "media_type": "image/png",
            },
        },
        "limitations": [
            "Semantic regions are authored inputs; this compiler does not infer or verify their meaning.",
            "Depth and detail inputs are bounded candidates, not physical ground truth.",
            "The result is a single-valued heightfield and cannot represent overhangs or hidden geometry.",
            "Physical P1S/A1 mini and UV/RIP/ICC validation remains required.",
        ],
    }
    report_path.write_bytes(canonical_json_bytes(report) + b"\n")
    return report


__all__ = [
    "SEMANTIC_ENGINE_VERSION",
    "SEMANTIC_RECIPE_SCHEMA_VERSION",
    "SemanticReliefInputError",
    "compile_semantic_relief",
]
