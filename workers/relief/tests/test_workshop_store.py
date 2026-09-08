from __future__ import annotations

import hashlib
import os
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import build_relief_pro_package as package_builder
from workshop_store import LEASE_SECONDS, MAX_ATTEMPTS, WorkshopStore


REQUIRED_ARTIFACT_NAMES = {
    "model-glb", "model-stl", "model-3mf", "depth", "silhouette", "evidence",
    "registration", "layer-coverage", "cut-contour",
}
LEGACY_ARTIFACT_NAMES = {
    "candidate", "depth", "difference", "evidence", "layer-coverage", "manifest",
    "model-3mf", "model-glb", "model-stl", "overlay", "registration", "revision",
    "silhouette", "uv-artwork", "varnish-mask", "white-mask",
}


def _spec(*, width_mm: float = 70.0, layer_hash: str = "a" * 64,
          engine_sha256: str | None = None) -> dict:
    spec = {
        "workshop_version": "relief-workshop-v1",
        "recipe": {"width_mm": width_mm, "relief_depth_mm": 1.0},
        "source_hashes": {"relief_map": layer_hash, "mask": "b" * 64},
    }
    if engine_sha256 is not None:
        spec["engine_sha256"] = engine_sha256
    return spec


def _payload(marker: str = "one") -> dict:
    return {"layers": {"relief_map": marker, "mask": marker}}


def _required_result(extra: dict | None = None) -> dict:
    artifacts = {name: {} for name in REQUIRED_ARTIFACT_NAMES}
    if extra:
        artifacts.update(extra)
    return {"artifacts": artifacts}


