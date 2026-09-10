"""End-to-end deterministic Relief Pro Phase 0 build pipeline."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from .export_ops import (
    artifact_record,
    compare_export,
    deterministic_3mf_bytes,
    write_contour_svg,
    write_deterministic_zip,
    write_registration_svg,
)
from .image_ops import (
    align_source_layer,
    aligned_output_size,
    compute_crop_box,
    load_grayscale,
    load_mask_at_source_size,
    normalize_relief,
    resize_float_map,
    resize_mask,
    save_height_preview,
    save_relief_png,
)
from .mesh_ops import (
    build_rectangular_relief_mesh,
    build_silhouette_relief_mesh,
    validate_mesh,
)
from .models import (
    ENGINE_NAME,
    ENGINE_VERSION,
    REPORT_SCHEMA_VERSION,
    BuildRecipe,
    BuildReport,
    canonical_json_bytes,
    dependency_versions,
    inspect_source_image,
    sha256_bytes,
    sha256_file,
)


def build(
    relief_map_path: Path,
    output_dir: Path,
    recipe: BuildRecipe,
    mask_path: Path | None = None,
    aligned_layer_paths: dict[str, Path] | None = None,
) -> BuildReport:
    recipe.validate()
    relief_map_path = relief_map_path.resolve()
    mask_path = mask_path.resolve() if mask_path else None
    aligned_layer_paths = {
        key: value.resolve() for key, value in (aligned_layer_paths or {}).items()
    }
    unknown_layers = set(aligned_layer_paths) - {"uv_artwork", "white_mask", "varnish_mask"}
    if unknown_layers:
        raise ValueError(f"Unknown aligned layer keys: {sorted(unknown_layers)}")
    output_dir.mkdir(parents=True, exist_ok=True)

    source = load_grayscale(
        relief_map_path,
        require_unsigned_16bit=recipe.normalization_mode == "absolute",
    )
    source_image_info = inspect_source_image(relief_map_path, source)
    source_height, source_width = source.shape
    source_mask = load_mask_at_source_size(mask_path, (source_width, source_height))
    if recipe.shape_mode == "silhouette" and source_mask is None:
        raise ValueError("shape_mode=silhouette requires --mask")

    crop = compute_crop_box(source_mask, recipe.mask_threshold, recipe.shape_mode)
    if crop == (0, 0, 0, 0):
        crop = (0, 0, source_width, source_height)
    left, top, right, bottom = crop
    working_source = source[top:bottom, left:right]
    working_mask = source_mask[top:bottom, left:right] if source_mask is not None else None

    resized = resize_float_map(
        working_source,
        recipe.grid_long_edge,
        normalization_mode=recipe.normalization_mode,
    )
    mask = resize_mask(working_mask, (resized.shape[1], resized.shape[0]))
    normalized = normalize_relief(resized, recipe, mask)

    working_height, working_width = working_source.shape
    resolved_height_mm = (
        recipe.height_mm
        if recipe.height_mm is not None
        else recipe.width_mm * (working_height / working_width)
    )

    if recipe.shape_mode == "silhouette":
        assert mask is not None
        mesh_mm, silhouette_alignment, contour_loops_mm = build_silhouette_relief_mesh(
            normalized,
            mask,
            width_mm=recipe.width_mm,
            height_mm=resolved_height_mm,
            base_thickness_mm=recipe.base_thickness_mm,
            relief_depth_mm=recipe.relief_depth_mm,
            mask_threshold=recipe.mask_threshold,
        )
    else:
        contour_loops_mm = [[
            (-recipe.width_mm / 2.0, resolved_height_mm / 2.0),
            (recipe.width_mm / 2.0, resolved_height_mm / 2.0),
            (recipe.width_mm / 2.0, -resolved_height_mm / 2.0),
            (-recipe.width_mm / 2.0, -resolved_height_mm / 2.0),
        ]]
        silhouette_alignment = {
            "grid_node_extent": [0, 0, normalized.shape[1] - 1, normalized.shape[0] - 1],
            "normalized_source_extent": [0.0, 0.0, 1.0, 1.0],
            "boundary_quantization_mm": [
                round(recipe.width_mm / max(1, normalized.shape[1] - 1), 9),
                round(resolved_height_mm / max(1, normalized.shape[0] - 1), 9),
            ],
        }
        mesh_mm = build_rectangular_relief_mesh(
            normalized,
            width_mm=recipe.width_mm,
            height_mm=resolved_height_mm,
            base_thickness_mm=recipe.base_thickness_mm,
            relief_depth_mm=recipe.relief_depth_mm,
        )

    source_aspect_ratio = working_width / working_height
    target_aspect_ratio = recipe.width_mm / resolved_height_mm
    aspect_ratio_distortion_percent = abs(target_aspect_ratio / source_aspect_ratio - 1.0) * 100.0
    boundary_quantization_mm = max(silhouette_alignment["boundary_quantization_mm"])
    active_mask = mask
    validation = validate_mesh(
        mesh_mm,
        recipe,
        resolved_height_mm,
        normalized,
        active_mask,
        aspect_ratio_distortion_percent,
        boundary_quantization_mm,
    )
    if source_image_info["effective_precision_bits_estimate"] <= 8:
        validation.advisories = sorted(
            set(validation.advisories + ["relief_map_has_8_bit_or_lower_effective_precision"])
        )

    normalized_path = output_dir / "relief-map-normalized-16.png"
    preview_path = output_dir / "height-preview.png"
    stl_path = output_dir / "model.stl"
    glb_path = output_dir / "model.glb"
    threemf_path = output_dir / "model.3mf"
    report_path = output_dir / "manufacturing-report.json"
    manifest_path = output_dir / "artifact-manifest.json"
    package_path = output_dir / "manufacturing-package.zip"
    registration_path = output_dir / "registration-overlay.svg"
    contour_path = output_dir / "contour.svg"

    save_relief_png(normalized, normalized_path)
    save_height_preview(normalized, preview_path)
    mesh_mm.export(stl_path, file_type="stl")

    mesh_m = mesh_mm.copy()
    mesh_m.apply_scale(0.001)
    mesh_m.metadata.update(
        {
            "name": "Renderhane Relief Phase 0",
            "source_units": "millimetres",
            "physical_width_mm": recipe.width_mm,
            "physical_height_mm": resolved_height_mm,
            "physical_depth_mm": float(mesh_mm.extents[2]),
            "engine": ENGINE_NAME,
            "engine_version": ENGINE_VERSION,
        }
    )
    glb_path.write_bytes(mesh_m.export(file_type="glb"))

    recipe_dict = asdict(recipe)
    recipe_hash = sha256_bytes(canonical_json_bytes(recipe_dict))
    threemf_path.write_bytes(
        deterministic_3mf_bytes(mesh_mm, "Renderhane Relief Phase 0", recipe_hash)
    )

    export_validation: dict[str, Any] = {}
    export_errors: list[str] = []
    for key, path, units in (
        ("stl", stl_path, "millimetres"),
        ("glb", glb_path, "metres"),
        ("3mf", threemf_path, "millimetres"),
    ):
        try:
            result = compare_export(path, mesh_mm, units)
        except Exception as exc:
            result = {"reloaded": False, "error": str(exc), "units": units}
        export_validation[key] = result
        if not result.get("reloaded") or not result.get("extents_match"):
            export_errors.append(f"{key}_reload_or_extent_failed")
        if result.get("reloaded") and not result.get("watertight"):
            export_errors.append(f"{key}_not_watertight_after_reload")

    if export_errors:
        validation.warnings = sorted(set(validation.warnings + export_errors))
        validation.digital_status = "needs_review"
        validation.production_status = "blocked"

    crop_width = right - left
    crop_height = bottom - top
    u0, v0, u1, v1 = silhouette_alignment["normalized_source_extent"]
    source_extent_px = (
        float(left + u0 * max(1, crop_width - 1)),
        float(top + v0 * max(1, crop_height - 1)),
        float(left + u1 * max(1, crop_width - 1)),
        float(top + v1 * max(1, crop_height - 1)),
    )
    output_artwork_size = aligned_output_size(
        recipe.width_mm, resolved_height_mm, recipe.artwork_long_edge_px
    )
    aligned_files: dict[str, Path] = {}
    aligned_names = {
        "uv_artwork": ("uv-print-aligned.png", False),
        "white_mask": ("white-mask-aligned.png", True),
        "varnish_mask": ("varnish-mask-aligned.png", True),
    }
    for key, source_path in aligned_layer_paths.items():
        filename, mask_like = aligned_names[key]
        destination = output_dir / filename
        align_source_layer(
            source_path,
            destination,
            (source_width, source_height),
            source_extent_px,
            output_artwork_size,
            mask_like,
        )
        aligned_files[key] = destination

    if mask_path is not None:
        silhouette_mask_path = output_dir / "silhouette-mask-aligned.png"
        align_source_layer(
            mask_path,
            silhouette_mask_path,
            (source_width, source_height),
            source_extent_px,
            output_artwork_size,
            True,
        )
        aligned_files["silhouette_mask"] = silhouette_mask_path

    write_registration_svg(
        registration_path,
        recipe.width_mm,
        resolved_height_mm,
        source_extent_px,
    )
    write_contour_svg(
        contour_path,
        recipe.width_mm,
        resolved_height_mm,
        contour_loops_mm,
    )

    coordinate_system = {
        "source_origin": "top_left",
        "model_origin": "xy_center_z_back_plane",
        "model_axes": {"x": "source_right", "y": "source_up", "z": "out_of_back_plane"},
        "source_crop_px": [left, top, right, bottom],
        "source_crop_size_px": [crop_width, crop_height],
        "effective_source_extent_px": [round(value, 6) for value in source_extent_px],
        "silhouette_alignment": silhouette_alignment,
        "aligned_artwork_size_px": list(output_artwork_size),
        "model_size_mm": [round(recipe.width_mm, 6), round(resolved_height_mm, 6)],
        "source_aspect_ratio": round(source_aspect_ratio, 12),
        "target_aspect_ratio": round(target_aspect_ratio, 12),
        "aspect_ratio_distortion_percent": round(aspect_ratio_distortion_percent, 9),
        "height_was_explicit": recipe.height_mm is not None,
        "nominal_mm_per_source_pixel": [
            round(recipe.width_mm / crop_width, 12),
            round(resolved_height_mm / crop_height, 12),
        ],
        "uv_alignment_rule": "Use effective_source_extent_px and aligned_artwork_size_px; do not add padding or independently recrop any layer.",
        "digital_boundary_quantization_mm": boundary_quantization_mm,
    }

    artifacts = {
        "normalized_relief_map": artifact_record(normalized_path, "image/png"),
        "height_preview": artifact_record(preview_path, "image/png"),
        "stl": artifact_record(stl_path, "model/stl", "millimetres"),
        "glb": artifact_record(glb_path, "model/gltf-binary", "metres"),
        "3mf": artifact_record(threemf_path, "model/3mf", "millimetres"),
        "registration_overlay": artifact_record(registration_path, "image/svg+xml", "millimetres"),
        "contour": artifact_record(contour_path, "image/svg+xml", "millimetres"),
    }
    for key, path in aligned_files.items():
        artifacts[key] = artifact_record(path, "image/png")

    active = mask > 0.05 if mask is not None else np.ones_like(normalized, dtype=bool)
    active_values = normalized[active]
    report = BuildReport(
        schema_version=REPORT_SCHEMA_VERSION,
        engine=ENGINE_NAME,
        engine_version=ENGINE_VERSION,
        environment=dependency_versions(),
        source_sha256=sha256_file(relief_map_path),
        mask_sha256=sha256_file(mask_path) if mask_path else None,
        aligned_input_sha256={
            key: sha256_file(path)
            for key, path in sorted(aligned_layer_paths.items())
        },
        recipe_sha256=recipe_hash,
        recipe=recipe_dict,
        source_dimensions_px=[source_width, source_height],
        source_image_info=source_image_info,
        source_crop_px=[left, top, right, bottom],
        grid_dimensions_px=[normalized.shape[1], normalized.shape[0]],
        resolved_height_mm=round(float(resolved_height_mm), 6),
        coordinate_system=coordinate_system,
        relief_statistics={
            "normalized_min": round(float(active_values.min()), 9),
            "normalized_max": round(float(active_values.max()), 9),
            "normalized_mean": round(float(active_values.mean()), 9),
            "normalized_std": round(float(active_values.std()), 9),
        },
        validation=asdict(validation),
        export_validation=export_validation,
        artifacts=artifacts,
        manifest_file=manifest_path.name,
        package_file=package_path.name,
    )
    report_path.write_bytes(canonical_json_bytes(asdict(report)) + b"\n")

    manifest = {
        "schema_version": 1,
        "engine": ENGINE_NAME,
        "engine_version": ENGINE_VERSION,
        "recipe_sha256": recipe_hash,
        "source_sha256": report.source_sha256,
        "mask_sha256": report.mask_sha256,
        "aligned_input_sha256": report.aligned_input_sha256,
        "artifacts": {
            **artifacts,
            "manufacturing_report": artifact_record(report_path, "application/json"),
        },
    }
    manifest_path.write_bytes(canonical_json_bytes(manifest) + b"\n")

    package_files = [
        normalized_path,
        preview_path,
        stl_path,
        glb_path,
        threemf_path,
        registration_path,
        contour_path,
        report_path,
        manifest_path,
        *aligned_files.values(),
    ]
    write_deterministic_zip(package_path, package_files)
    return report
