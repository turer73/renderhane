from __future__ import annotations

import csv
import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from product_relief_builder import ProductRecipe
from workshop_build import add_uv_appearance_assist
from workshop_contract import validate_submission
from workshop_store import WorkshopStore
from workshop_worker import run_once


def test_real_workshop_revision_build_finalization_download_and_restart(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    spec, payload = validate_submission({"sample": "calibration-v1", "acknowledge_candidate": True})
    submitted, created = store.submit("operator-a", spec, payload)
    assert created
    # This intentionally uses the real grid and canonical geometry/finalizer,
    # not a fake renderer or a relaxed physical tolerance.
    assert run_once(store)
    reopened = WorkshopStore(store.root)
    persisted = reopened.get("operator-a", submitted["id"])
    assert persisted["state"] == "completed", persisted["error"]
    result = persisted["result"]
    assert result["digital_geometry_status"] == "ready", result["digital_failures"]
    assert result["coverage"]["layer_coverage_status"] == "pass"
    assert result["artwork_semantic_registration_status"] == "validated"
    assert result["physical_validation_status"] == "pending"
    assert result["production_status"] == "not_approved"
    assert result["uv_appearance_status"] == "not_calibrated"
    assert result["uneven_surface_validation_status"] == "not_validated"
    assert set(result["artifacts"]) >= {
        "model-glb", "model-stl", "model-3mf", "cut-contour", "evidence",
        "overlay", "difference", "semantic-registration",
        "geometry-semantic-ids", "artwork-semantic-ids",
        "semantic-overlay", "semantic-difference",
        "uv-appearance-artwork", "uv-appearance-shading",
        "uv-appearance-normal", "uv-appearance-varnish",
        "uv-appearance-ticket",
    }
    assert result["artifacts"]["cut-contour"]["content_type"] == "image/svg+xml"
    for name, metadata in result["artifacts"].items():
        artifact, checked = reopened.artifact_path("operator-a", submitted["id"], name)
        assert hashlib.sha256(artifact.read_bytes()).hexdigest() == checked["sha256"] == metadata["sha256"]
        assert reopened.artifact_path("operator-b", submitted["id"], name) is None
    manifest_path, _ = reopened.artifact_path(
        "operator-a", submitted["id"], "manifest"
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["uv_appearance_assist"]["status"] == "not_calibrated"
    assert manifest["uv_appearance_assist"]["production_authority"] == "none"
    assert {
        "appearance/uv-artwork-depth-enhanced.png",
        "appearance/shading-map-16.png",
        "appearance/appearance-normal.png",
        "appearance/appearance-varnish-mask.png",
        "appearance/uv-appearance-job-ticket.json",
    } <= set(manifest["artifacts"])
    evidence, _ = reopened.artifact_path("operator-a", submitted["id"], "evidence")
    with zipfile.ZipFile(evidence) as package:
        assert "relief-pro-production-candidate.zip" in package.namelist()
        assert "semantic-registration-report.json" in package.namelist()
        assert "semantic-registration-overlay.png" in package.namelist()
        assert "semantic-registration-difference.png" in package.namelist()
        assert "semantic-registration/geometry-semantic-ids.png" in package.namelist()
        assert "semantic-registration/artwork-semantic-ids.png" in package.namelist()
        assert "uv-artwork-depth-enhanced.png" in package.namelist()
        assert "shading-map-16.png" in package.namelist()
        assert "appearance-normal.png" in package.namelist()
        assert "appearance-varnish-mask.png" in package.namelist()
        assert "uv-appearance-job-ticket.json" in package.namelist()
        assert "physical-measurement/fdm-physical-measurement-template-v2.csv" in package.namelist()
        assert json.loads(package.read("revision.json"))["spec_hash"] == submitted["spec_hash"]
        semantic = json.loads(package.read("semantic-registration-report.json"))
        revision = json.loads(package.read("revision.json"))
        assert semantic["artwork_semantic_registration_status"] == "validated"
        assert semantic["source_bindings"]["geometry_source_sha256"] == revision["spec"]["source_hashes"]["relief_map"]
        assert semantic["source_bindings"]["artwork_source_sha256"] == revision["spec"]["source_hashes"]["uv_artwork"]
        appearance = json.loads(package.read("uv-appearance-job-ticket.json"))
        assert appearance["appearance_status"] == "not_calibrated"
        assert appearance["physical_z_mm"] is None
        assert appearance["uneven_surface_validation_status"] == "not_validated"
        assert appearance["out_of_mask_changed_pixels"] == 0
        rows = list(csv.DictReader(io.StringIO(package.read("physical-measurement/fdm-physical-measurement-template-v2.csv").decode())))
        assert len(rows) == 8
        for row in rows:
            assert row["design_id"].startswith("workshop-")
            assert float(row["target_width_mm"]) == result["physical_width_mm"]
            assert float(row["target_height_mm"]) == result["physical_height_mm"]
            assert row["operator_decision"] == "pending"
            assert not row["measured_width_mm"]
            assert row["revision_id"] == (submitted["id"] if float(row["target_relief_mm"]) == 1.0 else "")
    again, created = reopened.submit("operator-a", spec, payload)
    assert not created and again["id"] == submitted["id"] and again["state"] == "completed"


def test_appearance_assist_skips_legacy_partial_rgba_without_breaking_package(
    tmp_path: Path,
) -> None:
    package = tmp_path / "package"
    artwork_dir = package / "artwork"
    artwork_dir.mkdir(parents=True)
    source = tmp_path / "source"
    source.mkdir()

    height = np.full((32, 32), 30_000, dtype=np.uint16)
    silhouette = np.full((32, 32), 255, dtype=np.uint8)
    artwork = np.zeros((32, 32, 4), dtype=np.uint8)
    artwork[:, :, :3] = (100, 120, 140)
    artwork[:, :, 3] = 128

    relief_path = source / "relief.png"
    silhouette_path = source / "silhouette.png"
    artwork_path = source / "artwork.png"
    Image.fromarray(height).save(relief_path)
    Image.fromarray(silhouette).save(silhouette_path)
    Image.fromarray(artwork).save(artwork_path)
    Image.fromarray(artwork).save(artwork_dir / "uv-artwork-srgb.png")

    ticket = add_uv_appearance_assist(
        package,
        {
            "relief_map": relief_path,
            "mask": silhouette_path,
            "uv_artwork": artwork_path,
        },
        {
            "registration": {
                "crop_box_px": [0, 0, 32, 32],
                "physical_canvas_mm": [70.0, 70.0],
            }
        },
        ProductRecipe(width_mm=70.0, height_mm=70.0, relief_depth_mm=1.0),
    )

    assert ticket is None
    assert not (package / "appearance-inputs").exists()
    assert not (package / "appearance").exists()
