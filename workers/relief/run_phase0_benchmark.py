#!/usr/bin/env python3
"""Build a deterministic multi-depth Relief Pro Phase 0 test package.

The package is digitally validated only.  It deliberately keeps the physical
P1S/A1 mini and UV measurements blank so benchmark decisions cannot be made
without real samples.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

from physical_evidence_templates import (
    write_bound_fdm_template,
    write_bound_uv_template,
)
from PIL import Image
from relief_builder import (
    ENGINE_NAME,
    ENGINE_VERSION,
    FIXED_ZIP_TIME,
    BuildRecipe,
    build,
    canonical_json_bytes,
    sha256_file,
)

DEFAULT_DEPTHS = (0.6, 1.0, 1.4, 1.8)


def ensure_empty_output_dir(output_dir: Path) -> None:
    """Refuse to mix a new benchmark with stale artifacts."""
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError(
            f"Output directory is not empty: {output_dir}. "
            "Use a new directory or remove the previous benchmark explicitly."
        )
    output_dir.mkdir(parents=True, exist_ok=True)


def depth_slug(depth: float) -> str:
    return f"{depth:.1f}mm"


def parse_depths(value: str) -> tuple[float, ...]:
    depths = tuple(float(item.strip()) for item in value.split(",") if item.strip())
    if not depths:
        raise argparse.ArgumentTypeError("At least one relief depth is required")
    if len(set(depths)) != len(depths):
        raise argparse.ArgumentTypeError("Relief depths must be unique")
    if any(depth <= 0 or depth > 100 for depth in depths):
        raise argparse.ArgumentTypeError("Relief depths must be > 0 and <= 100")
    return tuple(sorted(depths))


def copy_input(source: Path | None, destination_dir: Path, name: str) -> Path | None:
    if source is None:
        return None
    source = source.resolve()
    if not source.is_file():
        raise ValueError(f"Input file does not exist: {source}")
    destination = destination_dir / name
    shutil.copyfile(source, destination)
    return destination


def validate_shared_canvas(paths: dict[str, Path | None]) -> list[int]:
    sizes: dict[str, tuple[int, int]] = {}
    for name, path in paths.items():
        if path is None:
            continue
        with Image.open(path) as image:
            sizes[name] = image.size
    if not sizes:
        raise ValueError("At least one benchmark image is required")
    expected = next(iter(sizes.values()))
    mismatched = {name: size for name, size in sizes.items() if size != expected}
    if mismatched:
        raise ValueError(f"Benchmark input canvases do not match: {sizes}")
    return [expected[0], expected[1]]


def write_digital_status(
    destination: Path,
    summary: dict[str, object],
    source_note: str | None,
) -> None:
    source_info = summary.get("source_image_info", {})
    builds = summary.get("builds", [])
    advisory_set = sorted(
        {
            advisory
            for entry in builds
            for advisory in entry.get("validation", {}).get("advisories", [])
        }
    )
    advisory_lines = "\n".join(f"- `{item}`" for item in advisory_set) or "- Yok"
    destination.write_text(
        f"""# Relief Pro Phase 0 — Dijital Durum

- Dijital benchmark: **{summary['digital_benchmark_status']}**
- Fiziksel P1S/A1 mini doğrulaması: **pending**
- UV doğrulaması: **pending**
- Varsayılan rölyef derinliği: **seçilmedi**
- Kaynak notu: {source_note or 'belirtilmedi'}

## Kaynak relief haritası

- PIL modu: `{source_info.get('pil_mode', 'unknown')}`
- Saklama bit derinliği: `{source_info.get('storage_bits_per_sample', 'unknown')}`
- Benzersiz değer sayısı: `{source_info.get('unique_value_count', 'unknown')}`
- Tahmini etkin hassasiyet: `{source_info.get('effective_precision_bits_estimate', 'unknown')} bit`

## Advisories

{advisory_lines}

