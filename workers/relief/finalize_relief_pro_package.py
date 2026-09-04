from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path, PurePosixPath
from tempfile import NamedTemporaryFile, TemporaryDirectory
from typing import Any

import numpy as np
from PIL import Image

from build_relief_pro_package import (
    FIXED_ZIP_TIME,
    MANIFEST_SCHEMA_VERSION,
    MARKER_CONTENT,
    MARKER_NAME,
    MAX_CANVAS_PIXELS,
    _is_link_like,
    _contour_svg,
    _crop_image,
    _registration_contract,
)
from measure_registration import measure_registration
from product_relief_builder import ProductRecipe, build_product_relief
from validate_artifacts import validate_artifact_set

ENGINE_VERSION = "relief-pro-package-finalizer-v0.3.0"
PACKAGE_NAME = "relief-pro-production-candidate.zip"
RECEIPT_NAME = "package-receipt.json"
MANIFEST_NAME = "manifest.json"
FINALIZER_OWNED_REPORTS = (
    "reports/artifact-consistency-report.json",
    "reports/contour-registration-report.json",
)
CANONICAL_GEOMETRY_ARTIFACTS = (
    "model.stl",
    "model.glb",
    "model.3mf",
    "relief-map-normalized-16.png",
    "silhouette-mask-normalized.png",
    "manufacturing-report.json",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _assert_owned_package(root: Path) -> Path:
    resolved = root.expanduser().resolve()
    marker = resolved / MARKER_NAME
    try:
        marker_is_valid = (
            not _is_link_like(marker)
            and marker.is_file()
            and marker.read_text(encoding="utf-8") == MARKER_CONTENT
        )
    except (OSError, UnicodeError):
        marker_is_valid = False
    if not marker_is_valid:
        raise ValueError("directory is not an owned Renderhane Relief Pro package")
    if not (resolved / MANIFEST_NAME).is_file():
        raise ValueError("package manifest is missing")
    return resolved


def _verify_manifest_artifacts(root: Path, manifest: dict[str, Any]) -> None:
    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, dict) or not artifacts:
        raise ValueError("manifest artifacts are missing")
    declared: set[str] = set()
    for relative, expected in artifacts.items():
        if (
            not isinstance(relative, str)
            or "\\" in relative
            or ":" in relative
            or not isinstance(expected, dict)
        ):
            raise ValueError("manifest contains an invalid artifact entry")
        pure = PurePosixPath(relative)
        if pure.is_absolute() or any(part in {"", ".", ".."} for part in pure.parts):
            raise ValueError("manifest contains an unsafe artifact path")
        path = root.joinpath(*pure.parts).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f"manifest artifact is missing: {relative}")
        if path.stat().st_size != expected.get("bytes"):
            raise ValueError(f"manifest artifact size mismatch: {relative}")
        if _sha256(path) != expected.get("sha256"):
            raise ValueError(f"manifest artifact digest mismatch: {relative}")
        declared.add(relative)
    allowed_unlisted = {
        MARKER_NAME,
        MANIFEST_NAME,
        PACKAGE_NAME,
        RECEIPT_NAME,
    }
    actual = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file()
    }
    unexpected = sorted(actual - declared - allowed_unlisted)
    if unexpected:
        raise ValueError(f"package contains an undeclared artifact: {unexpected[0]}")


def _canonical_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _validate_image_inputs(root: Path) -> None:
    groups = (
        (
            "source canvas",
            (
                "source/relief-map-16.png",
                "source/silhouette-mask.png",
                "source/uv-artwork-original.bin",
                "source/white-mask-original.bin",
                "source/varnish-mask-original.bin",
            ),
            True,
        ),
        (
            "normalized geometry canvas",
            (
                "geometry/relief-map-normalized-16.png",
                "geometry/silhouette-mask-normalized.png",
            ),
            False,
        ),
    )
    for label, relatives, require_equal_size in groups:
        expected_size: tuple[int, int] | None = None
        for relative in relatives:
            path = root / relative
            if not path.is_file():
                continue
            try:
                with Image.open(path) as image:
                    size = image.size
            except (OSError, ValueError) as exc:
                raise ValueError(f"invalid image input: {relative}") from exc
            width, height = size
            if width <= 0 or height <= 0 or width * height > MAX_CANVAS_PIXELS:
                raise ValueError(
                    f"image input exceeds safe canvas limit: {relative}"
                )
            if expected_size is None:
                expected_size = size
            elif require_equal_size and size != expected_size:
                raise ValueError(f"{label} mismatch: {relative}")


