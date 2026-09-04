from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

from build_relief_pro_package import FIXED_ZIP_TIME, MARKER_NAME
from validate_artifacts import validate_artifact_set

ENGINE_VERSION = "relief-pro-package-finalizer-v0.1.0"
PACKAGE_NAME = "relief-pro-production-candidate.zip"
RECEIPT_NAME = "package-receipt.json"
MANIFEST_NAME = "manifest.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _assert_owned_package(root: Path) -> Path:
    resolved = root.expanduser().resolve()
    if not (resolved / MARKER_NAME).is_file():
        raise ValueError("directory is not an owned Renderhane Relief Pro package")
    if not (resolved / MANIFEST_NAME).is_file():
        raise ValueError("package manifest is missing")
    return resolved


def _write_deterministic_zip(root: Path, destination: Path, members: list[Path]) -> None:
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    if temporary.exists():
        temporary.unlink()
    with zipfile.ZipFile(
        temporary,
        "w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as archive:
        for path in sorted(members, key=lambda item: item.relative_to(root).as_posix()):
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


def finalize_package(root: Path, *, tolerance_mm: float = 0.02) -> dict[str, Any]:
    root = _assert_owned_package(root)
    manifest_path = root / MANIFEST_NAME
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("product_line") != "relief-pro":
        raise ValueError("manifest is not a Relief Pro package")

    geometry = root / "geometry"
    reports = root / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    consistency = validate_artifact_set(
        stl_path=geometry / "model.stl",
        glb_path=geometry / "model.glb",
        three_mf_path=geometry / "model.3mf",
        tolerance_mm=tolerance_mm,
    )
    consistency_path = reports / "artifact-consistency-report.json"
    consistency_path.write_text(
        json.dumps(
            consistency.to_dict(),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    geometry_report_path = geometry / "manufacturing-report.json"
    geometry_report = json.loads(geometry_report_path.read_text(encoding="utf-8"))
    geometry_validation = geometry_report.get("validation", {})
    geometry_gate = geometry_validation.get("digital_geometry_gate")
    geometry_warnings = geometry_validation.get("warnings") or []

    failures: list[str] = []
    warnings: list[str] = []
    if geometry_gate != "pass":
        failures.append("geometry_gate_failed")
    failures.extend(consistency.failures)
    warnings.extend(str(value) for value in geometry_warnings)
    warnings.extend(consistency.warnings)
    failures = sorted(set(failures))
    warnings = sorted(set(warnings))

    if failures:
        digital_status = "failed"
    elif warnings:
        digital_status = "ready_with_warnings"
    else:
        digital_status = "ready"

    manifest["package_finalizer_version"] = ENGINE_VERSION
    manifest["digital_geometry_status"] = digital_status
    manifest["digital_artifact_consistency"] = consistency.decision
    manifest["digital_failures"] = failures
    manifest["digital_warnings"] = warnings
    manifest["physical_validation_status"] = "pending"
    manifest["production_status"] = "not_approved_pending_physical_validation"

    excluded_names = {MARKER_NAME, PACKAGE_NAME, RECEIPT_NAME, MANIFEST_NAME}
    artifact_paths = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.name not in excluded_names
    ]
    manifest["artifacts"] = {
        path.relative_to(root).as_posix(): {
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted(artifact_paths)
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

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
        "digital_artifact_consistency": consistency.decision,
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
    }
    (root / RECEIPT_NAME).write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {"manifest": manifest, "receipt": receipt}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate and deterministically seal an existing Relief Pro package"
    )
    parser.add_argument("--package-dir", type=Path, required=True)
    parser.add_argument("--tolerance-mm", type=float, default=0.02)
    args = parser.parse_args(argv)

    try:
        result = finalize_package(
            args.package_dir,
            tolerance_mm=args.tolerance_mm,
        )
    except Exception as exc:
        print(f"package finalization failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(result["receipt"], ensure_ascii=False, sort_keys=True))
    return 0 if result["receipt"]["digital_geometry_status"] in {
        "ready",
        "ready_with_warnings",
    } else 1


if __name__ == "__main__":
    raise SystemExit(main())
