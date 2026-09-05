from __future__ import annotations

import hashlib
import csv
import io
import json
import zipfile
from pathlib import Path

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
    assert result["artwork_semantic_registration_status"] == "not_validated"
    assert result["physical_validation_status"] == "pending"
    assert result["production_status"] == "not_approved"
    assert set(result["artifacts"]) >= {"model-glb", "model-stl", "model-3mf", "cut-contour", "evidence", "overlay", "difference"}
    assert result["artifacts"]["cut-contour"]["content_type"] == "image/svg+xml"
    for name, metadata in result["artifacts"].items():
        artifact, checked = reopened.artifact_path("operator-a", submitted["id"], name)
        assert hashlib.sha256(artifact.read_bytes()).hexdigest() == checked["sha256"] == metadata["sha256"]
        assert reopened.artifact_path("operator-b", submitted["id"], name) is None
    evidence, _ = reopened.artifact_path("operator-a", submitted["id"], "evidence")
    with zipfile.ZipFile(evidence) as package:
        assert "relief-pro-production-candidate.zip" in package.namelist()
        assert "physical-measurement/fdm-physical-measurement-template-v2.csv" in package.namelist()
        assert json.loads(package.read("revision.json"))["spec_hash"] == submitted["spec_hash"]
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
