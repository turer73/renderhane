"""Build a rights-safe Relief Pro kit for real P1S/A1 mini and UV validation.

The kit is digitally validated but deliberately remains not approved until the
included physical evidence forms are completed from real prints and RIP output.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import shutil
import sys
import tempfile
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

from build_relief_pro_package import build_relief_pro_package
from derive_calibration_registration import derive_calibration_registration
from evaluate_physical_benchmark import evaluate_physical_benchmark
from finalize_relief_pro_package import finalize_package
from generate_uv_clearance_coupon import HEIGHT_MM as UV_HEIGHT_MM
from generate_uv_clearance_coupon import WIDTH_MM as UV_WIDTH_MM
from generate_uv_clearance_coupon import generate_coupon
from physical_evidence_templates import (
    write_bound_fdm_template,
    write_bound_uv_template,
)
from product_relief_builder import ProductRecipe
from workshop_contract import sample_layers

DEPTHS_MM = (0.6, 1.0, 1.4, 1.8)
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)
GRID_LONG_EDGE = 512
BUILD_ROLES = ("relief_map", "mask", "uv_artwork", "white_mask", "varnish_mask")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _ensure_empty_output(output_dir: Path) -> None:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError(
            f"Output directory is not empty: {output_dir}. Use a new directory."
        )
    output_dir.mkdir(parents=True, exist_ok=True)


def _write_rights_safe_sources(destination: Path) -> dict[str, Path]:
    destination.mkdir(parents=True, exist_ok=True)
    encoded_layers = sample_layers()
    paths: dict[str, Path] = {}
    for role in BUILD_ROLES:
        path = destination / f"{role.replace('_', '-')}.png"
        path.write_bytes(base64.b64decode(encoded_layers[role], validate=True))
        paths[role] = path
    _write_json(
        destination / "source-contract.json",
        {
            "schema_version": 1,
            "fixture": "rights-safe-calibration-v1",
            "purpose": "independent final-GLB semantic registration and physical calibration",
            "customer_or_brand_assets": False,
            "concept_render": False,
            "height_encoding": "unsigned_16_bit_absolute",
            "regions": [
                {"id": 1, "name": "base", "height_code_uint16": 8000, "srgb": [225, 224, 210]},
                {"id": 2, "name": "circle", "height_code_uint16": 50000, "srgb": [24, 140, 164]},
                {"id": 3, "name": "arrow", "height_code_uint16": 65535, "srgb": [224, 99, 44]},
            ],
            "notice": "Analytic geometry and artwork intent are known, but final semantic labels are re-derived independently from finalized artifacts.",
        },
    )
    return paths


def _copy(path: Path, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, destination)
    return destination


def _build_variant(
    output_dir_text: str,
    source_paths_text: dict[str, str],
    depth_mm: float,
) -> dict[str, Any]:
    output_dir = Path(output_dir_text)
    source_paths = {role: Path(path) for role, path in source_paths_text.items()}
    slug = f"{depth_mm:.1f}mm"
    with tempfile.TemporaryDirectory(
        prefix=f"renderhane-calibration-{slug}-", dir=output_dir.parent
    ) as temporary:
        package = Path(temporary) / "package"
        recipe = ProductRecipe(
            width_mm=70.0,
            base_thickness_mm=3.0,
            relief_depth_mm=depth_mm,
            grid_long_edge=GRID_LONG_EDGE,
            normalization_mode="absolute",
        )
        build_relief_pro_package(
            relief_map=source_paths["relief_map"],
            mask=source_paths["mask"],
            uv_artwork=source_paths["uv_artwork"],
            white_mask=source_paths["white_mask"],
            varnish_mask=source_paths["varnish_mask"],
            output_dir=package,
            recipe=recipe,
            title=f"Relief Pro rights-safe physical calibration {slug}",
        )
        finalized = finalize_package(package)
        manifest = finalized["manifest"]
        evidence_dir = output_dir / "digital-evidence" / slug
        semantic = derive_calibration_registration(
            final_depth_path=package / "geometry/final-glb-orthographic-depth-16.png",
            final_silhouette_path=package / "geometry/final-glb-orthographic-silhouette.png",
            aligned_artwork_path=package / "artwork/uv-artwork-srgb.png",
            registration_path=package / "artwork/registration.json",
            output_dir=evidence_dir / "independent-semantic",
        )
        candidate = _copy(
            package / "relief-pro-production-candidate.zip",
            output_dir / "candidate-packages" / f"relief-calibration-{slug}.zip",
        )
        model_3mf = _copy(
            package / "geometry/model.3mf",
            output_dir / "fdm-print-files" / f"relief-calibration-{slug}.3mf",
        )
        selected = {
            "package-manifest.json": package / "manifest.json",
            "package-receipt.json": package / "package-receipt.json",
            "registration.json": package / "artwork/registration.json",
            "cut-contour.svg": package / "artwork/cut-contour.svg",
            "uv-artwork-srgb.png": package / "artwork/uv-artwork-srgb.png",
            "white-mask.png": package / "artwork/white-mask.png",
            "varnish-mask.png": package / "artwork/varnish-mask.png",
            "final-glb-orthographic-depth-16.png": package / "geometry/final-glb-orthographic-depth-16.png",
            "final-glb-orthographic-silhouette.png": package / "geometry/final-glb-orthographic-silhouette.png",
            "final-glb-orthographic-projection.json": package / "geometry/final-glb-orthographic-projection.json",
            "final-glb-depth-registration-report.json": package / "reports/final-glb-depth-registration-report.json",
            "final-glb-silhouette-registration-report.json": package / "reports/final-glb-silhouette-registration-report.json",
            "artifact-consistency-report.json": package / "reports/artifact-consistency-report.json",
        }
        for name, path in selected.items():
            _copy(path, evidence_dir / name)
    return {
        "depth_mm": depth_mm,
        "revision_id": _sha256(candidate),
        "package": candidate.relative_to(output_dir).as_posix(),
        "package_sha256": _sha256(candidate),
        "model_3mf": model_3mf.relative_to(output_dir).as_posix(),
        "model_3mf_sha256": _sha256(model_3mf),
        "package_engine": manifest["engine_version"],
        "digital_geometry_status": manifest["digital_geometry_status"],
        "digital_artifact_consistency": manifest["digital_artifact_consistency"],
        "independent_semantic_status": semantic["artwork_semantic_registration_status"],
        "independent_semantic_failures": semantic["failures"],
        "physical_canvas_mm": manifest["registration"]["physical_canvas_mm"],
        "total_thickness_mm": manifest["registration"]["recipe_model_envelope_mm"][1][2],
        "production_status": "not_approved_pending_physical_validation",
    }


def _write_icc_rip_record(path: Path) -> None:
    _write_json(
        path,
        {
            "schema_version": 1,
            "status": "pending_real_uv_run",
            "uv_printer": None,
            "printer_serial_or_asset": None,
            "rip_name": None,
            "rip_version": None,
            "icc_profile_name": None,
            "icc_profile_sha256": None,
            "rendering_intent": None,
            "material": None,
            "primer": None,
            "colour_passes": None,
            "white_passes": None,
            "varnish_passes": None,
            "resolution_dpi": None,
            "lamp_or_cure_settings": None,
            "operator": None,
            "measured_at_utc": None,
            "notice": "Do not fill with assumed values; record the actual RIP job and exported ICC/profile evidence.",
        },
    )


def _write_instructions(path: Path) -> None:
    path.write_text(
        """# Relief Pro gerçek fiziksel doğrulama kiti

