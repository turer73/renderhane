from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

import workshop_build
import workshop_worker
from workshop_contract import engine_fingerprint, toolchain
from workshop_store import WorkshopStore


def _current_spec(*, engine_sha256: str | None = None) -> dict:
    return {
        "engine_sha256": engine_fingerprint() if engine_sha256 is None else engine_sha256,
        "toolchain": toolchain(),
        "recipe": {"width_mm": 70.0, "relief_depth_mm": 1.0},
    }


def test_sync_attempt_flushes_real_files_before_posix_directories(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    storage = tmp_path / "workshop"
    attempt = storage / "artifacts" / "revision" / "lease"
    nested = attempt / "package"
    nested.mkdir(parents=True)
    (attempt / "result.json").write_text("{}", encoding="utf-8")
    (nested / "artifact.bin").write_bytes(b"durable bytes")

    modes: list[int] = []

    def record_fsync(fd: int) -> None:
        modes.append(os.fstat(fd).st_mode)

    monkeypatch.setattr(workshop_build.os, "fsync", record_fsync)
    workshop_build.sync_attempt(attempt, storage)

    assert sum(stat.S_ISREG(mode) for mode in modes) == 2
    if os.name == "posix":
        first_directory = next(index for index, mode in enumerate(modes) if stat.S_ISDIR(mode))
        assert all(stat.S_ISREG(mode) for mode in modes[:first_directory])
        assert all(stat.S_ISDIR(mode) for mode in modes[first_directory:])


def test_tree_bytes_stops_after_crossing_ceiling(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "artifacts"
    root.mkdir()
    over_limit = root / "over-limit.bin"
    over_limit.write_bytes(b"12345")
    must_not_be_read = root / "must-not-be-read.bin"
    must_not_be_read.write_bytes(b"unreachable")

    def ordered_rglob(_self: Path, _pattern: str):
        yield over_limit
        yield must_not_be_read

    monkeypatch.setattr(workshop_worker.Path, "rglob", ordered_rglob)
    assert workshop_worker.tree_bytes(root, ceiling=4) == 5


@pytest.mark.parametrize("capacity", ["low_disk", "storage_quota"])
def test_capacity_limits_fail_before_starting_child(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capacity: str
) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    revision, created = store.submit("operator", _current_spec(), {"layers": {}})
    assert created
    started: list[tuple[object, ...]] = []

    def forbidden_child(*args: object, **kwargs: object) -> object:
        started.append(args)
        raise AssertionError("capacity guard must run before child creation")

    monkeypatch.setattr(workshop_worker.subprocess, "Popen", forbidden_child)
    if capacity == "low_disk":
        monkeypatch.setattr(
            workshop_worker.shutil,
            "disk_usage",
            lambda _path: SimpleNamespace(free=workshop_worker.MIN_FREE_BYTES - 1),
        )
    else:
        monkeypatch.setattr(
            workshop_worker.shutil,
            "disk_usage",
            lambda _path: SimpleNamespace(free=workshop_worker.MIN_FREE_BYTES),
        )
        monkeypatch.setattr(
            workshop_worker,
            "tree_bytes",
            lambda _root, *, ceiling: workshop_worker.MAX_STORAGE_BYTES - workshop_worker.MAX_ATTEMPT_BYTES + 1,
        )

    assert workshop_worker.run_once(store) is True
    assert started == []
    saved = store.get("operator", revision["id"])
    assert saved is not None
    assert saved["state"] == "failed"
    assert saved["error"] == (
        "insufficient_disk_space" if capacity == "low_disk" else "pilot_storage_byte_limit"
    )


def test_engine_sha_change_fails_without_mutating_immutable_revision(tmp_path: Path) -> None:
    store = WorkshopStore(tmp_path / "workshop")
    stale_spec = _current_spec(engine_sha256="0" * 64)
    payload = {"layers": {"marker": "original"}}
    revision, created = store.submit("operator", stale_spec, payload)
    assert created

    assert workshop_worker.run_once(store) is True
    failed = store.get("operator", revision["id"])
    assert failed is not None
    assert failed["state"] == "failed"
    assert failed["error"] == "engine_changed_create_revision"

    duplicate, created_again = store.submit(
        "operator", stale_spec, {"layers": {"marker": "replacement"}}
    )
    assert created_again is False
    assert duplicate["id"] == revision["id"]
    assert duplicate["state"] == "failed"
    with store.connect() as db:
        row = db.execute("SELECT spec,payload FROM revisions WHERE id=?", (revision["id"],)).fetchone()
    assert row is not None
    assert json.loads(row["spec"]) == stale_spec
    assert json.loads(row["payload"]) == payload