def test_real_sqlite_owner_isolation_dedup_and_revision_identity(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    first, created = store.submit("alice", _spec(), _payload("first"))
    same, created_again = store.submit("alice", _spec(), _payload("different-payload"))
    changed_recipe, changed_recipe_created = store.submit(
        "alice", _spec(width_mm=80.0), _payload()
    )
    changed_layer, changed_layer_created = store.submit(
        "alice", _spec(layer_hash="c" * 64), _payload()
    )
    bob, bob_created = store.submit("bob", _spec(), _payload())

    assert created is True
    assert created_again is False
    assert same["id"] == first["id"]
    assert changed_recipe_created is True
    assert changed_layer_created is True
    assert bob_created is True
    assert {item["id"] for item in store.list("alice")} == {
        first["id"],
        changed_recipe["id"],
        changed_layer["id"],
    }
    assert store.get("bob", first["id"]) is None
    assert store.get("alice", bob["id"]) is None


def test_concurrent_sqlite_claims_issue_one_lease(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    submitted, _ = store.submit("alice", _spec(), _payload())
    barrier = threading.Barrier(4)

    def claim() -> dict | None:
        barrier.wait()
        return store.claim()

    with ThreadPoolExecutor(max_workers=4) as executor:
        claims = list(executor.map(lambda _unused: claim(), range(4)))

    claimed = [job for job in claims if job is not None]
    assert len(claimed) == 1
    assert claimed[0]["id"] == submitted["id"]
    stored = store.get("alice", submitted["id"])
    assert stored is not None
    assert stored["state"] == "running"
    assert stored["attempts"] == 1


def test_expired_lease_fences_stale_worker_and_enforces_three_attempt_limit(
    tmp_path: Path,
) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _ = store.submit("alice", _spec(), _payload())
    started = time.time()
    first = store.claim(now=started)
    assert first is not None
    second = store.claim(now=started + LEASE_SECONDS + 1)
    assert second is not None
    assert second["id"] == first["id"]
    assert second["lease_token"] != first["lease_token"]
    assert store.heartbeat(first, now=started + LEASE_SECONDS + 1) is False
    assert store.finish(first, _required_result()) is False

    third = store.claim(now=started + 2 * (LEASE_SECONDS + 1))
    assert third is not None
    assert third["id"] == revision["id"]
    assert store.claim(now=started + 3 * (LEASE_SECONDS + 1)) is None
    exhausted = store.get("alice", revision["id"])
    assert exhausted is not None
    assert exhausted["state"] == "failed"
    assert exhausted["error"] == "worker_interrupted_limit"
    assert exhausted["attempts"] == MAX_ATTEMPTS
    assert store.retry("alice", revision["id"]) is False


def test_failed_retry_is_bounded_and_completed_revision_is_immutable(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _ = store.submit("alice", _spec(), _payload())
    first = store.claim()
    assert first is not None
    assert store.finish(first, None, "controlled_failure") is True
    assert store.retry("alice", revision["id"]) is True
    retried = store.claim()
    assert retried is not None
    result = _required_result()
    result["marker"] = "immutable"
    assert store.finish(retried, result) is True
    overwritten = _required_result()
    overwritten["marker"] = "overwritten"
    assert store.finish(retried, overwritten) is False
    assert store.retry("alice", revision["id"]) is False
    duplicate, created = store.submit("alice", _spec(), _payload("new"))
    assert created is False
    assert duplicate["id"] == revision["id"]
    assert duplicate["state"] == "completed"
    assert duplicate["result"] == result


def _completed_artifact_job(store: WorkshopStore, owner: str = "alice") -> tuple[dict, dict, Path]:
    revision, _ = store.submit(owner, _spec(), _payload())
    job = store.claim()
    assert job is not None
    artifact_root = store.attempt_dir(job)
    artifact_root.mkdir(parents=True)
    artifact = artifact_root / "report.json"
    artifact.write_bytes(b'{"safe":true}')
    metadata = {
        "path": "report.json",
        "bytes": artifact.stat().st_size,
        "sha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "content_type": "application/json",
    }
    assert store.finish(job, _required_result({"report": metadata})) is True
    return revision, job, artifact


def test_artifact_owner_isolation_and_tamper_detection(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _job, artifact = _completed_artifact_job(store)

    resolved = store.artifact_path("alice", revision["id"], "report")
    assert resolved is not None
    assert resolved[0] == artifact
    assert store.artifact_path("bob", revision["id"], "report") is None

    artifact.write_bytes(b'{"tampered":true}')
    with pytest.raises(ValueError, match="artifact (unavailable|checksum mismatch)"):
        store.artifact_path("alice", revision["id"], "report")


def test_artifact_symlink_and_database_path_tampering_are_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _job, _artifact = _completed_artifact_job(store)
    completed = store.get("alice", revision["id"])
    assert completed is not None
    artifact_root = store.root / "artifacts" / revision["id"]
    lease_token = next(path.name for path in artifact_root.iterdir())
    attempt_root = artifact_root / lease_token
    outside = tmp_path / "outside.json"
    outside.write_text("outside", encoding="utf-8")
    link = attempt_root / "linked.json"
    try:
        os.symlink(outside, link)
    except OSError:
        link.write_bytes(outside.read_bytes())
        monkeypatch.setattr(
            package_builder, "_has_link_like_component", lambda path: Path(path) == link
        )
    link_metadata = {
        "artifacts": {
            "linked": {
                "path": "linked.json",
                "bytes": outside.stat().st_size,
                "sha256": hashlib.sha256(outside.read_bytes()).hexdigest(),
            }
        }
    }
    with store.connect() as db:
        db.execute("UPDATE revisions SET result=? WHERE id=?", (
            json.dumps(link_metadata), revision["id"]
        ))
    with pytest.raises(ValueError, match="invalid artifact path"):
        store.artifact_path("alice", revision["id"], "linked")


def test_legacy_completed_projection_marks_missing_cut_contour_without_mutating_row(
    tmp_path: Path,
) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _ = store.submit(
        "alice", _spec(engine_sha256="19837027de0359ff98d365db63ff3886e444b8271672114c9e793944036adaf9"), _payload()
    )
    legacy_artifacts = {name: {} for name in LEGACY_ARTIFACT_NAMES}
    with store.connect() as db:
        db.execute(
            "UPDATE revisions SET state='completed', result=? WHERE id=?",
            (json.dumps({"artifacts": legacy_artifacts}), revision["id"]),
        )

    public = store.get("alice", revision["id"])
    assert public is not None
    assert public["result"]["artifact_contract_status"] == "legacy_missing_cut_contour"
    assert "cut-contour" not in public["result"]["artifacts"]
    with store.connect() as db:
        raw = db.execute("SELECT result FROM revisions WHERE id=?", (revision["id"],)).fetchone()[0]
    assert "artifact_contract_status" not in raw


def test_wrong_engine_legacy_shape_is_not_marked(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _ = store.submit("alice", _spec(engine_sha256="wrong"), _payload())
    with store.connect() as db:
        db.execute(
            "UPDATE revisions SET state='completed', result=? WHERE id=?",
            (json.dumps({"artifacts": {name: {} for name in LEGACY_ARTIFACT_NAMES}}), revision["id"]),
        )
    public = store.get("alice", revision["id"])
    assert public is not None
    assert "artifact_contract_status" not in public["result"]


def test_superset_or_malformed_legacy_shape_is_not_marked(tmp_path: Path) -> None:
    cases = [
        LEGACY_ARTIFACT_NAMES | {"extra"},
        LEGACY_ARTIFACT_NAMES - {"white-mask"},
    ]
    for index, names in enumerate(cases):
        store = WorkshopStore(tmp_path / str(index))
        revision, _ = store.submit("alice", _spec(engine_sha256="19837027de0359ff98d365db63ff3886e444b8271672114c9e793944036adaf9"), _payload())
        with store.connect() as db:
            db.execute(
                "UPDATE revisions SET state='completed', result=? WHERE id=?",
                (json.dumps({"artifacts": {name: {} for name in names}}), revision["id"]),
            )
        public = store.get("alice", revision["id"])
        assert public is not None
        assert "artifact_contract_status" not in public["result"]


def test_new_completion_rejects_missing_or_non_dict_artifacts(tmp_path: Path) -> None:
    results = [
        {},
        {"artifacts": {}},
        {"artifacts": []},
        {"artifacts": {name: {} for name in REQUIRED_ARTIFACT_NAMES - {"cut-contour"}}},
    ]
    for index, result in enumerate(results):
        store = WorkshopStore(tmp_path / str(index))
        store.submit("alice", _spec(), _payload())
        job = store.claim()
        assert job is not None
        with pytest.raises(ValueError, match="completed result missing required artifacts"):
            store.finish(job, result)


def test_new_completion_accepts_all_required_artifacts(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, _ = store.submit("alice", _spec(), _payload())
    job = store.claim()
    assert job is not None
    assert store.finish(job, _required_result()) is True
    completed = store.get("alice", revision["id"])
    assert completed is not None
    assert completed["state"] == "completed"
