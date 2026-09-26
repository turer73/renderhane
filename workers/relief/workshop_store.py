"""Private pilot queue. SQLite and artifacts MUST share a persistent local volume.

One immutable specification per owner/hash; leases fence stale workers. There are
no billing calls, public asset URLs or physical-approval mutations in this store.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
import stat
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

WORKSHOP_VERSION = "relief-workshop-v1"
MAX_ATTEMPTS = 3
LEASE_SECONDS = 90
MAX_REVISIONS = 200
OWNER_RE = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
LEGACY_ENGINE_SHA256 = "19837027de0359ff98d365db63ff3886e444b8271672114c9e793944036adaf9"
LEGACY_ARTIFACT_KEYS = frozenset({
    "candidate", "depth", "difference", "evidence", "layer-coverage", "manifest",
    "model-3mf", "model-glb", "model-stl", "overlay", "registration", "revision",
    "silhouette", "uv-artwork", "varnish-mask", "white-mask",
})
REQUIRED_COMPLETED_ARTIFACTS = frozenset({
    "model-glb", "model-stl", "model-3mf", "depth", "silhouette", "evidence",
    "registration", "layer-coverage", "cut-contour",
})


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


class WorkshopStore:
    def __init__(self, root: Path):
        self.root = root.absolute()
        if any(p.exists() and (p.is_symlink() or getattr(p.lstat(), "st_file_attributes", 0)
               & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)) for p in (self.root, *self.root.parents)):
            raise ValueError("workshop storage cannot use linked directories")
        self.root.mkdir(parents=True, exist_ok=True)
        self.database = self.root / "queue.sqlite3"
        if self.database.is_symlink():
            raise ValueError("workshop database cannot be a link")
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("""CREATE TABLE IF NOT EXISTS revisions (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, spec_hash TEXT NOT NULL,
                spec TEXT NOT NULL, payload TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed')),
                attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until REAL,
                created_at REAL NOT NULL, updated_at REAL NOT NULL,
                result TEXT, error TEXT, UNIQUE(owner, spec_hash))""")
            db.execute("CREATE INDEX IF NOT EXISTS queue_state ON revisions(state, created_at)")
            db.execute("CREATE TABLE IF NOT EXISTS runtime (name TEXT PRIMARY KEY, updated_at REAL NOT NULL)")

    def pulse(self) -> None:
        with self.connect() as db:
            db.execute("INSERT INTO runtime VALUES ('worker',?) ON CONFLICT(name) DO UPDATE SET updated_at=excluded.updated_at",
                       (time.time(),))

    def online(self) -> bool:
        with self.connect() as db:
            row = db.execute("SELECT updated_at FROM runtime WHERE name='worker'").fetchone()
            return bool(row and time.time() - row[0] < 45)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        try:
            with db:
                yield db
        finally:
            db.close()

    def public(self, row: sqlite3.Row) -> dict[str, Any]:
        result = json.loads(row["result"]) if row["result"] else None
        legacy_artifact_contract = False
        if row["state"] == "completed" and row["error"] is None and isinstance(result, dict):
            spec = json.loads(row["spec"])
            artifacts = result.get("artifacts")
            legacy_artifact_contract = (
                isinstance(spec, dict) and spec.get("engine_sha256") == LEGACY_ENGINE_SHA256 and
                isinstance(artifacts, dict) and set(artifacts) == LEGACY_ARTIFACT_KEYS
            )
        if isinstance(result, dict):
            result = {key: value for key, value in result.items() if key != "artifact_contract_status"}
            if legacy_artifact_contract:
                result["artifact_contract_status"] = "legacy_missing_cut_contour"
        return {
            key: row[key] for key in
            ("id", "spec_hash", "state", "attempts", "created_at", "updated_at", "error")
        } | {
            "spec": json.loads(row["spec"]),
            "result": result,
        }

    def submit(self, owner: str, spec: dict, payload: dict) -> tuple[dict, bool]:
        if not OWNER_RE.fullmatch(owner):
            raise ValueError("invalid owner")
        spec_json = canonical_json(spec)
        spec_hash = hashlib.sha256(spec_json.encode()).hexdigest()
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM revisions WHERE owner=? AND spec_hash=?",
                             (owner, spec_hash)).fetchone()
            if row:
                return self.public(row), False
            if db.execute("SELECT count(*) FROM revisions").fetchone()[0] >= MAX_REVISIONS:
                raise ValueError("pilot_storage_limit: archive with an operator before adding revisions")
            active = db.execute(
                "SELECT count(*) FROM revisions WHERE owner=? AND state IN ('queued','running')",
                (owner,),
            ).fetchone()[0]
            if active >= 4:
                raise ValueError("queue_limit: at most four active revisions per operator")
            revision_id = str(uuid.uuid4())
            db.execute("""INSERT INTO revisions
                (id,owner,spec_hash,spec,payload,state,created_at,updated_at)
                VALUES (?,?,?,?,?,'queued',?,?)""",
                       (revision_id, owner, spec_hash, spec_json, canonical_json(payload), now, now))
            row = db.execute("SELECT * FROM revisions WHERE id=?", (revision_id,)).fetchone()
            return self.public(row), True

    def list(self, owner: str) -> list[dict]:
        with self.connect() as db:
            return [self.public(row) for row in db.execute(
                "SELECT * FROM revisions WHERE owner=? ORDER BY created_at DESC LIMIT 50", (owner,))]

    def get(self, owner: str, revision_id: str) -> dict | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM revisions WHERE owner=? AND id=?",
                             (owner, revision_id)).fetchone()
            return self.public(row) if row else None

    def claim(self, *, now: float | None = None) -> dict | None:
        now = time.time() if now is None else now
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("""UPDATE revisions SET state='failed', error='worker_interrupted_limit',
                lease_token=NULL, lease_until=NULL, updated_at=?
                WHERE state='running' AND lease_until<=? AND attempts>=?""",
                       (now, now, MAX_ATTEMPTS))
            row = db.execute("""SELECT * FROM revisions WHERE
                (state='queued' OR (state='running' AND lease_until<=?)) AND attempts<?
                ORDER BY created_at LIMIT 1""", (now, MAX_ATTEMPTS)).fetchone()
            if row is None:
                return None
            token = str(uuid.uuid4())
            db.execute("""UPDATE revisions SET state='running', attempts=attempts+1,
                lease_token=?,lease_until=?,updated_at=?,error=NULL WHERE id=?""",
                       (token, now + LEASE_SECONDS, now, row["id"]))
            return {"id": row["id"], "lease_token": token, "spec": json.loads(row["spec"]),
                    "payload": json.loads(row["payload"]), "spec_hash": row["spec_hash"]}

    def heartbeat(self, job: dict, *, now: float | None = None) -> bool:
        now = time.time() if now is None else now
        with self.connect() as db:
            return db.execute("""UPDATE revisions SET lease_until=?,updated_at=?
                WHERE id=? AND lease_token=? AND state='running' AND lease_until>?""",
                              (now + LEASE_SECONDS, now, job["id"], job["lease_token"], now)).rowcount == 1

    def finish(self, job: dict, result: dict | None, error: str | None = None) -> bool:
        if error is None:
            artifacts = result.get("artifacts") if isinstance(result, dict) else None
            missing = REQUIRED_COMPLETED_ARTIFACTS - set(artifacts) if isinstance(artifacts, dict) else REQUIRED_COMPLETED_ARTIFACTS
            if missing:
                raise ValueError(f"completed result missing required artifacts: {', '.join(sorted(missing))}")

        now = time.time()
        with self.connect() as db:
            return db.execute("""UPDATE revisions SET state=?,result=?,error=?,updated_at=?,
                lease_until=NULL WHERE id=? AND lease_token=? AND state='running' AND lease_until>?""",
                              ("failed" if error else "completed",
                               canonical_json(result) if result else None, error, now,
                               job["id"], job["lease_token"], now)).rowcount == 1

    def retry(self, owner: str, revision_id: str) -> bool:
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            active = db.execute(
                "SELECT count(*) FROM revisions WHERE owner=? AND state IN ('queued','running')",
                (owner,),
            ).fetchone()[0]
            if active >= 4:
                return False
            return db.execute("""UPDATE revisions SET state='queued',error=NULL,updated_at=?
                WHERE id=? AND owner=? AND state='failed' AND attempts<?""",
                              (time.time(), revision_id, owner, MAX_ATTEMPTS)).rowcount == 1

    def attempt_dir(self, job: dict) -> Path:
        # Only server-created UUIDs may ever become path components.
        for key in ("id", "lease_token"):
            if str(uuid.UUID(job[key])) != job[key]:
                raise ValueError("invalid job path")
        path = self.root / "artifacts" / job["id"] / job["lease_token"]
        from build_relief_pro_package import _has_link_like_component
        if _has_link_like_component(path):
            raise ValueError("linked artifact path")
        return path

    def artifact_path(self, owner: str, revision_id: str, name: str) -> tuple[Path, dict] | None:
        with self.connect() as db:
            row = db.execute("SELECT * FROM revisions WHERE id=? AND owner=? AND state='completed'",
                             (revision_id, owner)).fetchone()
            if row is None:
                return None
            result = json.loads(row["result"])
            artifact = result["artifacts"].get(name)
            if artifact is None:
                return None
            root = self.attempt_dir(dict(row))
            path = root / artifact["path"]
            from build_relief_pro_package import _has_link_like_component
            if not path.resolve().is_relative_to(root.resolve()) or _has_link_like_component(path):
                raise ValueError("invalid artifact path")
            if not path.is_file() or path.stat().st_size != artifact["bytes"]:
                raise ValueError("artifact unavailable")
            # Validate durable bytes again; a completed row is not a storage-integrity proof.
            if hashlib.sha256(path.read_bytes()).hexdigest() != artifact["sha256"]:
                raise ValueError("artifact checksum mismatch")
            return path, artifact