Bu kit **üretim onayı değildir**. Dijital geometri, dosya tutarlılığı ve final GLB'den bağımsız kalibrasyon semantiği doğrulanmıştır; gerçek baskı ölçümleri beklenmektedir.

## 1. P1S ve A1 mini — sekiz örnek

1. `fdm-print-files/` içindeki dört 3MF dosyasını hem P1S hem A1 mini'de açın.
2. Ölçeği değiştirmeyin. Beklenen XY ölçüsü her dosyada 70 x 60 mm, taban 3.0 mm'dir.
3. Aynı 0.4 mm nozzle, 0.12 mm layer, aynı PLA, aynı tabla ve aynı profil revizyonunu kullanın; destek kapalı, düz arka yüz tabla üzerinde olsun.
4. Parçaları en az 30 dakika soğuttuktan sonra genişlik, yükseklik, toplam kalınlık, düz arka yüz sapması ve warping'i kumpasla ölçün.
5. Her örnek için tam ön, eğik detay, yan kalınlık ve düz arka yüz fotoğrafı çekin. Başarısız örneği veri setinden çıkarmayın.
6. Gerçek değerleri `physical-evidence/fdm-physical-measurements-v2.csv` içine yazın.

## 2. UV/RIP/ICC — gerçek makine

1. Önce UV operatöründen 4.8 mm maksimum parça yüksekliği için güvenli kafa açıklığı onayı alın.
2. `uv-clearance-coupon/build/model.3mf` ile üretilen 120 x 35 mm kuponu sabit ve ölçülmüş bir jig üzerinde kullanın.
3. RIP'e `uv-print-aligned.png`, `white-mask-aligned.png` ve `varnish-mask-aligned.png` dosyalarını birlikte verin; auto-fit, bağımsız crop/padding ve eksen bazlı ölçek kapalı olsun.
4. RIP job bilgisi ile gerçek ICC profil adını/hash'ini `physical-evidence/icc-rip-record.json` içine kaydedin.
5. Renk, white ve varnish için merkez/dört köşe X/Y kaçıklığını, canvas ölçüsünü, edge bleed'i, keskinliği ve maksimum test edilen yüzey farkını ölçün.
6. Sonuçları `physical-evidence/uv-physical-measurements-v2.csv` içine yazın ve fotoğraf referanslarını ekleyin.

