from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

ENGINE_VERSION = "physical-benchmark-evaluator-v0.1.0"
REQUIRED_PRINTERS = ("P1S", "A1 mini")
REQUIRED_DEPTHS_MM = (0.6, 1.0, 1.4, 1.8)
FINAL_DECISIONS = {"accepted", "accepted_with_warnings", "rejected"}
PASSING_DECISIONS = {"accepted", "accepted_with_warnings"}


@dataclass(frozen=True)
class PhysicalThresholds:
    dimension_error_mm: float = 0.50
    thickness_error_mm: float = 0.30
    flat_back_deviation_mm: float = 0.30
    warping_mm: float = 0.40
    minimum_visual_score: float = 3.0
    uv_registration_mm: float = 0.50
    uv_canvas_error_mm: float = 0.50
    uv_edge_bleed_mm: float = 0.50
    minimum_uv_sharpness_score: float = 3.0

    def validate(self) -> None:
        for name, value in asdict(self).items():
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{name} must be finite and non-negative")


class EvidenceError(ValueError):
    pass


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise FileNotFoundError(path)
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise EvidenceError(f"CSV has no header: {path}")
        return [
            {str(key): (value or "").strip() for key, value in row.items()}
            for row in reader
        ]


def _float(row: dict[str, str], field: str, *, required: bool = True) -> float | None:
    raw = row.get(field, "").strip()
    if not raw:
        if required:
            raise EvidenceError(f"missing {field}")
        return None
    try:
        value = float(raw.replace(",", "."))
    except ValueError as exc:
        raise EvidenceError(f"invalid number in {field}: {raw}") from exc
    if not math.isfinite(value):
        raise EvidenceError(f"non-finite number in {field}")
    return value


def _normalise_printer(raw: str) -> str:
    value = " ".join(raw.strip().lower().replace("_", " ").split())
    aliases = {
        "p1s": "P1S",
        "bambu p1s": "P1S",
        "bambu lab p1s": "P1S",
        "a1 mini": "A1 mini",
        "a1mini": "A1 mini",
        "bambu a1 mini": "A1 mini",
        "bambu lab a1 mini": "A1 mini",
    }
    return aliases.get(value, raw.strip())


def _required_text(row: dict[str, str], fields: list[str]) -> list[str]:
    return [field for field in fields if not row.get(field, "").strip()]


