from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import finalize_relief_pro_package as finalizer_module
from build_relief_pro_package import build_relief_pro_package
from finalize_relief_pro_package import finalize_package
from product_relief_builder import ProductRecipe


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _refresh_manifest_artifact(package: Path, artifact: Path) -> None:
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    relative = artifact.relative_to(package).as_posix()
    manifest["artifacts"][relative] = {
        "bytes": artifact.stat().st_size,
        "sha256": _sha256(artifact),
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _build_simple_package(
    tmp_path: Path,
    *,
    complete_artwork: bool = False,
    relief_value: int = 32768,
    palette_uv: bool = False,
) -> Path:
    tmp_path.mkdir(parents=True, exist_ok=True)
    size = 64
    relief = np.full((size, size), relief_value, dtype=np.uint16)
    mask = np.full((size, size), 255, dtype=np.uint8)
    relief_path = tmp_path / "relief.png"
    mask_path = tmp_path / "mask.png"
    Image.fromarray(relief, mode="I;16").save(relief_path)
    Image.fromarray(mask, mode="L").save(mask_path)
    artwork: dict[str, Path] = {}
    if complete_artwork:
        rgba = np.zeros((size, size, 4), dtype=np.uint8)
        rgba[..., :3] = [170, 120, 80]
        rgba[..., 3] = mask
        artwork = {
            "uv_artwork": tmp_path / "uv.png",
            "white_mask": tmp_path / "white.png",
            "varnish_mask": tmp_path / "varnish.png",
        }
        if palette_uv:
            indices = np.zeros((size, size), dtype=np.uint8)
            indices[:, size // 2 :] = 1
            uv_image = Image.fromarray(indices, mode="P")
            palette = [0] * 768
            palette[:6] = [170, 120, 80, 80, 120, 170]
            uv_image.putpalette(palette)
            uv_image.save(artwork["uv_artwork"])
        else:
            Image.fromarray(rgba, mode="RGBA").save(artwork["uv_artwork"])
        Image.fromarray(mask, mode="L").save(artwork["white_mask"])
        Image.fromarray(mask, mode="L").save(artwork["varnish_mask"])
    package = tmp_path / "package"
    build_relief_pro_package(
        relief_map=relief_path,
        mask=mask_path,
        output_dir=package,
        recipe=ProductRecipe(width_mm=40, height_mm=40, grid_long_edge=64),
        **artwork,
    )
    return package


def test_finalizer_fails_shifted_geometry_registration(tmp_path: Path) -> None:
    size = 128
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    source_mask = (x - centre) ** 2 + (y - centre) ** 2 <= (size * 0.38) ** 2
    relief = np.clip(
        1.0 - np.sqrt((x - centre) ** 2 + (y - centre) ** 2) / (size * 0.38),
        0.0,
        1.0,
    )
    relief[~source_mask] = 0.0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., :3] = [170, 120, 80]
    rgba[..., 3] = (source_mask * 255).astype(np.uint8)

    fixture = tmp_path / "fixture"
    fixture.mkdir()
    relief_path = fixture / "relief.png"
    mask_path = fixture / "mask.png"
    uv_path = fixture / "uv.png"
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(relief_path)
    Image.fromarray((source_mask * 255).astype(np.uint8), mode="L").save(mask_path)
    Image.fromarray(rgba, mode="RGBA").save(uv_path)

    package = tmp_path / "package"
    build_relief_pro_package(
        relief_map=relief_path,
        mask=mask_path,
        uv_artwork=uv_path,
        output_dir=package,
        recipe=ProductRecipe(
            width_mm=70.0,
            height_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=1.0,
            grid_long_edge=96,
        ),
    )

    geometry_mask_path = package / "geometry/silhouette-mask-normalized.png"
    geometry_mask = np.asarray(
        Image.open(geometry_mask_path).convert("L"),
        dtype=np.uint8,
    )
    shifted = np.zeros_like(geometry_mask)
    shifted[:, 3:] = geometry_mask[:, :-3]
    Image.fromarray(shifted, mode="L").save(geometry_mask_path)
    geometry_report_path = package / "geometry/manufacturing-report.json"
    geometry_report = json.loads(geometry_report_path.read_text(encoding="utf-8"))
    geometry_report["validation"]["extents_mm"][:2] = [1.0, 1.0]
    geometry_report_path.write_text(
        json.dumps(
            geometry_report,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    # Even if a caller rewrites the unsigned manifest after tampering, registration
    # must use independently measured STL extents rather than mutable report values.
    _refresh_manifest_artifact(package, geometry_mask_path)
    _refresh_manifest_artifact(package, geometry_report_path)

    result = finalize_package(
        package,
        registration_tolerance_mm=0.5,
    )

    assert result["receipt"]["digital_geometry_status"] == "failed"
    assert result["receipt"]["digital_contour_registration"] == "fail"
    assert result["receipt"]["physical_validation_status"] == "pending"
    assert any(
        value.startswith("registration:")
        for value in result["manifest"]["digital_failures"]
    )
    assert "geometry_report:extents_mismatch" in result["manifest"]["digital_failures"]


def test_finalizer_rejects_manifested_artifact_tampering(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    geometry_mask_path = package / "geometry/silhouette-mask-normalized.png"
    geometry_mask_path.write_bytes(geometry_mask_path.read_bytes() + b"tampered")

    with pytest.raises(ValueError, match="artifact (size|digest) mismatch"):
        finalize_package(package)


def test_finalizer_rejects_undeclared_files(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    (package / "unexpected-secret.txt").write_text("must not be packaged", encoding="utf-8")

    with pytest.raises(ValueError, match="undeclared artifact"):
        finalize_package(package)


def test_finalizer_rejects_source_canvas_over_safe_limit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    package = _build_simple_package(tmp_path)
    monkeypatch.setattr(finalizer_module, "MAX_CANVAS_PIXELS", 1024)

    with pytest.raises(ValueError, match="safe canvas limit"):
        finalize_package(package)


def test_finalizer_fails_source_provenance_mismatch(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    packaged_source = package / "source/relief-map-16.png"
    Image.fromarray(
        np.full((64, 64), 16384, dtype=np.uint16),
        mode="I;16",
    ).save(packaged_source)
    # Exercise the cross-report provenance checks even if the unsigned manifest
    # artifact record was refreshed by an external caller.
    _refresh_manifest_artifact(package, packaged_source)

    result = finalize_package(package)

    assert result["receipt"]["digital_geometry_status"] == "failed"
    assert (
        "provenance:relief_map_sha256_mismatch"
        in result["manifest"]["digital_failures"]
    )


def test_finalizer_fails_tampered_geometry_validation_after_manifest_refresh(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    report_path = package / "geometry/manufacturing-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["validation"]["digital_status"] = "validated"
    report["validation"]["digital_geometry_gate"] = "pass"
    report["validation"]["failures"] = []
    report["validation"]["warnings"] = []
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _refresh_manifest_artifact(package, report_path)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert (
        "provenance:product_validation_mismatch"
        in result["manifest"]["digital_failures"]
    )


def test_finalizer_fails_matching_malformed_validation_contracts(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    malformed = {
        "digital_status": "validated",
        "digital_geometry_gate": "pass",
        "failures": "",
        "warnings": "",
    }
    report_path = package / "geometry/manufacturing-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["validation"].update(malformed)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["product_validation"] = malformed
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _refresh_manifest_artifact(package, report_path)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert (
        "provenance:product_validation_mismatch"
        in result["manifest"]["digital_failures"]
    )


def test_finalizer_fails_matching_valid_but_spoofed_validation_contracts(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    spoofed = {
        "digital_status": "validated",
        "digital_geometry_gate": "pass",
        "failures": [],
        "warnings": [],
    }
    report_path = package / "geometry/manufacturing-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["validation"].update(spoofed)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["product_validation"] = spoofed
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _refresh_manifest_artifact(package, report_path)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert (
        "provenance:product_validation_mismatch"
        in result["manifest"]["digital_failures"]
    )


def test_invalid_registration_tolerance_leaves_package_retryable(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path)

    with pytest.raises(ValueError, match="tolerance_mm must be positive"):
        finalize_package(package, registration_tolerance_mm=-1)

    assert not (package / "reports/artifact-consistency-report.json").exists()
    assert not (package / "reports/contour-registration-report.json").exists()
    result = finalize_package(package)
    assert result["receipt"]["digital_package_status"] == "needs_review"


def test_finalizer_recovers_exact_legacy_temporary_zip(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    legacy_temporary = package / "relief-pro-production-candidate.zip.tmp"
    legacy_temporary.write_bytes(b"interrupted finalizer output")

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "needs_review"
    assert not legacy_temporary.exists()


@pytest.mark.parametrize(
    "relative",
    [
        "reports/artifact-consistency-report.json",
        "reports/contour-registration-report.json",
    ],
)
def test_finalizer_recovers_uncommitted_owned_report(
    tmp_path: Path,
    relative: str,
) -> None:
    package = _build_simple_package(tmp_path)
    uncommitted = package / relative
    uncommitted.write_text("{}\n", encoding="utf-8")

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "needs_review"
    assert relative in result["manifest"]["artifacts"]


def test_finalizer_recovers_after_owned_report_write_interruption(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    finalize_package(package)
    original_write = finalizer_module._write_json_atomic
    writes = 0

    def interrupt_after_first_write(
        root: Path,
        destination: Path,
        value: object,
    ) -> None:
        nonlocal writes
        original_write(root, destination, value)
        writes += 1
        if writes == 1:
            raise RuntimeError("simulated interruption")

    monkeypatch.setattr(
        finalizer_module,
        "_write_json_atomic",
        interrupt_after_first_write,
    )
    with pytest.raises(RuntimeError, match="simulated interruption"):
        finalize_package(package, tolerance_mm=0.01)

    monkeypatch.setattr(finalizer_module, "_write_json_atomic", original_write)
    result = finalize_package(package, tolerance_mm=0.01)

    assert result["receipt"]["digital_package_status"] == "needs_review"


def test_finalizer_rejects_external_report_link_without_deleting_target(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path)
    reports = package / "reports"
    reports.rmdir()
    external = tmp_path / "external-reports"
    external.mkdir()
    external_report = external / "artifact-consistency-report.json"
    external_report.write_text('{"external":true}\n', encoding="utf-8")
    if os.name == "nt":
        created = subprocess.run(
            [
                "cmd.exe",
                "/d",
                "/c",
                "mklink",
                "/J",
                str(reports),
                str(external),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert created.returncode == 0, created.stderr or created.stdout
    else:
        reports.symlink_to(external, target_is_directory=True)

    try:
        with pytest.raises(ValueError, match="forbidden link"):
            finalize_package(package)
    finally:
        if os.name == "nt":
            reports.rmdir()
        else:
            reports.unlink()

    assert external_report.read_text(encoding="utf-8") == '{"external":true}\n'


def test_finalizer_fails_palette_tampering_after_manifest_refresh(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(
        tmp_path,
        complete_artwork=True,
        palette_uv=True,
    )
    artwork = package / "artwork/uv-artwork-srgb.png"
    with Image.open(artwork) as image:
        tampered = image.copy()
        palette = tampered.getpalette()
    assert palette is not None
    palette[0] ^= 255
    tampered.putpalette(palette)
    tampered.save(artwork)
    _refresh_manifest_artifact(package, artwork)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert (
        "provenance:uv_artwork_derived_artwork_mismatch"
        in result["manifest"]["digital_failures"]
    )


def test_finalizer_fails_coherent_geometry_swap_with_spoofed_source_hash(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(
        tmp_path / "original",
        complete_artwork=True,
        relief_value=32768,
    )
    donor = _build_simple_package(
        tmp_path / "donor",
        complete_artwork=True,
        relief_value=16384,
    )
    geometry_names = (
        "model.stl",
        "model.glb",
        "model.3mf",
        "relief-map-normalized-16.png",
        "silhouette-mask-normalized.png",
        "manufacturing-report.json",
    )
    for name in geometry_names:
        shutil.copyfile(donor / "geometry" / name, package / "geometry" / name)

    report_path = package / "geometry/manufacturing-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["source_sha256"] = _sha256(package / "source/relief-map-16.png")
    report["mask_sha256"] = _sha256(package / "source/silhouette-mask.png")
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    for name in geometry_names:
        _refresh_manifest_artifact(package, package / "geometry" / name)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    failures = set(result["manifest"]["digital_failures"])
    assert (
        "provenance:geometry_derivation_mismatch:relief-map-normalized-16.png"
        in failures
    )
    assert "provenance:geometry_derivation_mismatch:model.stl" in failures
    assert result["receipt"]["digital_artifact_consistency"] == "pass"
    assert result["receipt"]["digital_contour_registration"] == "pass"


@pytest.mark.parametrize(
    ("relative", "expected_failure"),
    [
        (
            "artwork/uv-artwork-srgb.png",
            "provenance:uv_artwork_derived_artwork_mismatch",
        ),
        (
            "artwork/white-mask.png",
            "provenance:white_mask_derived_artwork_mismatch",
        ),
        (
            "artwork/varnish-mask.png",
            "provenance:varnish_mask_derived_artwork_mismatch",
        ),
    ],
)
def test_finalizer_fails_tampered_derived_artwork_after_manifest_refresh(
    tmp_path: Path,
    relative: str,
    expected_failure: str,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    artwork = package / relative
    with Image.open(artwork) as image:
        mode = image.mode
        pixels = np.asarray(image).copy()
    pixels.reshape(-1)[0] ^= 1
    Image.fromarray(pixels, mode=mode).save(artwork)
    _refresh_manifest_artifact(package, artwork)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert expected_failure in result["manifest"]["digital_failures"]


def test_finalizer_fails_spoofed_registration_contract(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    registration_path = package / "artwork/registration.json"
    registration = json.loads(registration_path.read_text(encoding="utf-8"))
    registration["physical_canvas_mm"] = [999.0, 999.0]
    registration["mirror_for_print"] = True
    registration_path.write_text(
        json.dumps(registration, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["registration"] = registration
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    _refresh_manifest_artifact(package, registration_path)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert "provenance:artwork_registration_mismatch" in result["manifest"]["digital_failures"]
    assert "provenance:manifest_registration_mismatch" in result["manifest"]["digital_failures"]


def test_finalizer_fails_tampered_cut_contour(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    contour = package / "artwork/cut-contour.svg"
    contour.write_text(
        contour.read_text(encoding="utf-8") + "<!-- shifted -->\n",
        encoding="utf-8",
    )
    _refresh_manifest_artifact(package, contour)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert "provenance:cut_contour_mismatch" in result["manifest"]["digital_failures"]


def test_finalizer_fails_tampered_original_uv_after_manifest_refresh(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    original = package / "source/uv-artwork-original.bin"
    original.write_bytes(original.read_bytes() + b"tampered")
    _refresh_manifest_artifact(package, original)

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert "provenance:uv_artwork_sha256_mismatch" in result["manifest"]["digital_failures"]


def test_finalizer_fails_incomplete_artwork_chain_even_if_manifest_is_rewritten(
    tmp_path: Path,
) -> None:
    package = _build_simple_package(tmp_path, complete_artwork=True)
    missing = package / "artwork/varnish-mask.png"
    missing.unlink()
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["artifacts"].pop("artwork/varnish-mask.png")
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    result = finalize_package(package)

    assert result["receipt"]["digital_package_status"] == "failed"
    assert (
        "provenance:varnish_mask_artifact_chain_incomplete"
        in result["manifest"]["digital_failures"]
    )
    assert "provenance:uv_artwork_status_mismatch" in result["manifest"]["digital_failures"]


def test_finalizer_preserves_declared_nested_control_filename(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    nested = package / "notes/manifest.json"
    nested.parent.mkdir()
    nested.write_text('{"note":"declared"}\n', encoding="utf-8")
    _refresh_manifest_artifact(package, nested)

    result = finalize_package(package)

    assert "notes/manifest.json" in result["manifest"]["artifacts"]


def test_finalizer_requires_legacy_v1_package_rebuild(tmp_path: Path) -> None:
    package = _build_simple_package(tmp_path)
    manifest_path = package / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["schema_version"] = 1
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="legacy_package_requires_rebuild"):
        finalize_package(package)
