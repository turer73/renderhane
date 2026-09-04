from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

from build_relief_pro_package import MARKER_NAME, build_relief_pro_package
from product_relief_builder import ProductRecipe
from validate_front_master import validate_front_master

ENGINE_VERSION = "phase0-runner-v0.1.0"
DEFAULT_DEPTHS_MM = [0.6, 1.0, 1.4, 1.8]
PHASE0_MARKER = ".renderhane-phase0-root"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _prepare_root(path: Path) -> Path:
    resolved = path.expanduser().resolve()
    protected = {Path("/").resolve(), Path.home().resolve(), Path.cwd().resolve()}
    if resolved in protected or len(resolved.parts) < 3:
        raise ValueError(f"unsafe Phase 0 output path: {resolved}")
    if resolved.exists():
        marker = resolved / PHASE0_MARKER
        children = list(resolved.iterdir())
        if children and not marker.is_file():
            raise FileExistsError(f"refusing to replace unowned directory: {resolved}")
        shutil.rmtree(resolved)
    resolved.mkdir(parents=True, exist_ok=False)
    (resolved / PHASE0_MARKER).write_text(
        "Renderhane Manufacturing Relief Phase 0 workspace.\n",
        encoding="utf-8",
    )
    return resolved


def _parse_depths(raw: str) -> list[float]:
    try:
        values = [float(part.strip()) for part in raw.split(",") if part.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("depths must be comma-separated numbers") from exc
    if not values or any(value <= 0 for value in values):
        raise argparse.ArgumentTypeError("depths must contain positive values")
    if len(set(values)) != len(values):
        raise argparse.ArgumentTypeError("depth values must be unique")
    return values


def run_phase0(
    *,
    front_master: Path,
    relief_map: Path,
    mask: Path,
    output_dir: Path,
    text_vector: Path | None = None,
    uv_artwork: Path | None = None,
    white_mask: Path | None = None,
    varnish_mask: Path | None = None,
    width_mm: float = 70.0,
    height_mm: float | None = None,
    base_mm: float = 3.0,
    depths_mm: list[float] | None = None,
    grid_long_edge: int = 192,
    pocket_diameter_mm: float | None = None,
    pocket_depth_mm: float | None = None,
    declared_orthographic: bool = False,
    declared_no_cast_shadow: bool = False,
    minimum_long_edge_px: int = 2048,
    allow_review_input: bool = False,
) -> dict[str, Any]:
    depths = depths_mm or list(DEFAULT_DEPTHS_MM)
    root = _prepare_root(output_dir)

    front_report = validate_front_master(
        front_master,
        mask_path=mask,
        text_vector_path=text_vector,
        minimum_long_edge_px=minimum_long_edge_px,
        declared_orthographic=declared_orthographic,
        declared_no_cast_shadow=declared_no_cast_shadow,
    )
    (root / "front-master-validation.json").write_text(
        json.dumps(front_report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    decision = front_report["decision"]
    if decision == "reject_input":
        raise ValueError("front manufacturing master was rejected; see validation report")
    if decision == "needs_review" and not allow_review_input:
        raise ValueError(
            "front manufacturing master requires human review; rerun only after approval "
            "or use --allow-review-input for a non-approved candidate build"
        )

    variants: list[dict[str, Any]] = []
    all_digital_ready = True
    for depth_mm in depths:
        slug = f"{depth_mm:.3f}".rstrip("0").rstrip(".").replace(".", "p")
        variant_dir = root / "variants" / f"relief-{slug}mm"
        recipe = ProductRecipe(
            width_mm=width_mm,
            height_mm=height_mm,
            base_thickness_mm=base_mm,
            relief_depth_mm=depth_mm,
            grid_long_edge=grid_long_edge,
            pocket_diameter_mm=pocket_diameter_mm,
            pocket_depth_mm=pocket_depth_mm,
        )
        manifest = build_relief_pro_package(
            relief_map=relief_map,
            mask=mask,
            uv_artwork=uv_artwork,
            white_mask=white_mask,
            varnish_mask=varnish_mask,
            output_dir=variant_dir,
            recipe=recipe,
            title=f"Renderhane Relief Pro {depth_mm:g} mm",
        )
        digital_ready = manifest["digital_geometry_status"] == "ready"
        all_digital_ready = all_digital_ready and digital_ready
        variants.append(
            {
                "depth_mm": depth_mm,
                "directory": variant_dir.relative_to(root).as_posix(),
                "digital_geometry_status": manifest["digital_geometry_status"],
                "uv_artwork_status": manifest["uv_artwork_status"],
                "physical_validation_status": manifest["physical_validation_status"],
                "package": manifest["package_receipt"],
            }
        )

    candidate_only = decision == "needs_review" or allow_review_input
    summary = {
        "schema_version": 1,
        "engine_version": ENGINE_VERSION,
        "product_line": "relief-pro",
        "input": {
            "front_master_sha256": _sha256(front_master),
            "relief_map_sha256": _sha256(relief_map),
            "mask_sha256": _sha256(mask),
            "text_vector_sha256": _sha256(text_vector) if text_vector else None,
            "uv_artwork_sha256": _sha256(uv_artwork) if uv_artwork else None,
            "white_mask_sha256": _sha256(white_mask) if white_mask else None,
            "varnish_mask_sha256": _sha256(varnish_mask) if varnish_mask else None,
        },
        "front_master_decision": decision,
        "candidate_only": candidate_only,
        "digital_geometry_gate": "pass" if all_digital_ready else "fail",
        "physical_validation_status": "pending",
        "production_status": "not_approved_pending_physical_validation",
        "variants": variants,
        "next_required_evidence": [
            "Bambu Studio import for every generic 3MF",
            "P1S measurements for every depth",
            "A1 mini measurements for every depth",
            "70 mm UV registration coupon measurements",
            "operator acceptance or rejection including failed samples",
        ],
    }
    (root / "phase0-summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the evidence-gated Relief Pro Phase 0 build")
    parser.add_argument("--front-master", type=Path, required=True)
    parser.add_argument("--relief-map", type=Path, required=True)
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--text-vector", type=Path)
    parser.add_argument("--uv-artwork", type=Path)
    parser.add_argument("--white-mask", type=Path)
    parser.add_argument("--varnish-mask", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width-mm", type=float, default=70.0)
    parser.add_argument("--height-mm", type=float)
    parser.add_argument("--base-mm", type=float, default=3.0)
    parser.add_argument("--depths", type=_parse_depths, default=list(DEFAULT_DEPTHS_MM))
    parser.add_argument("--grid-long-edge", type=int, default=192)
    parser.add_argument("--pocket-diameter-mm", type=float)
    parser.add_argument("--pocket-depth-mm", type=float)
    parser.add_argument("--minimum-long-edge-px", type=int, default=2048)
    parser.add_argument("--declared-orthographic", action="store_true")
    parser.add_argument("--declared-no-cast-shadow", action="store_true")
    parser.add_argument(
        "--allow-review-input",
        action="store_true",
        help="Build candidate artifacts even when the front master still requires human review",
    )
    args = parser.parse_args(argv)

    try:
        summary = run_phase0(
            front_master=args.front_master,
            relief_map=args.relief_map,
            mask=args.mask,
            text_vector=args.text_vector,
            uv_artwork=args.uv_artwork,
            white_mask=args.white_mask,
            varnish_mask=args.varnish_mask,
            output_dir=args.output,
            width_mm=args.width_mm,
            height_mm=args.height_mm,
            base_mm=args.base_mm,
            depths_mm=args.depths,
            grid_long_edge=args.grid_long_edge,
            pocket_diameter_mm=args.pocket_diameter_mm,
            pocket_depth_mm=args.pocket_depth_mm,
            declared_orthographic=args.declared_orthographic,
            declared_no_cast_shadow=args.declared_no_cast_shadow,
            minimum_long_edge_px=args.minimum_long_edge_px,
            allow_review_input=args.allow_review_input,
        )
    except Exception as exc:
        print(f"Phase 0 failed: {exc}", file=sys.stderr)
        return 2

    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return 0 if summary["digital_geometry_gate"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