def _evaluate_fdm_row(
    row: dict[str, str],
    thresholds: PhysicalThresholds,
) -> dict[str, Any]:
    sample_id = row.get("sample_id", "").strip() or "unknown"
    decision = row.get("operator_decision", "").strip().lower()
    printer = _normalise_printer(row.get("printer", ""))
    failures: list[str] = []
    warnings: list[str] = []

    try:
        depth = _float(row, "target_relief_mm")
    except EvidenceError as exc:
        return {
            "sample_id": sample_id,
            "printer": printer,
            "depth_mm": None,
            "complete": False,
            "pass": False,
            "failures": [str(exc)],
            "warnings": [],
        }
    assert depth is not None

    required_text = _required_text(
        row,
        [
            "design_id",
            "revision_id",
            "engine_version",
            "printer_profile",
            "slicer",
            "slicer_version",
            "material",
            "operator_decision",
            "photo_refs",
            "measured_at_utc",
            "operator",
        ],
    )
    if required_text:
        failures.append("missing_text_fields:" + ",".join(required_text))
    if decision not in FINAL_DECISIONS:
        failures.append("operator_decision_not_final")

    numeric_fields = [
        "target_width_mm",
        "target_height_mm",
        "target_base_mm",
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
    ]
    values: dict[str, float] = {}
    for field in numeric_fields:
        try:
            parsed = _float(row, field)
            assert parsed is not None
            values[field] = parsed
        except EvidenceError as exc:
            failures.append(str(exc))

    metrics: dict[str, float] = {}
    if not failures:
        target_total = values["target_base_mm"] + depth
        metrics = {
            "width_error_mm": abs(
                values["measured_width_mm"] - values["target_width_mm"]
            ),
            "height_error_mm": abs(
                values["measured_height_mm"] - values["target_height_mm"]
            ),
            "thickness_error_mm": abs(
                values["measured_total_thickness_mm"] - target_total
            ),
            "flat_back_deviation_mm": values[
                "measured_flat_back_deviation_mm"
            ],
            "warping_mm": values["warping_mm"],
            "detail_score_1_5": values["detail_score_1_5"],
            "text_legibility_1_5": values["text_legibility_1_5"],
            "surface_score_1_5": values["surface_score_1_5"],
            "print_time_min": values["print_time_min"],
            "filament_g": values["filament_g"],
        }
        if metrics["width_error_mm"] > thresholds.dimension_error_mm:
            failures.append("width_error_exceeds_threshold")
        if metrics["height_error_mm"] > thresholds.dimension_error_mm:
            failures.append("height_error_exceeds_threshold")
        if metrics["thickness_error_mm"] > thresholds.thickness_error_mm:
            failures.append("thickness_error_exceeds_threshold")
        if metrics["flat_back_deviation_mm"] > thresholds.flat_back_deviation_mm:
            failures.append("flat_back_deviation_exceeds_threshold")
        if metrics["warping_mm"] > thresholds.warping_mm:
            failures.append("warping_exceeds_threshold")
        for score_field in (
            "detail_score_1_5",
            "text_legibility_1_5",
            "surface_score_1_5",
        ):
            if not 1.0 <= metrics[score_field] <= 5.0:
                failures.append(f"{score_field}_outside_1_5")
            elif metrics[score_field] < thresholds.minimum_visual_score:
                failures.append(f"{score_field}_below_threshold")
        if decision == "accepted_with_warnings":
            warnings.append("operator_accepted_with_warnings")
        if decision == "rejected":
            failures.append("operator_rejected_sample")

    complete = not any(
        failure.startswith("missing_")
        or failure == "operator_decision_not_final"
        or failure.startswith("invalid number")
        or failure.startswith("non-finite")
        for failure in failures
    )
    passed = complete and decision in PASSING_DECISIONS and not failures
    return {
        "sample_id": sample_id,
        "printer": printer,
        "depth_mm": depth,
        "complete": complete,
        "pass": passed,
        "operator_decision": decision,
        "metrics": {key: round(value, 6) for key, value in metrics.items()},
        "failures": failures,
        "warnings": warnings,
        "photo_refs": row.get("photo_refs", ""),
    }


def _evaluate_uv_row(
    row: dict[str, str],
    thresholds: PhysicalThresholds,
) -> dict[str, Any]:
    coupon_id = row.get("coupon_id", "").strip() or "unknown"
    decision = row.get("operator_decision", "").strip().lower()
    failures: list[str] = []
    warnings: list[str] = []

    required_text = _required_text(
        row,
        [
            "printer",
            "rip",
            "rip_version",
            "material",
            "jig_id",
            "operator_decision",
            "photo_refs",
            "measured_at_utc",
            "operator",
        ],
    )
    if required_text:
        failures.append("missing_text_fields:" + ",".join(required_text))
    if decision not in FINAL_DECISIONS:
        failures.append("operator_decision_not_final")

    required_numeric = [
        "target_canvas_width_mm",
        "target_canvas_height_mm",
        "measured_canvas_width_mm",
        "measured_canvas_height_mm",
        "color_offset_x_mm",
        "color_offset_y_mm",
        "white_offset_x_mm",
        "white_offset_y_mm",
        "edge_bleed_mm",
        "maximum_tested_surface_delta_mm",
        "sharpness_score_1_5",
    ]
    values: dict[str, float] = {}
    for field in required_numeric:
        try:
            parsed = _float(row, field)
            assert parsed is not None
            values[field] = parsed
        except EvidenceError as exc:
            failures.append(str(exc))

    for optional in ("varnish_offset_x_mm", "varnish_offset_y_mm"):
        try:
            parsed = _float(row, optional, required=False)
            if parsed is not None:
                values[optional] = parsed
        except EvidenceError as exc:
            failures.append(str(exc))

    metrics: dict[str, float] = {}
    if not failures:
        offsets = [
            abs(values["color_offset_x_mm"]),
            abs(values["color_offset_y_mm"]),
            abs(values["white_offset_x_mm"]),
            abs(values["white_offset_y_mm"]),
        ]
        varnish_values = [
            values.get("varnish_offset_x_mm"),
            values.get("varnish_offset_y_mm"),
        ]
        offsets.extend(abs(value) for value in varnish_values if value is not None)
        metrics = {
            "canvas_width_error_mm": abs(
                values["measured_canvas_width_mm"]
                - values["target_canvas_width_mm"]
            ),
            "canvas_height_error_mm": abs(
                values["measured_canvas_height_mm"]
                - values["target_canvas_height_mm"]
            ),
            "maximum_registration_offset_mm": max(offsets),
            "edge_bleed_mm": abs(values["edge_bleed_mm"]),
            "maximum_tested_surface_delta_mm": values[
                "maximum_tested_surface_delta_mm"
            ],
            "sharpness_score_1_5": values["sharpness_score_1_5"],
        }
        if metrics["canvas_width_error_mm"] > thresholds.uv_canvas_error_mm:
            failures.append("uv_canvas_width_error_exceeds_threshold")
        if metrics["canvas_height_error_mm"] > thresholds.uv_canvas_error_mm:
            failures.append("uv_canvas_height_error_exceeds_threshold")
        if metrics["maximum_registration_offset_mm"] > thresholds.uv_registration_mm:
            failures.append("uv_registration_exceeds_threshold")
        if metrics["edge_bleed_mm"] > thresholds.uv_edge_bleed_mm:
            failures.append("uv_edge_bleed_exceeds_threshold")
        if not 1.0 <= metrics["sharpness_score_1_5"] <= 5.0:
            failures.append("sharpness_score_outside_1_5")
        elif metrics["sharpness_score_1_5"] < thresholds.minimum_uv_sharpness_score:
            failures.append("uv_sharpness_below_threshold")
        if decision == "accepted_with_warnings":
            warnings.append("operator_accepted_with_warnings")
        if decision == "rejected":
            failures.append("operator_rejected_coupon")
        if all(value is None for value in varnish_values):
            warnings.append("varnish_channel_not_measured")

    complete = not any(
        failure.startswith("missing_")
        or failure == "operator_decision_not_final"
        or failure.startswith("invalid number")
        or failure.startswith("non-finite")
        for failure in failures
    )
    passed = complete and decision in PASSING_DECISIONS and not failures
    return {
        "coupon_id": coupon_id,
        "complete": complete,
        "pass": passed,
        "operator_decision": decision,
        "metrics": {key: round(value, 6) for key, value in metrics.items()},
        "failures": failures,
        "warnings": warnings,
        "photo_refs": row.get("photo_refs", ""),
    }


