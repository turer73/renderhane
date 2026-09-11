from __future__ import annotations

import csv
from pathlib import Path

from evaluate_physical_benchmark import evaluate_physical_benchmark


FDM_FIELDS = [
    "sample_id",
    "design_id",
    "revision_id",
    "engine_version",
    "printer",
    "printer_profile",
    "slicer",
    "slicer_version",
    "nozzle_mm",
    "layer_height_mm",
    "material",
    "material_brand",
    "material_color",
    "target_width_mm",
    "target_height_mm",
    "target_base_mm",
    "target_relief_mm",
    "measured_width_mm",
    "measured_height_mm",
    "measured_total_thickness_mm",
    "measured_flat_back_deviation_mm",
    "warping_mm",
    "print_time_min",
    "filament_g",
    "detail_score_1_5",
    "text_legibility_1_5",
    "surface_score_1_5",
    "operator_decision",
    "defects",
    "notes",
    "photo_refs",
    "measured_at_utc",
    "operator",
]

UV_FIELDS = [
    "coupon_id",
    "printer",
    "printer_serial_or_asset",
    "rip",
    "rip_version",
    "material",
    "primer",
    "jig_id",
    "target_canvas_width_mm",
    "target_canvas_height_mm",
    "measured_canvas_width_mm",
    "measured_canvas_height_mm",
    "color_offset_x_mm",
    "color_offset_y_mm",
    "white_offset_x_mm",
    "white_offset_y_mm",
    "varnish_offset_x_mm",
    "varnish_offset_y_mm",
    "edge_bleed_mm",
    "maximum_tested_surface_delta_mm",
    "sharpness_score_1_5",
    "operator_decision",
    "defects",
    "notes",
    "photo_refs",
    "measured_at_utc",
    "operator",
]


def _write_csv(path: Path, fields: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def _fdm_rows() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for printer in ("P1S", "A1 mini"):
        for depth in (0.6, 1.0, 1.4, 1.8):
            accepted = depth in {1.0, 1.4}
            rows.append(
                {
                    "sample_id": f"{printer}-{depth}",
                    "design_id": "kapadokya",
                    "revision_id": "rev-1",
                    "engine_version": "test-engine",
                    "printer": printer,
                    "printer_profile": "0.12 standard",
                    "slicer": "Bambu Studio",
                    "slicer_version": "test",
                    "nozzle_mm": 0.4,
                    "layer_height_mm": 0.12,
                    "material": "PLA",
                    "material_brand": "test",
                    "material_color": "white",
                    "target_width_mm": 70.0,
                    "target_height_mm": 60.0,
                    "target_base_mm": 3.0,
                    "target_relief_mm": depth,
                    "measured_width_mm": 70.1,
                    "measured_height_mm": 59.9,
                    "measured_total_thickness_mm": 3.0 + depth + 0.05,
                    "measured_flat_back_deviation_mm": 0.1,
                    "warping_mm": 0.15,
                    "print_time_min": 45 + depth * 5,
                    "filament_g": 18,
                    "detail_score_1_5": 4 if accepted else 2,
                    "text_legibility_1_5": 4 if accepted else 2,
                    "surface_score_1_5": 4 if accepted else 2,
                    "operator_decision": "accepted" if accepted else "rejected",
                    "defects": "" if accepted else "detail loss",
                    "notes": "fixture",
                    "photo_refs": f"photo-{printer}-{depth}.jpg",
                    "measured_at_utc": "2026-09-04T12:00:00Z",
                    "operator": "tester",
                }
            )
    return rows


def _uv_rows(offset: float = 0.2) -> list[dict[str, object]]:
    return [
        {
            "coupon_id": "UV-1",
            "printer": "UV test printer",
            "printer_serial_or_asset": "asset-1",
            "rip": "Test RIP",
            "rip_version": "1",
            "material": "PLA coupon",
            "primer": "none",
            "jig_id": "jig-1",
            "target_canvas_width_mm": 70,
            "target_canvas_height_mm": 70,
            "measured_canvas_width_mm": 70.1,
            "measured_canvas_height_mm": 69.9,
            "color_offset_x_mm": offset,
            "color_offset_y_mm": 0.1,
            "white_offset_x_mm": 0.2,
            "white_offset_y_mm": 0.1,
            "varnish_offset_x_mm": 0.1,
            "varnish_offset_y_mm": 0.2,
            "edge_bleed_mm": 0.2,
            "maximum_tested_surface_delta_mm": 1.4,
            "sharpness_score_1_5": 4,
            "operator_decision": "accepted",
            "defects": "",
            "notes": "fixture",
            "photo_refs": "uv-photo.jpg",
            "measured_at_utc": "2026-09-04T13:00:00Z",
            "operator": "tester",
        }
    ]


def test_complete_evidence_can_be_eligible_but_never_auto_approved(tmp_path: Path) -> None:
    fdm = tmp_path / "fdm.csv"
    uv = tmp_path / "uv.csv"
    _write_csv(fdm, FDM_FIELDS, _fdm_rows())
    _write_csv(uv, UV_FIELDS, _uv_rows())

    report = evaluate_physical_benchmark(fdm_csv=fdm, uv_csv=uv)

    assert report["fdm"]["complete"] is True
    assert report["fdm"]["pass"] is True
    assert report["fdm"]["eligible_depths_mm"] == [1.0, 1.4]
    assert report["uv"]["pass"] is True
    assert report["physical_gate"] == "pass"
    assert report["production_status"] == "eligible_for_final_human_approval"
    assert report["human_approval_required"] is True
    assert report["production_status"] != "approved"


def test_pending_template_stays_incomplete_and_not_approved(tmp_path: Path) -> None:
    rows = _fdm_rows()
    rows[0]["operator_decision"] = "pending"
    rows[0]["measured_width_mm"] = ""
    fdm = tmp_path / "fdm.csv"
    uv = tmp_path / "uv.csv"
    _write_csv(fdm, FDM_FIELDS, rows)
    _write_csv(uv, UV_FIELDS, _uv_rows())

    report = evaluate_physical_benchmark(fdm_csv=fdm, uv_csv=uv)

    assert report["fdm"]["complete"] is False
    assert report["physical_gate"] == "incomplete"
    assert report["production_status"] == "not_approved"


def test_uv_registration_over_limit_fails_physical_gate(tmp_path: Path) -> None:
    fdm = tmp_path / "fdm.csv"
    uv = tmp_path / "uv.csv"
    _write_csv(fdm, FDM_FIELDS, _fdm_rows())
    _write_csv(uv, UV_FIELDS, _uv_rows(offset=0.8))

    report = evaluate_physical_benchmark(fdm_csv=fdm, uv_csv=uv)

    assert report["fdm"]["pass"] is True
    assert report["uv"]["complete"] is True
    assert report["uv"]["pass"] is False
    assert report["physical_gate"] == "fail"
    assert report["production_status"] == "not_approved"
