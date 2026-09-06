from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from analyze_semantic_registration import (
    analyze_semantic_registration,
    write_semantic_registration_artifacts,
)
from PIL import Image


def _write_labels(path: Path, values: np.ndarray) -> Path:
    Image.fromarray(values.astype(np.uint16)).save(path)
    return path


def _manifest(**thresholds: float) -> dict:
    value = {
        "schema_version": 1,
        "regions": [{"id": 1, "name": "base"}, {"id": 2, "name": "symbol"}],
        "source_bindings": {
            "geometry_source_role": "relief_map",
            "geometry_source_sha256": "a" * 64,
            "artwork_source_role": "uv_artwork",
            "artwork_source_sha256": "b" * 64,
            "binding_scope": "revision_inputs_not_derivation_proof",
        },
    }
    if thresholds:
        value["thresholds"] = thresholds
    return value


def _analyze(
    tmp_path: Path,
    geometry: np.ndarray,
    artwork: np.ndarray,
    *,
    width_mm: float = 10.0,
    height_mm: float = 10.0,
    manifest: dict | None = None,
) -> dict:
    geometry_path = _write_labels(tmp_path / "geometry.png", geometry)
    artwork_path = _write_labels(tmp_path / "artwork.png", artwork)
    return analyze_semantic_registration(
        geometry_path,
        artwork_path,
        _manifest() if manifest is None else manifest,
        physical_width_mm=width_mm,
        physical_height_mm=height_mm,
    )


def _two_regions() -> np.ndarray:
    labels = np.zeros((100, 100), dtype=np.uint16)
    labels[20:80, 20:50] = 1
    labels[20:80, 50:80] = 2
    return labels


def test_identical_stable_region_ids_validate_with_zero_error(tmp_path: Path) -> None:
    labels = _two_regions()
    report = _analyze(tmp_path, labels, labels)

    assert report["decision"] == "pass"
    assert report["artwork_semantic_registration_status"] == "validated"
    assert report["alignment_policy"] == "exact_canvas_no_fitting_no_resampling"
    assert report["pixel_pitch_mm"] == [0.1, 0.1]
    assert (
        report["source_bindings"]["binding_scope"]
        == "revision_inputs_not_derivation_proof"
    )
    assert report["failures"] == []
    for region in report["regions"]:
        assert region["status"] == "validated"
        assert region["intersection_over_union"] == 1.0
        assert region["maximum_boundary_distance_mm"] == 0.0
        assert region["centroid_offset_mm"] == 0.0


def test_unbound_label_maps_cannot_claim_semantic_validation(tmp_path: Path) -> None:
    labels = _two_regions()
    manifest = _manifest()
    manifest.pop("source_bindings")

    report = _analyze(tmp_path, labels, labels, manifest=manifest)

    assert report["decision"] == "fail"
    assert report["artwork_semantic_registration_status"] == "not_evaluable"
    assert report["failures"] == ["source_bindings_missing"]


def test_local_inner_edge_deformation_fails_even_when_outer_silhouette_is_identical(
    tmp_path: Path,
) -> None:
    geometry = _two_regions()
    artwork = geometry.copy()
    artwork[20:80, 47:53] = np.where(
        np.indices((60, 6))[0] < 30,
        2,
        1,
    )

    assert np.array_equal(geometry > 0, artwork > 0)
    report = _analyze(tmp_path, geometry, artwork)

    assert report["decision"] == "fail"
    assert report["artwork_semantic_registration_status"] == "failed"
    assert any(
        "intersection_over_union_below_threshold" in value
        for value in report["failures"]
    )


def test_global_translation_is_reported_in_millimetres(tmp_path: Path) -> None:
    geometry = _two_regions()
    artwork = np.zeros_like(geometry)
    artwork[:, 10:] = geometry[:, :-10]

    report = _analyze(tmp_path, geometry, artwork)

    assert report["decision"] == "fail"
    for region in report["regions"]:
        assert region["centroid_offset_x_mm"] == 1.0
        assert region["maximum_boundary_distance_mm"] == 1.0
        assert "centroid_offset_exceeds_threshold" in region["failures"]


@pytest.mark.parametrize("case", ["missing", "extra", "swapped"])
def test_missing_extra_and_swapped_ids_fail_closed(tmp_path: Path, case: str) -> None:
    geometry = _two_regions()
    artwork = geometry.copy()
    if case == "missing":
        artwork[artwork == 2] = 0
    elif case == "extra":
        artwork[30:35, 30:35] = 9
    else:
        artwork = np.where(artwork == 1, 2, np.where(artwork == 2, 1, 0)).astype(
            np.uint16
        )

    report = _analyze(tmp_path, geometry, artwork)

    assert report["decision"] == "fail"
    if case == "missing":
        assert report["missing_artwork_region_ids"] == [2]
        assert report["regions"][1]["status"] == "not_evaluable"
    elif case == "extra":
        assert report["undeclared_artwork_region_ids"] == [9]
    else:
        assert all(
            region["intersection_over_union"] == 0.0 for region in report["regions"]
        )
        assert report["suspected_swapped_region_pairs"] == [[1, 2]]
        assert report["semantic_mismatch_pixels"] == 3600
        assert {
            (item["geometry_id"], item["artwork_id"]) for item in report["confusion"]
        } == {(1, 2), (2, 1)}