def _validation_contract(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    failures = value.get("failures")
    warnings = value.get("warnings")
    digital_status = value.get("digital_status")
    digital_geometry_gate = value.get("digital_geometry_gate")
    if (
        digital_status not in {"validated", "needs_review"}
        or digital_geometry_gate not in {"pass", "fail"}
        or not isinstance(failures, list)
        or not isinstance(warnings, list)
    ):
        return None
    return {
        "digital_status": digital_status,
        "digital_geometry_gate": digital_geometry_gate,
        "failures": sorted(str(item) for item in failures),
        "warnings": sorted(str(item) for item in warnings),
    }


def _product_recipe(manifest: dict[str, Any]) -> ProductRecipe | None:
    recipe_data = manifest.get("recipe")
    if not isinstance(recipe_data, dict):
        return None
    try:
        recipe = ProductRecipe(**recipe_data)
        recipe.validate()
    except (TypeError, ValueError):
        return None
    return recipe


def _expected_product_validation(
    manifest: dict[str, Any],
    consistency: Any,
) -> dict[str, Any] | None:
    recipe = _product_recipe(manifest)
    if recipe is None:
        return None
    stl = next(
        (
            artifact
            for artifact in consistency.artifacts
            if artifact.get("format") == "stl"
        ),
        None,
    )
    if not isinstance(stl, dict):
        return None
    try:
        bounds = np.asarray(stl["bounds_mm"], dtype=np.float64)
        if bounds.shape != (2, 3) or not np.isfinite(bounds).all():
            return None
        actual_min_z = float(bounds[0, 2])
        actual_max_z = float(bounds[1, 2])
        open_edges = int(stl["open_edge_count"])
        components = int(stl["component_count"])
        watertight = stl["watertight"] is True
        winding_consistent = stl["winding_consistent"] is True
        is_volume = stl["is_volume"] is True
    except (KeyError, TypeError, ValueError):
        return None

    failures: list[str] = []
    warnings: list[str] = []
    if not watertight:
        failures.append("mesh_not_watertight")
    if not winding_consistent:
        failures.append("winding_inconsistent")
    if not is_volume:
        failures.append("not_positive_volume")
    if open_edges != 0:
        failures.append("open_edges")
    if components != 1:
        failures.append("multiple_components")
    if abs(actual_min_z) > 1e-6:
        failures.append("back_plane_not_at_zero")
    expected_max_z = recipe.base_thickness_mm + recipe.relief_depth_mm
    if actual_max_z > expected_max_z + 0.02:
        failures.append("relief_exceeds_recipe")
    if actual_max_z < recipe.base_thickness_mm - 1e-6:
        failures.append("base_thickness_not_preserved")
    if recipe.grid_long_edge < 96:
        warnings.append("low_grid_resolution")
    if recipe.normalization_mode == "robust":
        warnings.append("legacy_robust_normalization_not_canonical")
    if recipe.pocket_diameter_mm is not None:
        warnings.append(
            "magnet_pocket_requires_bridge_retention_and_orientation_physical_test"
        )
    return {
        "digital_status": (
            "validated" if not failures and not warnings else "needs_review"
        ),
        "digital_geometry_gate": "pass" if not failures else "fail",
        "failures": sorted(failures),
        "warnings": sorted(warnings),
    }


def _geometry_derivation_failures(
    root: Path,
    manifest: dict[str, Any],
) -> list[str]:
    recipe = _product_recipe(manifest)
    if recipe is None:
        return ["provenance:geometry_rebuild_failed"]

    with TemporaryDirectory(prefix="renderhane-relief-rebuild-") as temporary:
        expected_geometry = Path(temporary) / "geometry"
        try:
            build_product_relief(
                root / "source/relief-map-16.png",
                root / "source/silhouette-mask.png",
                expected_geometry,
                recipe,
            )
        except Exception:
            return ["provenance:geometry_rebuild_failed"]

        failures: list[str] = []
        for name in CANONICAL_GEOMETRY_ARTIFACTS:
            expected = expected_geometry / name
            actual = root / "geometry" / name
            if (
                not expected.is_file()
                or not actual.is_file()
                or expected.stat().st_size != actual.stat().st_size
                or _sha256(expected) != _sha256(actual)
            ):
                failures.append(f"provenance:geometry_derivation_mismatch:{name}")
        return failures


def _provenance_failures(
    manifest: dict[str, Any],
    geometry_report: dict[str, Any],
    consistency: Any,
) -> list[str]:
    failures: list[str] = []
    recipe = manifest.get("recipe")
    recipe_sha256 = _canonical_sha256(recipe)
    if manifest.get("recipe_sha256") != recipe_sha256:
        failures.append("provenance:manifest_recipe_hash_mismatch")
    if (
        geometry_report.get("recipe") != recipe
        or geometry_report.get("recipe_sha256") != recipe_sha256
    ):
        failures.append("provenance:geometry_recipe_mismatch")
    manifest_validation = _validation_contract(manifest.get("product_validation"))
    geometry_validation = _validation_contract(geometry_report.get("validation"))
    expected_validation = _expected_product_validation(manifest, consistency)
    if (
        manifest_validation is None
        or geometry_validation is None
        or expected_validation is None
        or manifest_validation != expected_validation
        or geometry_validation != expected_validation
    ):
        failures.append("provenance:product_validation_mismatch")

    source_hashes = manifest.get("source_hashes")
    artifacts = manifest.get("artifacts")
    if not isinstance(source_hashes, dict) or not isinstance(artifacts, dict):
        failures.append("provenance:source_contract_missing")
        return failures
    for source_field, relative, report_field in (
        (
            "relief_map_sha256",
            "source/relief-map-16.png",
            "source_sha256",
        ),
        (
            "mask_sha256",
            "source/silhouette-mask.png",
            "mask_sha256",
        ),
    ):
        expected_sha256 = source_hashes.get(source_field)
        artifact = artifacts.get(relative)
        artifact_sha256 = (
            artifact.get("sha256") if isinstance(artifact, dict) else None
        )
        if (
            not isinstance(expected_sha256, str)
            or artifact_sha256 != expected_sha256
            or geometry_report.get(report_field) != expected_sha256
        ):
            failures.append(f"provenance:{source_field}_mismatch")

    for source_field, relative in (
        ("uv_artwork_sha256", "source/uv-artwork-original.bin"),
        ("white_mask_sha256", "source/white-mask-original.bin"),
        ("varnish_mask_sha256", "source/varnish-mask-original.bin"),
    ):
        expected_sha256 = source_hashes.get(source_field)
        artifact = artifacts.get(relative)
        artifact_sha256 = (
            artifact.get("sha256") if isinstance(artifact, dict) else None
        )
        if expected_sha256 is None and artifact is None:
            continue
        if not isinstance(expected_sha256, str) or artifact_sha256 != expected_sha256:
            failures.append(f"provenance:{source_field}_mismatch")

    geometry_artifacts = geometry_report.get("artifacts")
    if not isinstance(geometry_artifacts, dict):
        failures.append("provenance:geometry_artifacts_missing")
    else:
        required_geometry_artifacts = {
            "model.stl",
            "model.glb",
            "model.3mf",
            "relief-map-normalized-16.png",
            "silhouette-mask-normalized.png",
        }
        if set(geometry_artifacts) != required_geometry_artifacts:
            failures.append("provenance:geometry_artifact_set_mismatch")
        for name, report_artifact in geometry_artifacts.items():
            package_artifact = artifacts.get(f"geometry/{name}")
            if (
                not isinstance(report_artifact, dict)
                or not isinstance(package_artifact, dict)
                or report_artifact.get("sha256") != package_artifact.get("sha256")
                or report_artifact.get("bytes") != package_artifact.get("bytes")
            ):
                failures.append(f"provenance:geometry_artifact_mismatch:{name}")
    return failures


def _deterministic_consistency_data(consistency: Any) -> dict[str, Any]:
    data = consistency.to_dict()
    relative_paths = {
        "stl": "geometry/model.stl",
        "glb": "geometry/model.glb",
        "3mf": "geometry/model.3mf",
    }
    for artifact in data.get("artifacts", []):
        format_name = artifact.get("format")
        if format_name in relative_paths:
            artifact["path"] = relative_paths[format_name]
    return data


def _decoded_images_match(expected: Path, actual: Path) -> bool:
    try:
        with Image.open(expected) as expected_image, Image.open(actual) as actual_image:
            expected_image.load()
            actual_image.load()
            return (
                expected_image.mode == actual_image.mode
                and expected_image.size == actual_image.size
                and expected_image.tobytes() == actual_image.tobytes()
                and expected_image.convert("RGBA").tobytes()
                == actual_image.convert("RGBA").tobytes()
                and expected_image.info.get("icc_profile")
                == actual_image.info.get("icc_profile")
            )
    except (OSError, ValueError):
        return False


def _derived_artwork_failures(
    *,
    root: Path,
    manifest: dict[str, Any],
    crop_box: tuple[int, int, int, int],
    physical_width_mm: float,
    physical_height_mm: float,
) -> list[str]:
    failures: list[str] = []
    source_hashes = manifest.get("source_hashes")
    if not isinstance(source_hashes, dict):
        return ["provenance:source_contract_missing"]

    artwork_chains = (
        (
            "uv_artwork",
            "uv_artwork_sha256",
            "source/uv-artwork-original.bin",
            "artwork/uv-artwork-srgb.png",
        ),
        (
            "white_mask",
            "white_mask_sha256",
            "source/white-mask-original.bin",
            "artwork/white-mask.png",
        ),
        (
            "varnish_mask",
            "varnish_mask_sha256",
            "source/varnish-mask-original.bin",
            "artwork/varnish-mask.png",
        ),
    )
    chain_complete: list[bool] = []
    with TemporaryDirectory(prefix="renderhane-relief-finalizer-") as temporary:
        temporary_root = Path(temporary)
        for label, hash_field, source_relative, artwork_relative in artwork_chains:
            source = root / source_relative
            artwork = root / artwork_relative
            hash_present = isinstance(source_hashes.get(hash_field), str)
            source_present = source.is_file()
            artwork_present = artwork.is_file()
            complete = hash_present and source_present and artwork_present
            chain_complete.append(complete)
            if len({hash_present, source_present, artwork_present}) != 1:
                failures.append(f"provenance:{label}_artifact_chain_incomplete")
                continue
            if not complete:
                continue
            expected = temporary_root / f"{label}.png"
            try:
                _crop_image(source, crop_box, expected)
            except Exception:
                failures.append(f"provenance:{label}_source_not_renderable")
                continue
            if not _decoded_images_match(expected, artwork):
                failures.append(f"provenance:{label}_derived_artwork_mismatch")

        actual_uv_status = "complete" if all(chain_complete) else "incomplete"
        if manifest.get("uv_artwork_status") != actual_uv_status:
            failures.append("provenance:uv_artwork_status_mismatch")

        geometry_mask = root / "geometry/silhouette-mask-normalized.png"
        expected_contour = temporary_root / "cut-contour.svg"
        contour_info = _contour_svg(
            geometry_mask,
            expected_contour,
            width_mm=physical_width_mm,
            height_mm=physical_height_mm,
        )
        contour = root / "artwork/cut-contour.svg"
        if not contour.is_file() or expected_contour.read_bytes() != contour.read_bytes():
            failures.append("provenance:cut_contour_mismatch")

    source_mask = root / "source/silhouette-mask.png"
    with Image.open(source_mask) as image:
        source_canvas = image.size
    expected_registration = _registration_contract(
        source_canvas_px=source_canvas,
        crop_box_px=crop_box,
        physical_width_mm=physical_width_mm,
        physical_height_mm=physical_height_mm,
        contour=contour_info,
    )
    registration_path = root / "artwork/registration.json"
    try:
        artwork_registration = json.loads(
            registration_path.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        artwork_registration = None
    if artwork_registration != expected_registration:
        failures.append("provenance:artwork_registration_mismatch")
    if manifest.get("registration") != expected_registration:
        failures.append("provenance:manifest_registration_mismatch")
    return failures


def _foreground_crop_box(path: Path) -> tuple[int, int, int, int]:
    with Image.open(path) as image:
        mask = np.asarray(image.convert("L"), dtype=np.uint8) > 127
    coordinates = np.argwhere(mask)
    if coordinates.size == 0:
        raise ValueError("source silhouette mask contains no foreground")
    top, left = coordinates.min(axis=0)
    bottom, right = coordinates.max(axis=0) + 1
    return int(left), int(top), int(right), int(bottom)


def _stl_extents_mm(consistency: Any) -> tuple[float, float]:
    for artifact in consistency.artifacts:
        if artifact.get("format") == "stl":
            extents = artifact.get("extents_mm")
            if not isinstance(extents, list) or len(extents) < 2:
                break
            width, height = float(extents[0]), float(extents[1])
            if width <= 0 or height <= 0:
                break
            return width, height
    raise ValueError("artifact consistency report has no valid STL extents")


def _write_deterministic_zip(root: Path, destination: Path, members: list[Path]) -> None:
    with NamedTemporaryFile(
        prefix=f".{destination.parent.name}-{destination.name}-",
        suffix=".tmp",
        dir=destination.parent.parent,
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(
            temporary,
            "w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=9,
        ) as archive:
            for path in sorted(
                members,
                key=lambda item: item.relative_to(root).as_posix(),
            ):
                relative = path.relative_to(root).as_posix()
                info = zipfile.ZipInfo(relative, date_time=FIXED_ZIP_TIME)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                info.create_system = 3
                archive.writestr(
                    info,
                    path.read_bytes(),
                    compress_type=zipfile.ZIP_DEFLATED,
                    compresslevel=9,
                )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _write_json_atomic(root: Path, destination: Path, value: Any) -> None:
    payload = (
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    )
    with NamedTemporaryFile(
        prefix=f".{root.name}-{destination.name}-",
        suffix=".tmp",
        dir=root.parent,
        mode="w",
        encoding="utf-8",
        newline="\n",
        delete=False,
    ) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    try:
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _verify_no_package_links(root: Path) -> None:
    for path in root.rglob("*"):
        resolved = path.resolve()
        if _is_link_like(path) or not resolved.is_relative_to(root):
            relative = path.relative_to(root).as_posix()
            raise ValueError(f"package contains a forbidden link: {relative}")


def finalize_package(
    root: Path,
    *,
    tolerance_mm: float = 0.02,
    registration_tolerance_mm: float = 0.5,
) -> dict[str, Any]:
    root = _assert_owned_package(root)
    manifest_path = root / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("product_line") != "relief-pro":
        raise ValueError("manifest is not a Relief Pro package")
    if manifest.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ValueError(
            "legacy_package_requires_rebuild: expected Relief Pro manifest "
            f"schema {MANIFEST_SCHEMA_VERSION}"
        )
    _verify_no_package_links(root)
    legacy_temporary = root / f"{PACKAGE_NAME}.tmp"
    if legacy_temporary.exists():
        if not legacy_temporary.is_file():
            raise ValueError("finalizer temp path is not a regular file")
        legacy_temporary.unlink()
    declared_artifacts = manifest.get("artifacts")
    if isinstance(declared_artifacts, dict):
        for relative in FINALIZER_OWNED_REPORTS:
            derived_report = root.joinpath(*PurePosixPath(relative).parts)
            if derived_report.exists():
                if not derived_report.is_file():
                    raise ValueError("finalizer report path is not a regular file")
                derived_report.unlink()
            declared_artifacts.pop(relative, None)
    else:
        for relative in FINALIZER_OWNED_REPORTS:
            derived_report = root.joinpath(*PurePosixPath(relative).parts)
            if derived_report.exists() and not derived_report.is_file():
                raise ValueError("finalizer report path is not a regular file")
    _verify_manifest_artifacts(root, manifest)
    _validate_image_inputs(root)

    geometry = root / "geometry"
    reports = root / "reports"
    consistency = validate_artifact_set(
        stl_path=geometry / "model.stl",
        glb_path=geometry / "model.glb",
        three_mf_path=geometry / "model.3mf",
        tolerance_mm=tolerance_mm,
    )
    consistency_data = _deterministic_consistency_data(consistency)

    geometry_report_path = geometry / "manufacturing-report.json"
    geometry_report = json.loads(geometry_report_path.read_text(encoding="utf-8"))
    raw_geometry_validation = geometry_report.get("validation")
    geometry_validation = (
        raw_geometry_validation if isinstance(raw_geometry_validation, dict) else {}
    )
    raw_product_validation = manifest.get("product_validation")
    geometry_contract = _validation_contract(raw_geometry_validation)
    product_contract = _validation_contract(raw_product_validation)
    geometry_gate = (
        geometry_contract["digital_geometry_gate"] if geometry_contract else None
    )
    geometry_warnings = geometry_contract["warnings"] if geometry_contract else []
    provenance_failures = _provenance_failures(
        manifest,
        geometry_report,
        consistency,
    )
    provenance_failures.extend(_geometry_derivation_failures(root, manifest))
    source_mask_path = root / "source" / "silhouette-mask.png"
    crop_box = _foreground_crop_box(source_mask_path)
    physical_width_mm, physical_height_mm = _stl_extents_mm(consistency)
    metadata_failures: list[str] = []
    try:
        reported_crop_box = tuple(
            int(value) for value in geometry_validation["crop_box_px"]
        )
    except (KeyError, TypeError, ValueError):
        reported_crop_box = None
    if reported_crop_box != crop_box:
        metadata_failures.append("geometry_report:crop_box_mismatch")
    try:
        reported_extents = np.asarray(
            geometry_validation["extents_mm"][:2],
            dtype=np.float64,
        )
        actual_extents = np.asarray(
            [physical_width_mm, physical_height_mm],
            dtype=np.float64,
        )
        extents_match = (
            reported_extents.shape == (2,)
            and np.isfinite(reported_extents).all()
            and float(np.max(np.abs(reported_extents - actual_extents)))
            <= tolerance_mm
        )
    except (KeyError, TypeError, ValueError):
        reported_extents = np.asarray([], dtype=np.float64)
        extents_match = False
    if not extents_match:
        metadata_failures.append("geometry_report:extents_mismatch")
    artwork_width_mm, artwork_height_mm = (
        (float(reported_extents[0]), float(reported_extents[1]))
        if reported_extents.shape == (2,)
        and np.isfinite(reported_extents).all()
        and bool(np.all(reported_extents > 0))
        else (physical_width_mm, physical_height_mm)
    )
    derived_artwork_failures = _derived_artwork_failures(
        root=root,
        manifest=manifest,
        crop_box=crop_box,
        physical_width_mm=artwork_width_mm,
        physical_height_mm=artwork_height_mm,
    )
    registration = measure_registration(
        source_mask_path=source_mask_path,
        geometry_mask_path=geometry / "silhouette-mask-normalized.png",
        crop_box_px=crop_box,
        physical_width_mm=physical_width_mm,
        physical_height_mm=physical_height_mm,
        tolerance_mm=registration_tolerance_mm,
    )

    failures: list[str] = []
    warnings: list[str] = []
    if geometry_gate != "pass":
        failures.append("geometry_gate_failed")
    if product_contract is None or product_contract["digital_geometry_gate"] != "pass":
        failures.append("manifest_geometry_gate_failed")
    failures.extend(provenance_failures)
    failures.extend(metadata_failures)
    failures.extend(derived_artwork_failures)
    failures.extend(consistency.failures)
    if product_contract is not None:
        failures.extend(product_contract["failures"])
    warnings.extend(str(value) for value in geometry_warnings)
    if product_contract is not None:
        warnings.extend(product_contract["warnings"])
    warnings.extend(consistency.warnings)
    if manifest.get("uv_artwork_status") != "complete":
        warnings.append("uv_artwork_set_incomplete")
    failures.extend(f"registration:{value}" for value in registration.failures)
    warnings.extend(f"registration:{value}" for value in registration.warnings)
    failures = sorted(set(failures))
    warnings = sorted(set(warnings))

    if failures:
        digital_status = "failed"
    elif warnings:
        digital_status = "needs_review"
    else:
        digital_status = "ready"

    reports.mkdir(parents=True, exist_ok=True)
    consistency_path = reports / "artifact-consistency-report.json"
    _write_json_atomic(
        root,
        consistency_path,
        consistency_data,
    )
    registration_path = reports / "contour-registration-report.json"
    _write_json_atomic(
        root,
        registration_path,
        registration.to_dict(),
    )

    manifest["package_finalizer_version"] = ENGINE_VERSION
    manifest["digital_geometry_status"] = digital_status
    manifest["digital_package_status"] = digital_status
    manifest["digital_artifact_consistency"] = consistency.decision
    manifest["digital_contour_registration"] = registration.decision
    manifest["digital_failures"] = failures
    manifest["digital_warnings"] = warnings
    manifest["physical_validation_status"] = "pending"
    manifest["production_status"] = "not_approved_pending_physical_validation"

    excluded_paths = {MARKER_NAME, PACKAGE_NAME, RECEIPT_NAME, MANIFEST_NAME}
    artifact_paths = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.relative_to(root).as_posix() not in excluded_paths
    ]
    manifest["artifacts"] = {
        path.relative_to(root).as_posix(): {
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted(artifact_paths)
    }
    _write_json_atomic(root, manifest_path, manifest)

    package_path = root / PACKAGE_NAME
    _write_deterministic_zip(root, package_path, [*artifact_paths, manifest_path])
    receipt = {
        "schema_version": 1,
        "engine_version": ENGINE_VERSION,
        "package": PACKAGE_NAME,
        "bytes": package_path.stat().st_size,
        "sha256": _sha256(package_path),
        "manifest_sha256": _sha256(manifest_path),
        "digital_geometry_status": digital_status,
        "digital_package_status": digital_status,
        "digital_artifact_consistency": consistency.decision,
        "digital_contour_registration": registration.decision,
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
    }
    _write_json_atomic(root, root / RECEIPT_NAME, receipt)
    return {"manifest": manifest, "receipt": receipt}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate and deterministically seal an existing Relief Pro package"
    )
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--tolerance-mm", type=float, default=0.02)
    parser.add_argument("--registration-tolerance-mm", type=float, default=0.5)
    args = parser.parse_args(argv)

    try:
        result = finalize_package(
            args.package_dir,
            tolerance_mm=args.tolerance_mm,
            registration_tolerance_mm=args.registration_tolerance_mm,
        )
    except Exception as exc:
        print(f"package finalization failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(result["receipt"], ensure_ascii=False, sort_keys=True))
    return 0 if result["receipt"]["digital_geometry_status"] == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