def _depth_key(depth: float) -> float:
    return round(depth, 3)


def evaluate_physical_benchmark(
    *,
    fdm_csv: Path,
    uv_csv: Path,
    thresholds: PhysicalThresholds | None = None,
) -> dict[str, Any]:
    thresholds = thresholds or PhysicalThresholds()
    thresholds.validate()

    fdm_rows = [_evaluate_fdm_row(row, thresholds) for row in _read_csv(fdm_csv)]
    uv_rows = [_evaluate_uv_row(row, thresholds) for row in _read_csv(uv_csv)]

    expected = {
        (printer, _depth_key(depth))
        for printer in REQUIRED_PRINTERS
        for depth in REQUIRED_DEPTHS_MM
    }
    indexed: dict[tuple[str, float], dict[str, Any]] = {}
    duplicates: list[str] = []
    unexpected: list[str] = []
    for row in fdm_rows:
        if row["depth_mm"] is None:
            continue
        key = (row["printer"], _depth_key(float(row["depth_mm"])))
        if key in indexed:
            duplicates.append(f"{key[0]}:{key[1]:g}")
        indexed[key] = row
        if key not in expected:
            unexpected.append(f"{key[0]}:{key[1]:g}")

    missing = sorted(
        f"{printer}:{depth:g}"
        for printer, depth in expected
        if (printer, depth) not in indexed
    )
    incomplete = sorted(
        f"{printer}:{depth:g}"
        for (printer, depth), row in indexed.items()
        if (printer, depth) in expected and not row["complete"]
    )

    eligible_depths: list[float] = []
    depth_scores: list[dict[str, Any]] = []
    for depth in REQUIRED_DEPTHS_MM:
        rows = [indexed.get((printer, _depth_key(depth))) for printer in REQUIRED_PRINTERS]
        if any(row is None for row in rows):
            continue
        assert all(row is not None for row in rows)
        typed_rows = [row for row in rows if row is not None]
        if all(row["pass"] for row in typed_rows):
            eligible_depths.append(depth)
            visual_scores = [
                min(
                    row["metrics"]["detail_score_1_5"],
                    row["metrics"]["text_legibility_1_5"],
                    row["metrics"]["surface_score_1_5"],
                )
                for row in typed_rows
            ]
            dimensional_penalty = sum(
                row["metrics"]["width_error_mm"]
                + row["metrics"]["height_error_mm"]
                + row["metrics"]["thickness_error_mm"]
                for row in typed_rows
            )
            score = min(visual_scores) * 10.0 - dimensional_penalty
            depth_scores.append(
                {
                    "depth_mm": depth,
                    "score": round(score, 6),
                    "minimum_visual_score": min(visual_scores),
                    "dimensional_penalty_mm": round(dimensional_penalty, 6),
                }
            )

    depth_scores.sort(key=lambda row: (-row["score"], row["depth_mm"]))
    provisional_depth = depth_scores[0]["depth_mm"] if depth_scores else None

    fdm_complete = not missing and not incomplete and not duplicates and not unexpected
    fdm_pass = fdm_complete and bool(eligible_depths)
    uv_complete = bool(uv_rows) and all(row["complete"] for row in uv_rows)
    uv_pass = uv_complete and any(row["pass"] for row in uv_rows)
    physical_gate = "pass" if fdm_pass and uv_pass else (
        "incomplete" if not fdm_complete or not uv_complete else "fail"
    )

    return {
        "schema_version": 1,
        "engine_version": ENGINE_VERSION,
        "thresholds": asdict(thresholds),
        "fdm": {
            "complete": fdm_complete,
            "pass": fdm_pass,
            "required_printers": list(REQUIRED_PRINTERS),
            "required_depths_mm": list(REQUIRED_DEPTHS_MM),
            "missing_samples": missing,
            "incomplete_samples": incomplete,
            "duplicate_samples": sorted(set(duplicates)),
            "unexpected_samples": sorted(set(unexpected)),
            "eligible_depths_mm": eligible_depths,
            "depth_scores": depth_scores,
            "samples": fdm_rows,
        },
        "uv": {
            "complete": uv_complete,
            "pass": uv_pass,
            "coupons": uv_rows,
        },
        "physical_gate": physical_gate,
        "provisional_recommended_relief_depth_mm": provisional_depth,
        "human_approval_required": True,
        "production_status": (
            "eligible_for_final_human_approval"
            if physical_gate == "pass"
            else "not_approved"
        ),
        "notice": (
            "The evaluator never grants final production approval. It checks evidence "
            "completeness and thresholds; an accountable human must approve the recipe."
        ),
    }


