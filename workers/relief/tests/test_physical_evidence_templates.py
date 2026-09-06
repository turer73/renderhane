from __future__ import annotations

import csv
from pathlib import Path

from physical_evidence_templates import (
    write_bound_fdm_template,
    write_bound_uv_template,
)


def _rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def test_fdm_template_binds_all_depths_without_inventing_measurements(
    tmp_path: Path,
) -> None:
    depths = (0.6, 1.0, 1.4, 1.8)
    path = write_bound_fdm_template(
        tmp_path / "fdm.csv",
        design_id="calibration-abc",
        revisions_by_depth={depth: f"revision-{depth}" for depth in depths},
        engines_by_depth={depth: "engine-v1" for depth in depths},
        target_width_mm=70,
        target_height_mm=60,
        target_base_mm=3,
    )
    rows = _rows(path)

    assert len(rows) == 8
    assert {row["printer"] for row in rows} == {"P1S", "A1 mini"}
    assert all(row["design_id"] == "calibration-abc" for row in rows)
    assert all(row["target_height_mm"] == "60" for row in rows)
    assert all(row["operator_decision"] == "pending" for row in rows)
    assert all(not row["measured_width_mm"] for row in rows)
    assert all(row["revision_id"].startswith("revision-") for row in rows)


def test_uv_template_binds_canvas_and_leaves_rip_evidence_pending(tmp_path: Path) -> None:
    path = write_bound_uv_template(
        tmp_path / "uv.csv",
        coupon_id="UV-123",
        target_width_mm=120,
        target_height_mm=35,
    )
    rows = _rows(path)

    assert len(rows) == 1
    assert rows[0]["coupon_id"] == "UV-123"
    assert rows[0]["target_canvas_width_mm"] == "120"
    assert rows[0]["target_canvas_height_mm"] == "35"
    assert rows[0]["operator_decision"] == "pending"
    assert not rows[0]["rip"]