Bu paket dijital geometri ve dosya tutarlılığı için hazırlanmıştır. Fiziksel baskı, UV kafa açıklığı, renk tutunması ve hizalama ölçülmeden **üretime hazır** kabul edilmez.
""",
        encoding="utf-8",
    )


def write_summary_csv(rows: list[dict[str, object]], destination: Path) -> None:
    fields = [
        "relief_depth_mm",
        "digital_status",
        "production_status",
        "width_mm",
        "height_mm",
        "total_depth_mm",
        "vertex_count",
        "face_count",
        "watertight",
        "open_edge_count",
        "degenerate_face_count",
        "boundary_quantization_mm",
        "package_sha256",
    ]
    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_physical_measurement_forms(
    *,
    output_dir: Path,
    builds: list[dict[str, object]],
    input_hashes: dict[str, str],
    width_mm: float,
    height_mm: float,
    base_thickness_mm: float,
) -> None:
    """Emit evaluator-compatible v2 forms plus the legacy FDM filename alias."""

    source_key = hashlib.sha256(canonical_json_bytes(input_hashes)).hexdigest()[:12]
    design_id = f"phase0-{source_key}"
    built_revisions = {
        float(entry["relief_depth_mm"]): str(entry["package_sha256"])
        for entry in builds
    }
    revisions = {
        depth: built_revisions.get(depth, "") for depth in DEFAULT_DEPTHS
    }
    engines = {
        depth: ENGINE_VERSION if depth in built_revisions else ""
        for depth in DEFAULT_DEPTHS
    }
    canonical_fdm = write_bound_fdm_template(
        output_dir / "fdm-physical-measurements-v2.csv",
        design_id=design_id,
        revisions_by_depth=revisions,
        engines_by_depth=engines,
        target_width_mm=width_mm,
        target_height_mm=height_mm,
        target_base_mm=base_thickness_mm,
    )
    shutil.copyfile(canonical_fdm, output_dir / "physical-measurements.csv")
    write_bound_uv_template(
        output_dir / "uv-physical-measurements-v2.csv",
        coupon_id=f"UV-{design_id}",
        target_width_mm=width_mm,
        target_height_mm=height_mm,
    )


def write_physical_instructions(destination: Path, width_mm: float, height_mm: float | None) -> None:
    resolved_height = "master aspect ratio" if height_mm is None else f"{height_mm:g} mm"
    destination.write_text(
        f"""# Relief Pro Phase 0 — Fiziksel Test Talimatı

Bu paket dijital olarak doğrulanmıştır; fiziksel üretim sonucu henüz doğrulanmamıştır.

## Sabit hedef

- genişlik: {width_mm:g} mm
- yükseklik: {resolved_height}
- taban: tüm varyantlarda aynı reçete
- test derinlikleri: paket içindeki build klasörleri
- arka yüz: tabla üzerinde düz
- destek: kapalı

## P1S ve A1 mini testi

1. Önce `model.3mf` dosyasını açın; slicer uyumsuzluk gösterirse `model.stl` kullanın.
2. Slicer içinde ölçek uygulamayın. Dosyada görülen X/Y/Z ölçülerini rapordaki değerlerle karşılaştırın.
3. Tüm derinlikleri aynı filament, nozzle, layer height ve yüzey ayarıyla basın.
4. Baskı sonrası en az 30 dakika soğutun; genişlik, yükseklik ve toplam kalınlığı kumpasla ölçün.
5. Yazı, ince çizgi, balon kenarı, peri bacası tepesi, düz arka yüz ve warping'i aynı ışıkta fotoğraflayın.
6. Sonuçları `fdm-physical-measurements-v2.csv` dosyasına işleyin. `physical-measurements.csv` aynı formun geriye uyumluluk kopyasıdır. Başarısız numuneyi veri setinden çıkarmayın.

## UV testi

1. Fason baskıcıya önce maksimum kabartı yüksekliğini ve kafa açıklığını sorun; onay olmadan parçayı makineye koymayın.
2. İlgili build klasöründeki `uv-print-aligned.png`, `white-mask-aligned.png`, `varnish-mask-aligned.png` ve `registration-overlay.svg` birlikte verilmelidir.
3. RIP'te yeniden kırpma, otomatik sığdırma veya bağımsız padding uygulanmamalıdır.
4. Artwork fiziksel ölçüsü rapordaki `model_size_mm` olmalıdır.
5. Merkez ve dört köşe registration işaretlerinde X/Y kaçıklığını milimetre olarak kaydedin.
6. 0.5 mm üzerindeki kalibre edilmiş hizalama hatası kabul edilmez; fiziksel test yapılmadan bu eşik geçmiş sayılmaz.
7. RIP, ICC profili, malzeme ve ölçümleri `uv-physical-measurements-v2.csv` dosyasına kaydedin.

