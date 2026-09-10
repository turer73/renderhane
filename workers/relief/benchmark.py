from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any

from relief_builder import BuildRecipe, build


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _depth_slug(depth_mm: float) -> str:
    return f"{depth_mm:.3f}".rstrip("0").rstrip(".").replace(".", "p")


def _jsonable_report(report: Any) -> dict[str, Any]:
    if is_dataclass(report):
        return asdict(report)
    if hasattr(report, "to_dict"):
        value = report.to_dict()
        if isinstance(value, dict):
            return value
    if hasattr(report, "__dict__"):
        return dict(report.__dict__)
    return {}


def run_benchmark(
    relief_map: Path,
    output_dir: Path,
    depths_mm: list[float],
    *,
    mask: Path | None = None,
    width_mm: float = 70.0,
    height_mm: float | None = None,
    base_thickness_mm: float = 3.0,
    grid_long_edge: int = 192,
) -> dict[str, Any]:
    if not relief_map.is_file():
        raise FileNotFoundError(f"Relief map not found: {relief_map}")
    if mask is not None and not mask.is_file():
        raise FileNotFoundError(f"Mask not found: {mask}")
    if not depths_mm:
        raise ValueError("At least one relief depth is required")
    if any(depth <= 0 for depth in depths_mm):
        raise ValueError("Relief depths must be positive")

    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []

    for depth_mm in depths_mm:
        variant_dir = output_dir / f"relief-{_depth_slug(depth_mm)}mm"
        recipe_kwargs: dict[str, Any] = {
            "width_mm": width_mm,
            "base_thickness_mm": base_thickness_mm,
            "relief_depth_mm": depth_mm,
            "grid_long_edge": grid_long_edge,
            # Deprecated facade preserves its historical percentile-normalized
            # behavior. New callers must use run_phase0_benchmark.py (absolute).
            "normalization_mode": "robust",
        }
        if height_mm is not None:
            recipe_kwargs["height_mm"] = height_mm

        recipe = BuildRecipe(**recipe_kwargs)
        report = build(relief_map, variant_dir, recipe, mask)

        report_path = variant_dir / "manufacturing-report.json"
        persisted: dict[str, Any] = {}
        if report_path.is_file():
            persisted = json.loads(report_path.read_text(encoding="utf-8"))
        if not persisted:
            persisted = _jsonable_report(report)

        validation = persisted.get("validation") or getattr(report, "validation", {}) or {}
        artifacts: dict[str, dict[str, Any]] = {}
        for name in (
            "model.stl",
            "model.glb",
            "relief-map-normalized-16.png",
            "manufacturing-report.json",
        ):
            path = variant_dir / name
            if path.is_file():
                artifacts[name] = {
                    "bytes": path.stat().st_size,
                    "sha256": _sha256(path),
                    "relative_path": str(path.relative_to(output_dir)),
                }

        records.append(
            {
                "depth_mm": depth_mm,
                "output_dir": str(variant_dir.relative_to(output_dir)),
                "digital_status": validation.get("digital_status", "unknown"),
                "production_status": validation.get("production_status", "unknown"),
                "watertight": validation.get("watertight"),
                "winding_consistent": validation.get("winding_consistent"),
                "is_volume": validation.get("is_volume"),
                "open_edge_count": validation.get("open_edge_count"),
                "extents_mm": validation.get("extents_mm"),
                "warnings": validation.get("warnings", []),
                "artifacts": artifacts,
            }
        )

    summary = {
        "schema_version": 1,
        "benchmark": "multi-depth-relief",
        "input": {
            "relief_map": str(relief_map),
            "relief_map_sha256": _sha256(relief_map),
            "mask": str(mask) if mask else None,
            "mask_sha256": _sha256(mask) if mask else None,
        },
        "recipe": {
            "width_mm": width_mm,
            "height_mm": height_mm,
            "base_thickness_mm": base_thickness_mm,
            "grid_long_edge": grid_long_edge,
            "depths_mm": depths_mm,
        },
        "variants": records,
    }

    json_path = output_dir / "benchmark-summary.json"
    json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    csv_path = output_dir / "benchmark-summary.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "depth_mm",
                "digital_status",
                "production_status",
                "watertight",
                "winding_consistent",
                "is_volume",
                "open_edge_count",
                "extents_mm",
                "warning_count",
                "output_dir",
            ],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "depth_mm": record["depth_mm"],
                    "digital_status": record["digital_status"],
                    "production_status": record["production_status"],
                    "watertight": record["watertight"],
                    "winding_consistent": record["winding_consistent"],
                    "is_volume": record["is_volume"],
                    "open_edge_count": record["open_edge_count"],
                    "extents_mm": json.dumps(record["extents_mm"], separators=(",", ":")),
                    "warning_count": len(record["warnings"]),
                    "output_dir": record["output_dir"],
                }
            )

    failures = [
        record
        for record in records
        if record["digital_status"] != "validated"
        or record["watertight"] is not True
        or record["is_volume"] is not True
        or record["open_edge_count"] not in (0, None)
    ]
    summary["digital_gate"] = "pass" if not failures else "fail"
    summary["failed_depths_mm"] = [record["depth_mm"] for record in failures]
    json_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def _parse_depths(raw: str) -> list[float]:
    values = [part.strip() for part in raw.split(",") if part.strip()]
    try:
        return [float(value) for value in values]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("depths must be comma-separated numbers") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build and validate several relief-depth variants")
    parser.add_argument("--input", type=Path, required=True, help="16-bit relief-map PNG")
    parser.add_argument("--mask", type=Path, default=None)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--depths", type=_parse_depths, default=[0.6, 1.0, 1.4, 1.8])
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float, default=None)
    parser.add_argument("--base-mm", type=float, default=3.0)
    parser.add_argument("--grid-long-edge", type=int, default=192)
    args = parser.parse_args(argv)

    try:
        summary = run_benchmark(
            args.input,
            args.output,
            args.depths,
            mask=args.mask,
            width_mm=args.width_mm,
            height_mm=args.height_mm,
            base_thickness_mm=args.base_mm,
            grid_long_edge=args.grid_long_edge,
        )
    except Exception as exc:
        print(f"benchmark failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps({
        "digital_gate": summary["digital_gate"],
        "failed_depths_mm": summary["failed_depths_mm"],
        "summary": str(args.output / "benchmark-summary.json"),
    }, ensure_ascii=False))
    return 0 if summary["digital_gate"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
