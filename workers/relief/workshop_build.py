"""One deterministic build attempt. Called in a bounded child process, not Next.js."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import zipfile
from pathlib import Path

from analyze_artwork_layers import analyze_artwork_layers
from analyze_semantic_registration import write_semantic_registration_artifacts
from build_relief_pro_package import build_relief_pro_package
from finalize_relief_pro_package import finalize_package
from physical_evidence_templates import (
    write_bound_fdm_template,
    write_bound_uv_template,
)
from PIL import Image
from product_relief_builder import ProductRecipe
from workshop_contract import engine_fingerprint, toolchain
from workshop_store import WorkshopStore, canonical_json


def write_json(path: Path, value: dict) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(canonical_json(value) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def sync_attempt(root: Path, storage_root: Path) -> None:
    """Publish barrier before SQLite completion (POSIX local filesystem).

    Windows development flushes file contents; Linux deployment also fsyncs
    directory entries leaf-to-root. This cannot replace a filesystem backup.
    """
    for path in root.rglob("*"):
        if path.is_file():
            with path.open("r+b") as handle:
                os.fsync(handle.fileno())
    if os.name == "posix":
        directories = [path for path in root.rglob("*") if path.is_dir()]
        directories.extend([root, root.parent, root.parent.parent, storage_root])
        for directory in sorted(set(directories), key=lambda path: len(path.parts), reverse=True):
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)


def write_physical_templates(root: Path, job: dict, width_mm: float, height_mm: float) -> list[Path]:
    """Bind targets to this design, without inventing measurements or other depths' revisions."""
    destination = root / "physical-measurement"
    destination.mkdir()
    source_hash = hashlib.sha256(canonical_json(job["spec"]["source_hashes"]).encode()).hexdigest()[:12]
    design_id = f"workshop-{source_hash}"
    active_depth = float(job["spec"]["recipe"]["relief_depth_mm"])
    depths = (0.6, 1.0, 1.4, 1.8)
    fdm = write_bound_fdm_template(
        destination / "fdm-physical-measurement-template-v2.csv",
        design_id=design_id,
        revisions_by_depth={depth: job["id"] if depth == active_depth else "" for depth in depths},
        engines_by_depth={
            depth: job["spec"]["package_engine"] if depth == active_depth else ""
            for depth in depths
        },
        target_width_mm=width_mm,
        target_height_mm=height_mm,
        target_base_mm=float(job["spec"]["recipe"]["base_thickness_mm"]),
    )
    uv = write_bound_uv_template(
        destination / "uv-physical-measurement-template-v2.csv",
        coupon_id=f"UV-{design_id}-{job['id'][:8]}",
        target_width_mm=width_mm,
        target_height_mm=height_mm,
    )
    written = [fdm, uv]
    for path in written:
        with path.open("r+b") as handle:
            os.fsync(handle.fileno())
    return written