## 3. Sabit kabul eşikleri

- XY ölçü hatası: <= 0.50 mm
- toplam kalınlık hatası: <= 0.30 mm
- düz arka yüz sapması: <= 0.30 mm
- warping: <= 0.40 mm
- görsel puanlar: >= 3/5
- UV renk/white/varnish registration: <= 0.50 mm
- UV canvas ve edge bleed hatası: <= 0.50 mm

## 4. Değerlendirme

Repo kökünden çalıştırın:

```powershell
python workers/relief/evaluate_physical_benchmark.py --fdm-csv <kit>/physical-evidence/fdm-physical-measurements-v2.csv --uv-csv <kit>/physical-evidence/uv-physical-measurements-v2.csv --output-json <kit>/physical-evidence/physical-evaluation.json --output-md <kit>/physical-evidence/physical-evaluation.md
```

`physical_gate=pass` yalnızca kanıt setinin eşikleri geçtiğini söyler. Nihai reçete ve üretim onayı yine sorumlu insan tarafından verilmelidir.
""",
        encoding="utf-8",
        newline="\n",
    )


def _write_zip(destination: Path, root: Path) -> None:
    files = [
        path
        for path in root.rglob("*")
        if path.is_file() and path != destination and path.name != "kit-receipt.json"
    ]
    with zipfile.ZipFile(
        destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as archive:
        for path in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
            info = zipfile.ZipInfo(path.relative_to(root).as_posix(), FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)


def prepare_kit(output_dir: Path, *, jobs: int = 1) -> dict[str, Any]:
    if jobs not in {1, 2}:
        raise ValueError("jobs must be 1 or 2 to bound calibration memory use")
    _ensure_empty_output(output_dir)
    source_paths = _write_rights_safe_sources(output_dir / "source")
    for name in ("candidate-packages", "fdm-print-files", "digital-evidence", "physical-evidence"):
        (output_dir / name).mkdir()
    arguments = [
        (str(output_dir), {role: str(path) for role, path in source_paths.items()}, depth)
        for depth in DEPTHS_MM
    ]
    if jobs == 1:
        variants = [_build_variant(*args) for args in arguments]
    else:
        with ProcessPoolExecutor(max_workers=jobs) as executor:
            variants = list(executor.map(_build_variant_star, arguments))
    variants.sort(key=lambda item: item["depth_mm"])
    if any(
        item["digital_geometry_status"] != "ready"
        or item["digital_artifact_consistency"] != "pass"
        or item["independent_semantic_status"] != "validated"
        for item in variants
    ):
        raise ValueError("one or more calibration variants failed the digital gate")

    design_hash = hashlib.sha256(
        _canonical_json({role: _sha256(path) for role, path in source_paths.items()}).encode()
    ).hexdigest()[:12]
    fdm_path = write_bound_fdm_template(
        output_dir / "physical-evidence/fdm-physical-measurements-v2.csv",
        design_id=f"calibration-{design_hash}",
        revisions_by_depth={item["depth_mm"]: item["revision_id"] for item in variants},
        engines_by_depth={item["depth_mm"]: item["package_engine"] for item in variants},
        target_width_mm=70.0,
        target_height_mm=60.0,
        target_base_mm=3.0,
    )

    uv_result = generate_coupon(output_dir / "uv-clearance-coupon", grid_long_edge=320)
    uv_model = output_dir / "uv-clearance-coupon/build/model.3mf"
    uv_path = write_bound_uv_template(
        output_dir / "physical-evidence/uv-physical-measurements-v2.csv",
        coupon_id=f"UV-CLEARANCE-{_sha256(uv_model)[:12]}",
        target_width_mm=UV_WIDTH_MM,
        target_height_mm=UV_HEIGHT_MM,
    )
    _write_icc_rip_record(output_dir / "physical-evidence/icc-rip-record.json")
    pending = evaluate_physical_benchmark(fdm_csv=fdm_path, uv_csv=uv_path)
    _write_json(output_dir / "physical-evidence/physical-evaluation-pending.json", pending)
    _write_instructions(output_dir / "PRINT-AND-MEASURE.md")

    files_before_manifest = {
        path.relative_to(output_dir).as_posix(): {
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted(output_dir.rglob("*"))
        if path.is_file()
    }
    manifest = {
        "schema_version": 1,
        "kit": "relief-pro-rights-safe-physical-calibration-v1",
        "geometry_quality_profile": {
            "grid_long_edge": GRID_LONG_EDGE,
            "selection_evidence": {
                "grid_256": "failed independent arrow semantic registration",
                "grid_384": "failed independent arrow semantic registration",
                "grid_512": "passed unchanged semantic thresholds",
            },
        },
        "digital_geometry_status": "ready",
        "independent_semantic_registration_status": "validated",
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
        "variants": variants,
        "uv_clearance_coupon": uv_result,
        "pending_physical_gate": pending["physical_gate"],
        "human_approval_required": True,
        "files": files_before_manifest,
    }
    _write_json(output_dir / "kit-manifest.json", manifest)
    zip_path = output_dir / "renderhane-relief-pro-physical-validation-kit.zip"
    _write_zip(zip_path, output_dir)
    receipt = {
        "file": zip_path.name,
        "bytes": zip_path.stat().st_size,
        "sha256": _sha256(zip_path),
        "physical_validation_required": True,
        "production_approved": False,
    }
    _write_json(output_dir / "kit-receipt.json", receipt)
    return {**manifest, "kit_receipt": receipt}


def _build_variant_star(arguments: tuple[str, dict[str, str], float]) -> dict[str, Any]:
    return _build_variant(*arguments)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--jobs", type=int, choices=(1, 2), default=1)
    args = parser.parse_args(argv)
    try:
        result = prepare_kit(args.out_dir, jobs=args.jobs)
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        print(f"physical validation kit failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
