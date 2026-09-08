"""Restart-safe bounded consumer. Run separately from the HTTP control service."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

from workshop_store import WorkshopStore, canonical_json
from workshop_contract import engine_fingerprint, toolchain

BUILD_TIMEOUT_SECONDS = 900
MAX_ATTEMPT_BYTES = 256 * 1024**2
MAX_STORAGE_BYTES = 8 * 1024**3
MIN_FREE_BYTES = 2 * 1024**3


def tree_bytes(root: Path, *, ceiling: int) -> int:
    size = 0
    if root.exists():
        for path in root.rglob("*"):
            if path.is_file():
                size += path.stat().st_size
                if size > ceiling:
                    break
    return size


def run_once(store: WorkshopStore) -> bool:
    store.pulse()
    job = store.claim()
    if job is None:
        return False
    if job["spec"].get("engine_sha256") != engine_fingerprint() or job["spec"].get("toolchain") != toolchain():
        store.finish(job, None, "engine_changed_create_revision")
        return True
    # In a capacity incident, leave a failed revision with a bounded explicit retry.
    if shutil.disk_usage(store.root).free < MIN_FREE_BYTES:
        store.finish(job, None, "insufficient_disk_space")
        return True
    if tree_bytes(store.root, ceiling=MAX_STORAGE_BYTES) > MAX_STORAGE_BYTES - MAX_ATTEMPT_BYTES:
        store.finish(job, None, "pilot_storage_byte_limit")
        return True
    job_path = store.root / f"request-{job['lease_token']}.json"
    with job_path.open("x", encoding="utf-8") as file:
        file.write(canonical_json(job))
        file.flush()
        os.fsync(file.fileno())
    process = None
    try:
        process = subprocess.Popen(
            [sys.executable, str(Path(__file__).with_name("workshop_build.py")),
             "--root", str(store.root), "--job", str(job_path)],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        started = time.monotonic()
        while True:
            try:
                code = process.wait(timeout=5)
                break
            except subprocess.TimeoutExpired:
                store.pulse()
                if not store.heartbeat(job):
                    process.kill()
                    process.wait()
                    return True  # Superseded attempts must never publish.
                if (shutil.disk_usage(store.root).free < MIN_FREE_BYTES or
                        tree_bytes(store.attempt_dir(job), ceiling=MAX_ATTEMPT_BYTES) > MAX_ATTEMPT_BYTES):
                    process.kill()
                    process.wait()
                    store.finish(job, None, "output_storage_limit")
                    return True
                if time.monotonic() - started > BUILD_TIMEOUT_SECONDS:
                    process.kill()
                    process.wait()
                    store.finish(job, None, "build_timeout")
                    return True
        if code != 0:
            store.finish(job, None, "geometry_or_input_validation_failed")
        else:
            if (shutil.disk_usage(store.root).free < MIN_FREE_BYTES or
                    tree_bytes(store.attempt_dir(job), ceiling=MAX_ATTEMPT_BYTES) > MAX_ATTEMPT_BYTES):
                store.finish(job, None, "output_storage_limit")
                return True
            result = json.loads((store.attempt_dir(job) / "result.json").read_text(encoding="utf-8"))
            store.finish(job, result)
    except (OSError, ValueError):
        store.finish(job, None, "worker_io_failure")
    finally:
        if process is not None and process.poll() is None:
            process.kill()
            process.wait()
        job_path.unlink(missing_ok=True)  # Only this attempt's owned scratch input.
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    queue = WorkshopStore(Path(os.environ["RELIEF_WORKSHOP_DATA"]))
    while True:
        worked = run_once(queue)
        if args.once:
            break
        if not worked:
            time.sleep(2)