def build_attempt(store: WorkshopStore, job: dict) -> dict:
    if job["spec"]["toolchain"] != toolchain() or job["spec"]["engine_sha256"] != engine_fingerprint():
        raise ValueError("toolchain_changed: submit a new revision on this engine")
    root = store.attempt_dir(job)
    root.mkdir(parents=True, exist_ok=False)
    sources = root / "inputs"
    sources.mkdir()
    paths = {}
    for role, encoded in job["payload"]["layers"].items():
        raw = base64.b64decode(encoded, validate=True)
        if hashlib.sha256(raw).hexdigest() != job["spec"]["source_hashes"][role]:
            raise ValueError("stored_source_checksum_mismatch")
        paths[role] = sources / f"{role}.png"
        paths[role].write_bytes(raw)
    package = root / "package"
    recipe = ProductRecipe(**job["spec"]["recipe"])
    build_relief_pro_package(
        relief_map=paths["relief_map"],
        mask=paths["mask"],
        uv_artwork=paths.get("uv_artwork"),
        white_mask=paths.get("white_mask"),
        varnish_mask=paths.get("varnish_mask"),
        output_dir=package,
        recipe=recipe,
        title="Relief Pro — digital test candidate",
    )
    finalized = finalize_package(package)
    manifest = finalized["manifest"]
    # Coverage is measured on ORIGINAL inputs: cropping must not hide spilled ink.
    with Image.open(paths["mask"]) as silhouette:
        left, top, right, bottom = silhouette.getbbox()
        width, height = silhouette.size
    pitch = recipe.width_mm / (right - left)
    coverage = analyze_artwork_layers(
        paths["mask"], paths.get("uv_artwork"), paths.get("white_mask"), paths.get("varnish_mask"),
        width_mm=pitch * width, height_mm=pitch * height,
    )
    write_json(root / "layer-coverage-report.json", coverage)
    semantic_report = None
    semantic_manifest = job["spec"].get("semantic_manifest")
    if semantic_manifest is not None:
        semantic_report = write_semantic_registration_artifacts(
            paths["geometry_semantic_ids"],
            paths["artwork_semantic_ids"],
            semantic_manifest,
            physical_width_mm=pitch * width,
            physical_height_mm=pitch * height,
            report_path=root / "semantic-registration-report.json",
            overlay_path=root / "semantic-registration-overlay.png",
            difference_path=root / "semantic-registration-difference.png",
        )
    write_json(root / "revision.json", {"id": job["id"], "spec_hash": job["spec_hash"],
                                       "spec": job["spec"]})
    # Evidence bundle keeps the canonical finalized ZIP intact. The semantic
    # sidecar is scoped to the immutable revision and cannot grant physical approval.
    candidates = {
        "candidate": (package / "relief-pro-production-candidate.zip", "application/zip"),
        "model-glb": (package / "geometry/model.glb", "model/gltf-binary"),
        "model-stl": (package / "geometry/model.stl", "model/stl"),
        "model-3mf": (package / "geometry/model.3mf", "model/3mf"),
        "manifest": (package / "manifest.json", "application/json"),
        "registration": (package / "artwork/registration.json", "application/json"),
        "cut-contour": (package / "artwork/cut-contour.svg", "image/svg+xml"),
        "layer-coverage": (root / "layer-coverage-report.json", "application/json"),
        "revision": (root / "revision.json", "application/json"),
        "silhouette": (package / "geometry/final-glb-orthographic-silhouette.png", "image/png"),
        "depth": (package / "geometry/final-glb-orthographic-depth-16.png", "image/png"),
    }
    if semantic_report is not None:
        candidates.update({
            "semantic-registration": (
                root / "semantic-registration-report.json",
                "application/json",
            ),
            "geometry-semantic-ids": (
                paths["geometry_semantic_ids"],
                "image/png",
            ),
            "artwork-semantic-ids": (
                paths["artwork_semantic_ids"],
                "image/png",
            ),
            "semantic-overlay": (
                root / "semantic-registration-overlay.png",
                "image/png",
            ),
            "semantic-difference": (
                root / "semantic-registration-difference.png",
                "image/png",
            ),
        })
    for role, filename in (("uv-artwork", "uv-artwork-srgb.png"), ("white-mask", "white-mask.png"),
                           ("varnish-mask", "varnish-mask.png")):
        path = package / "artwork" / filename
        if path.is_file():
            candidates[role] = (path, "image/png")
    for name, rel in (("overlay", "reports/final-glb-silhouette-overlay.png"),
                      ("difference", "reports/final-glb-depth-difference.png")):
        if (package / rel).is_file():
            candidates[name] = (package / rel, "image/png")
    physical_templates = write_physical_templates(root, job, recipe.width_mm, pitch * (bottom - top))
    evidence = root / "workshop-evidence.zip"
    with zipfile.ZipFile(evidence, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        evidence_files = [
            candidates["candidate"][0],
            root / "layer-coverage-report.json",
            root / "revision.json",
        ]
        if semantic_report is not None:
            evidence_files.extend(
                [
                    root / "semantic-registration-report.json",
                    root / "semantic-registration-overlay.png",
                    root / "semantic-registration-difference.png",
                ]
            )
        for path in evidence_files:
            info = zipfile.ZipInfo(path.name, (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
        if semantic_report is not None:
            for role in ("geometry_semantic_ids", "artwork_semantic_ids"):
                path = paths[role]
                archive_name = f"semantic-registration/{role.replace('_', '-')}.png"
                info = zipfile.ZipInfo(archive_name, (1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                bundle.writestr(info, path.read_bytes())
        for path in physical_templates:
            info = zipfile.ZipInfo(f"physical-measurement/{path.name}", (1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(info, path.read_bytes())
    candidates["evidence"] = (evidence, "application/zip")
    artifacts = {}
    for name, (path, mime) in candidates.items():
        # Windows FlushFileBuffers requires a writable handle; no bytes are changed.
        with path.open("r+b") as handle:
            os.fsync(handle.fileno())
        artifacts[name] = {"path": path.relative_to(root).as_posix(), "bytes": path.stat().st_size,
                           "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "content_type": mime}
    semantic_status = (
        semantic_report["artwork_semantic_registration_status"]
        if semantic_report is not None
        else "not_validated"
    )
    result = {"digital_geometry_status": manifest["digital_geometry_status"],
              "digital_failures": manifest["digital_failures"], "digital_warnings": manifest["digital_warnings"],
              "artwork_file_set_status": manifest["artwork_file_set_status"],
              "artwork_semantic_registration_status": semantic_status,
              "physical_validation_status": "pending", "production_status": "not_approved",
              "coverage": coverage, "artifacts": artifacts,
              "physical_width_mm": recipe.width_mm, "physical_height_mm": pitch * (bottom - top),
              "limitations": ["No albedo is reconstructed from the untextured GLB.",
                              "Layer coverage is not internal semantic alignment; only the optional stable-ID semantic report measures declared regions.",
                              "Minimum printable details and actual RIP/ink/head clearance are not approved."]}
    # The readiness marker is replaced atomically, then directory entries and
    # data are flushed. The parent publishes the DB state only after child exit.
    write_json(root / "result.tmp", result)
    os.replace(root / "result.tmp", root / "result.json")
    sync_attempt(root, store.root)
    return result


if __name__ == "__main__":
    if os.name == "posix":
        import resource
        resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024**2, 64 * 1024**2))
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--job", type=Path, required=True)
    args = parser.parse_args()
    build_attempt(WorkshopStore(args.root), json.loads(args.job.read_text(encoding="utf-8")))
