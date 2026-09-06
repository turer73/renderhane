"""Bind physical evidence templates to immutable digital calibration artifacts."""

from __future__ import annotations

import csv
from collections.abc import Mapping
from pathlib import Path

TEMPLATE_ROOT = Path(__file__).resolve().parents[2] / "benchmarks/relief"


def _read_template(kind: str) -> tuple[list[str], list[dict[str, str]]]:
    if kind not in {"fdm", "uv"}:
        raise ValueError("physical template kind must be fdm or uv")
    path = TEMPLATE_ROOT / f"{kind}-physical-measurement-template-v2.csv"
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError(f"physical template has no header: {path}")
        fields = list(reader.fieldnames)
        rows = [dict(row) for row in reader]
    if not rows or any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"physical template column mismatch: {path}")
    return fields, rows


def _write_rows(destination: Path, fields: list[str], rows: list[dict[str, str]]) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return destination


def write_bound_fdm_template(
    destination: Path,
    *,
    design_id: str,
    revisions_by_depth: Mapping[float, str],
    engines_by_depth: Mapping[float, str],
    target_width_mm: float,
    target_height_mm: float,
    target_base_mm: float,
) -> Path:
    """Write all P1S/A1 mini rows with digital targets, leaving observations blank."""

    fields, rows = _read_template("fdm")
    expected_depths = {0.6, 1.0, 1.4, 1.8}
    if set(revisions_by_depth) != expected_depths or set(engines_by_depth) != expected_depths:
        raise ValueError("FDM bindings must cover exactly 0.6, 1.0, 1.4 and 1.8 mm")
    for row in rows:
        depth = float(row["target_relief_mm"])
        row.update(
            {
                "design_id": design_id,
                "sample_id": (
                    f"{design_id}-{row['printer'].replace(' ', '-')}-{round(depth * 100):03d}"
                ),
                "revision_id": revisions_by_depth[depth],
                "engine_version": engines_by_depth[depth],
                "target_width_mm": f"{target_width_mm:g}",
                "target_height_mm": f"{target_height_mm:g}",
                "target_base_mm": f"{target_base_mm:g}",
                "operator_decision": "pending",
            }
        )
    return _write_rows(destination, fields, rows)


def write_bound_uv_template(
    destination: Path,
    *,
    coupon_id: str,
    target_width_mm: float,
    target_height_mm: float,
) -> Path:
    """Write the UV/RIP row with physical targets, leaving machine evidence blank."""

    fields, rows = _read_template("uv")
    for row in rows:
        row.update(
            {
                "coupon_id": coupon_id,
                "target_canvas_width_mm": f"{target_width_mm:g}",
                "target_canvas_height_mm": f"{target_height_mm:g}",
                "operator_decision": "pending",
            }
        )
    return _write_rows(destination, fields, rows)