def _markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Renderhane Relief Pro — Physical Benchmark Evaluation",
        "",
        f"- Physical gate: **{report['physical_gate'].upper()}**",
        f"- Production status: **{report['production_status']}**",
        f"- Provisional relief depth: `{report['provisional_recommended_relief_depth_mm']}`",
        "- Final human approval required: **YES**",
        "",
        "## FDM",
        "",
        f"- Complete: `{report['fdm']['complete']}`",
        f"- Pass: `{report['fdm']['pass']}`",
        f"- Eligible depths: `{report['fdm']['eligible_depths_mm']}`",
        f"- Missing: `{report['fdm']['missing_samples']}`",
        f"- Incomplete: `{report['fdm']['incomplete_samples']}`",
        "",
        "## UV",
        "",
        f"- Complete: `{report['uv']['complete']}`",
        f"- Pass: `{report['uv']['pass']}`",
        "",
        "## Boundary",
        "",
        report["notice"],
    ]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate complete P1S, A1 mini and UV physical benchmark evidence"
    )
    parser.add_argument("--fdm-csv", type=Path, required=True)
    parser.add_argument("--uv-csv", type=Path, required=True)
    parser.add_argument("--output-json", type=Path)
    parser.add_argument("--output-md", type=Path)
    args = parser.parse_args(argv)

    try:
        report = evaluate_physical_benchmark(
            fdm_csv=args.fdm_csv,
            uv_csv=args.uv_csv,
        )
    except Exception as exc:
        print(f"physical benchmark evaluation failed: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    if args.output_json:
        args.output_json.parent.mkdir(parents=True, exist_ok=True)
        args.output_json.write_text(payload, encoding="utf-8")
    if args.output_md:
        args.output_md.parent.mkdir(parents=True, exist_ok=True)
        args.output_md.write_text(_markdown(report), encoding="utf-8")
    print(payload, end="")
    return 0 if report["physical_gate"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