## Karar

Varsayılan rölyef derinliği yalnızca P1S, A1 mini ve UV sonuçları birlikte görüldükten sonra seçilecektir.
""",
        encoding="utf-8",
    )


def write_tree_zip(destination: Path, root: Path, excluded_names: set[str] | None = None) -> None:
    excluded_names = excluded_names or set()
    files = [
        path
        for path in root.rglob("*")
        if path.is_file() and path.name not in excluded_names and path != destination
    ]
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
            relative = path.relative_to(root).as_posix()
            info = zipfile.ZipInfo(relative, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(
                info,
                path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def run_benchmark(
    relief_map: Path,
    mask: Path,
    output_dir: Path,
    depths: tuple[float, ...] = DEFAULT_DEPTHS,
    width_mm: float = 70.0,
    height_mm: float | None = None,
    base_thickness_mm: float = 3.0,
    grid_long_edge: int = 256,
    artwork_long_edge_px: int = 2048,
    uv_artwork: Path | None = None,
    white_mask: Path | None = None,
    varnish_mask: Path | None = None,
    front_master: Path | None = None,
    source_note: str | None = None,
) -> dict[str, object]:
    ensure_empty_output_dir(output_dir)
    inputs_dir = output_dir / "inputs"
    builds_dir = output_dir / "builds"
    inputs_dir.mkdir(exist_ok=True)
    builds_dir.mkdir(exist_ok=True)

    copied_relief = copy_input(relief_map, inputs_dir, "relief-map-16.png")
    copied_mask = copy_input(mask, inputs_dir, "alpha-mask.png")
    copied_front = copy_input(front_master, inputs_dir, "front-master.png")
    copied_uv = copy_input(uv_artwork, inputs_dir, "uv-print.png")
    copied_white = copy_input(white_mask, inputs_dir, "white-mask.png")
    copied_varnish = copy_input(varnish_mask, inputs_dir, "varnish-mask.png")
    assert copied_relief and copied_mask
    shared_canvas_px = validate_shared_canvas(
        {
            "relief_map": copied_relief,
            "alpha_mask": copied_mask,
            "front_master": copied_front,
            "uv_artwork": copied_uv,
            "white_mask": copied_white,
            "varnish_mask": copied_varnish,
        }
    )

    aligned_layers = {
        key: value
        for key, value in {
            "uv_artwork": copied_uv,
            "white_mask": copied_white,
            "varnish_mask": copied_varnish,
        }.items()
        if value is not None
    }

    build_entries: list[dict[str, object]] = []
    csv_rows: list[dict[str, object]] = []
    all_digitally_validated = True
    for depth in depths:
        build_dir = builds_dir / depth_slug(depth)
        report = build(
            copied_relief,
            build_dir,
            BuildRecipe(
                width_mm=width_mm,
                height_mm=height_mm,
                base_thickness_mm=base_thickness_mm,
                relief_depth_mm=depth,
                percentile_low=2.0,
                percentile_high=98.0,
                gamma=1.0,
                smoothing_sigma_px=1.0,
                grid_long_edge=grid_long_edge,
                shape_mode="silhouette",
                artwork_long_edge_px=artwork_long_edge_px,
                normalization_mode="absolute",
            ),
            copied_mask,
            aligned_layers,
        )
        validation = report.validation
        package_path = build_dir / report.package_file
        all_digitally_validated &= validation["digital_status"] == "validated"
        entry = {
            "relief_depth_mm": depth,
            "report": f"builds/{depth_slug(depth)}/manufacturing-report.json",
            "package": f"builds/{depth_slug(depth)}/{report.package_file}",
            "package_sha256": sha256_file(package_path),
            "validation": validation,
            "coordinate_system": report.coordinate_system,
            "source_image_info": report.source_image_info,
        }
        build_entries.append(entry)
        csv_rows.append(
            {
                "relief_depth_mm": f"{depth:.1f}",
                "digital_status": validation["digital_status"],
                "production_status": validation["production_status"],
                "width_mm": validation["extents_mm"][0],
                "height_mm": validation["extents_mm"][1],
                "total_depth_mm": validation["extents_mm"][2],
                "vertex_count": validation["vertex_count"],
                "face_count": validation["face_count"],
                "watertight": validation["watertight"],
                "open_edge_count": validation["open_edge_count"],
                "degenerate_face_count": validation["degenerate_face_count"],
                "boundary_quantization_mm": report.coordinate_system[
                    "digital_boundary_quantization_mm"
                ],
                "package_sha256": entry["package_sha256"],
            }
        )

    summary: dict[str, object] = {
        "schema_version": 1,
        "benchmark": "renderhane-relief-pro-phase0",
        "engine": ENGINE_NAME,
        "engine_version": ENGINE_VERSION,
        "digital_benchmark_status": "validated" if all_digitally_validated else "needs_review",
        "physical_benchmark_status": "pending",
        "uv_benchmark_status": "pending",
        "default_relief_depth_mm": None,
        "decision_rule": "No default is selected until P1S, A1 mini and UV measurements are recorded.",
        "source_note": source_note,
        "shared_canvas_px": shared_canvas_px,
        "source_image_info": build_entries[0]["source_image_info"] if build_entries else {},
        "input_hashes": {
            path.name: sha256_file(path)
            for path in sorted(inputs_dir.iterdir())
            if path.is_file()
        },
        "builds": build_entries,
    }
    summary_path = output_dir / "benchmark-summary.json"
    summary_path.write_bytes(canonical_json_bytes(summary) + b"\n")
    write_summary_csv(csv_rows, output_dir / "benchmark-summary.csv")
    resolved_height_mm = float(build_entries[0]["validation"]["extents_mm"][1])
    write_physical_measurement_forms(
        output_dir=output_dir,
        builds=build_entries,
        input_hashes=summary["input_hashes"],
        width_mm=width_mm,
        height_mm=resolved_height_mm,
        base_thickness_mm=base_thickness_mm,
    )
    write_physical_instructions(output_dir / "PHYSICAL-TEST.md", width_mm, height_mm)
    write_digital_status(output_dir / "DIGITAL-STATUS.md", summary, source_note)

    package_path = output_dir / "renderhane-relief-pro-phase0.zip"
    write_tree_zip(
        package_path,
        output_dir,
        excluded_names={"manufacturing-package.zip", package_path.name},
    )
    package_manifest = {
        "file": package_path.name,
        "sha256": sha256_file(package_path),
        "bytes": package_path.stat().st_size,
        "physical_validation_required": True,
    }
    (output_dir / "package-manifest.json").write_bytes(
        canonical_json_bytes(package_manifest) + b"\n"
    )
    return summary


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relief-map", required=True, type=Path)
    parser.add_argument("--mask", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--front-master", type=Path)
    parser.add_argument("--uv-artwork", type=Path)
    parser.add_argument("--white-mask", type=Path)
    parser.add_argument("--varnish-mask", type=Path)
    parser.add_argument("--depths", type=parse_depths, default=DEFAULT_DEPTHS)
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float)
    parser.add_argument("--base-thickness-mm", type=float, default=3.0)
    parser.add_argument("--grid-long-edge", type=int, default=256)
    parser.add_argument("--artwork-long-edge-px", type=int, default=2048)
    parser.add_argument("--source-note")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = run_benchmark(
        relief_map=args.relief_map,
        mask=args.mask,
        output_dir=args.out_dir,
        depths=args.depths,
        width_mm=args.width_mm,
        height_mm=args.height_mm,
        base_thickness_mm=args.base_thickness_mm,
        grid_long_edge=args.grid_long_edge,
        artwork_long_edge_px=args.artwork_long_edge_px,
        uv_artwork=args.uv_artwork,
        white_mask=args.white_mask,
        varnish_mask=args.varnish_mask,
        front_master=args.front_master,
        source_note=args.source_note,
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if summary["digital_benchmark_status"] == "validated" else 2


if __name__ == "__main__":
    raise SystemExit(main())