def test_anisotropic_pixel_pitch_controls_physical_distance(tmp_path: Path) -> None:
    geometry = _two_regions()
    artwork = np.zeros_like(geometry)
    artwork[:, 1:] = geometry[:, :-1]
    report = _analyze(tmp_path, geometry, artwork, width_mm=200.0, height_mm=100.0)

    assert report["pixel_pitch_mm"] == [2.0, 1.0]
    assert report["regions"][0]["centroid_offset_x_mm"] == 2.0
    assert report["regions"][0]["maximum_boundary_distance_mm"] == 2.0


def test_report_and_provenance_are_deterministic(tmp_path: Path) -> None:
    labels = _two_regions()
    geometry_path = _write_labels(tmp_path / "geometry.png", labels)
    artwork_path = _write_labels(tmp_path / "artwork.png", labels)
    manifest = {
        "schema_version": 1,
        "regions": [{"id": 2, "name": "symbol"}, {"id": 1, "name": "base"}],
        "source_bindings": _manifest()["source_bindings"],
    }
    first = analyze_semantic_registration(
        geometry_path,
        artwork_path,
        manifest,
        physical_width_mm=10,
        physical_height_mm=10,
    )
    second = analyze_semantic_registration(
        geometry_path,
        artwork_path,
        manifest,
        physical_width_mm=10,
        physical_height_mm=10,
    )

    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    assert (
        first["provenance"]["geometry_labels_sha256"]
        == hashlib.sha256(geometry_path.read_bytes()).hexdigest()
    )
    assert [region["id"] for region in first["regions"]] == [1, 2]


def test_writes_deterministic_operator_overlay_and_difference(tmp_path: Path) -> None:
    geometry = _two_regions()
    artwork = geometry.copy()
    artwork[30:40, 48:52] = np.where(
        np.indices((10, 4))[1] < 2,
        2,
        1,
    )
    geometry_path = _write_labels(tmp_path / "geometry.png", geometry)
    artwork_path = _write_labels(tmp_path / "artwork.png", artwork)
    report_path = tmp_path / "report.json"
    overlay_path = tmp_path / "overlay.png"
    difference_path = tmp_path / "difference.png"

    report = write_semantic_registration_artifacts(
        geometry_path,
        artwork_path,
        _manifest(),
        physical_width_mm=10,
        physical_height_mm=10,
        report_path=report_path,
        overlay_path=overlay_path,
        difference_path=difference_path,
    )

    assert report["decision"] == "fail"
    assert json.loads(report_path.read_text(encoding="utf-8")) == report
    assert (
        report["visualizations"]["overlay"]["sha256"]
        == hashlib.sha256(overlay_path.read_bytes()).hexdigest()
    )
    assert (
        report["visualizations"]["difference"]["sha256"]
        == hashlib.sha256(difference_path.read_bytes()).hexdigest()
    )
    with Image.open(overlay_path) as overlay, Image.open(difference_path) as difference:
        assert overlay.mode == difference.mode == "RGB"
        assert overlay.size == difference.size == (100, 100)


def test_rejects_canvas_mismatch_colour_png_and_invalid_thresholds(
    tmp_path: Path,
) -> None:
    labels = _two_regions()
    geometry_path = _write_labels(tmp_path / "geometry.png", labels)
    artwork_path = _write_labels(tmp_path / "artwork.png", labels[:90])
    with pytest.raises(ValueError, match="exact source canvas"):
        analyze_semantic_registration(
            geometry_path,
            artwork_path,
            _manifest(),
            physical_width_mm=10,
            physical_height_mm=10,
        )

    Image.new("RGB", (100, 100), (1, 2, 3)).save(artwork_path)
    with pytest.raises(ValueError, match="grayscale PNG"):
        analyze_semantic_registration(
            geometry_path,
            artwork_path,
            _manifest(),
            physical_width_mm=10,
            physical_height_mm=10,
        )

    with pytest.raises(ValueError, match="minimum_iou"):
        analyze_semantic_registration(
            geometry_path,
            geometry_path,
            _manifest(minimum_iou=1.1),
            physical_width_mm=10,
            physical_height_mm=10,
        )

    with pytest.raises(ValueError, match="only tighten maximum_boundary"):
        analyze_semantic_registration(
            geometry_path,
            geometry_path,
            _manifest(maximum_boundary_distance_mm=0.5),
            physical_width_mm=10,
            physical_height_mm=10,
        )

    with pytest.raises(TypeError, match="minimum_iou"):
        analyze_semantic_registration(
            geometry_path,
            geometry_path,
            _manifest(minimum_iou="0.99"),
            physical_width_mm=10,
            physical_height_mm=10,
        )
