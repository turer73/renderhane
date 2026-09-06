from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import compile_semantic_relief as semantic_cli
import relief_engine.semantic_ops as semantic_ops
from relief_engine import BuildRecipe, build, compile_semantic_relief
from relief_engine.semantic_ops import (
    SemanticReliefInputError,
    _component_diameters_mm,
)


def _recipe(*, candidate_weight: float = 0.0, detail_gain_mm: float = 0.0) -> dict:
    return {
        "schema_version": 1,
        "regions": [
            {
                "id": 1,
                "name": "background",
                "rank": 0,
                "edge_height_mm": 0.5,
                "plateau_height_mm": 0.5,
                "bevel_width_mm": 0.0,
                "profile": "flat",
                "candidate_weight": candidate_weight,
                "detail_gain_mm": detail_gain_mm,
            },
            {
                "id": 2,
                "name": "foreground",
                "rank": 1,
                "edge_height_mm": 0.75,
                "plateau_height_mm": 0.75,
                "bevel_width_mm": 0.0,
                "profile": "flat",
                "candidate_weight": candidate_weight,
                "detail_gain_mm": detail_gain_mm,
            },
        ],
        "filters": {
            "outer_bevel_width_mm": 0.0,
            "candidate_low_percentile": 2.0,
            "candidate_high_percentile": 98.0,
            "candidate_low_pass_sigma_mm": 0.0,
            "candidate_orientation": "direct",
            "detail_small_sigma_mm": 0.0,
            "detail_large_sigma_mm": 1.0,
            "detail_clip_percentile": 95.0,
            "detail_orientation": "direct",
        },
    }


def _write_recipe(path: Path, recipe: dict) -> None:
    path.write_text(json.dumps(recipe, indent=2), encoding="utf-8")


def _write_labels(path: Path, *, uint16: bool = False) -> np.ndarray:
    labels = np.ones((16, 16), dtype=np.uint16 if uint16 else np.uint8)
    labels[4:12, 4:12] = 2
    Image.fromarray(labels).save(path)
    return labels


def _compile(tmp_path: Path, *, recipe: dict | None = None, uint16: bool = False) -> dict:
    tmp_path.mkdir(parents=True, exist_ok=True)
    labels_path = tmp_path / ("labels-16.png" if uint16 else "labels-8.png")
    _write_labels(labels_path, uint16=uint16)
    recipe_path = tmp_path / "recipe.json"
    _write_recipe(recipe_path, recipe or _recipe())
    return compile_semantic_relief(
        labels_path,
        recipe_path,
        tmp_path / "compiled",
        physical_width_mm=8.0,
        physical_height_mm=16.0,
        relief_depth_mm=1.0,
        minimum_feature_mm=0.6,
    )


def test_uint8_uint16_exact_canvas_and_canonical_outputs(tmp_path: Path) -> None:
    report8 = _compile(tmp_path / "eight", uint16=False)
    report16 = _compile(tmp_path / "sixteen", uint16=True)

    assert report8["canvas_px"] == [16, 16]
    assert report8["pixel_pitch_mm"] == [0.5, 1.0]
    assert report8["physical_validation_status"] == "pending"
    assert report8["production_status"] == "not_approved_pending_physical_validation"
    assert report8["inputs"]["canonical_recipe_sha256"] == report16["inputs"]["canonical_recipe_sha256"]
    assert report8["artifacts"]["silhouette_mask"]["file"] == "silhouette-mask.png"
    assert Image.open(tmp_path / "eight" / "compiled" / "relief-map-16.png").mode == "I;16"
    assert Image.open(tmp_path / "eight" / "compiled" / "silhouette-mask.png").mode == "L"


def test_recipe_order_is_canonical_and_unknown_fields_fail_closed(tmp_path: Path) -> None:
    first = _recipe()
    second = _recipe()
    second["regions"] = list(reversed(second["regions"]))
    first_report = _compile(tmp_path / "first", recipe=first)
    second_report = _compile(tmp_path / "second", recipe=second)
    assert first_report["inputs"]["canonical_recipe_sha256"] == second_report["inputs"]["canonical_recipe_sha256"]

    invalid = _recipe()
    invalid["unexpected"] = True
    with pytest.raises(SemanticReliefInputError, match="exactly"):
        _compile(tmp_path / "invalid", recipe=invalid)

    duplicate = _recipe()
    duplicate["regions"][1]["id"] = duplicate["regions"][0]["id"]
    with pytest.raises(SemanticReliefInputError, match="ids must be unique"):
        _compile(tmp_path / "duplicate", recipe=duplicate)

    duplicate_rank = _recipe()
    duplicate_rank["regions"][1]["rank"] = duplicate_rank["regions"][0]["rank"]
    with pytest.raises(SemanticReliefInputError, match="ranks must be unique"):
        _compile(tmp_path / "duplicate-rank", recipe=duplicate_rank)

    invalid_orientation = _recipe()
    invalid_orientation["filters"]["candidate_orientation"] = "sideways"
    with pytest.raises(SemanticReliefInputError, match="candidate_orientation"):
        _compile(tmp_path / "invalid-orientation", recipe=invalid_orientation)

    non_object = _recipe()
    non_object["regions"][0] = "not-an-object"
    with pytest.raises(SemanticReliefInputError, match="must be an object"):
        _compile(tmp_path / "non-object", recipe=non_object)


def test_missing_and_undeclared_label_ids_fail_closed(tmp_path: Path) -> None:
    recipe_path = tmp_path / "recipe.json"
    _write_recipe(recipe_path, _recipe())
    missing = np.ones((16, 16), dtype=np.uint8)
    Image.fromarray(missing).save(tmp_path / "missing.png")
    with pytest.raises(SemanticReliefInputError, match="missing from label map"):
        compile_semantic_relief(
            tmp_path / "missing.png",
            recipe_path,
            tmp_path / "missing-out",
            physical_width_mm=8.0,
            physical_height_mm=16.0,
            relief_depth_mm=1.0,
        )

    undeclared = missing.copy()
    undeclared[0, 0] = 3
    Image.fromarray(undeclared).save(tmp_path / "undeclared.png")
    with pytest.raises(SemanticReliefInputError, match="undeclared ids"):
        compile_semantic_relief(
            tmp_path / "undeclared.png",
            recipe_path,
            tmp_path / "undeclared-out",
            physical_width_mm=8.0,
            physical_height_mm=16.0,
            relief_depth_mm=1.0,
        )


def test_region_pixel_work_budget_is_fail_closed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(semantic_ops, "MAX_REGION_PIXEL_WORK", 1)
    with pytest.raises(SemanticReliefInputError, match="computation limit"):
        _compile(tmp_path)


def test_candidate_detail_are_bounded_and_wrong_canvas_is_rejected(tmp_path: Path) -> None:
    recipe = _recipe(candidate_weight=0.5, detail_gain_mm=0.1)
    for region in recipe["regions"]:
        region.update({"edge_height_mm": 0.2, "plateau_height_mm": 0.8, "bevel_width_mm": 2.0, "profile": "linear"})
    root = tmp_path / "bounded"
    root.mkdir()
    labels_path = root / "labels.png"
    _write_labels(labels_path)
    recipe_path = root / "recipe.json"
    _write_recipe(recipe_path, recipe)
    candidate = np.tile(np.linspace(0, 255, 16, dtype=np.uint8), (16, 1))
    detail = np.flipud(candidate)
    Image.fromarray(candidate).save(root / "candidate.png")
    Image.fromarray(detail).save(root / "detail.png")
    report = compile_semantic_relief(
        labels_path,
        recipe_path,
        root / "out",
        physical_width_mm=8.0,
        physical_height_mm=16.0,
        relief_depth_mm=1.0,
        depth_candidate_path=root / "candidate.png",
        detail_source_path=root / "detail.png",
    )
    assert report["height_range_mm"][0] >= 0.0
    assert report["height_range_mm"][1] <= 1.0
    assert report["surface_slope_degrees"]["max"] >= report["surface_slope_degrees"]["p95"]

    inverted_recipe = json.loads(json.dumps(recipe))
    inverted_recipe["filters"]["candidate_orientation"] = "inverted"
    _write_recipe(root / "inverted-recipe.json", inverted_recipe)
    compile_semantic_relief(
        labels_path,
        root / "inverted-recipe.json",
        root / "inverted-out",
        physical_width_mm=8.0,
        physical_height_mm=16.0,
        relief_depth_mm=1.0,
        depth_candidate_path=root / "candidate.png",
        detail_source_path=root / "detail.png",
    )
    assert not np.array_equal(
        np.asarray(Image.open(root / "out" / "relief-map-16.png")),
        np.asarray(Image.open(root / "inverted-out" / "relief-map-16.png")),
    )

    Image.fromarray(np.zeros((15, 16), dtype=np.uint8)).save(root / "wrong.png")
    with pytest.raises(SemanticReliefInputError, match="exact semantic canvas"):
        compile_semantic_relief(
            labels_path,
            recipe_path,
            root / "wrong-out",
            physical_width_mm=8.0,
            physical_height_mm=16.0,
            relief_depth_mm=1.0,
            depth_candidate_path=root / "wrong.png",
            detail_source_path=root / "detail.png",
        )


def test_minimum_feature_warning_and_half_up_quantization(tmp_path: Path) -> None:
    report = _compile(tmp_path, uint16=False)
    assert report["regions"][0]["smallest_component_inscribed_diameter_mm"] > 0
    assert report["quantization"]["rounding"] == "half_up_floor_x_plus_0_5"
    encoded = np.asarray(Image.open(tmp_path / "compiled" / "relief-map-16.png"))
    assert 32768 in set(np.unique(encoded))

    narrow = np.ones((16, 16), dtype=np.uint8)
    narrow[:, -1] = 2
    Image.fromarray(narrow).save(tmp_path / "narrow-labels.png")
    recipe_path = tmp_path / "narrow-recipe.json"
    _write_recipe(recipe_path, _recipe())
    warning = compile_semantic_relief(
        tmp_path / "narrow-labels.png",
        recipe_path,
        tmp_path / "narrow-out",
        physical_width_mm=8.0,
        physical_height_mm=16.0,
        relief_depth_mm=1.0,
        minimum_feature_mm=2.0,
    )
    assert any("minimum_feature" in warning for warning in warning["warnings"])


def test_detail_without_local_dynamic_range_is_reported(tmp_path: Path) -> None:
    recipe = _recipe(detail_gain_mm=0.1)
    root = tmp_path / "flat-detail"
    root.mkdir()
    _write_labels(root / "labels.png")
    _write_recipe(root / "recipe.json", recipe)
    Image.fromarray(np.full((16, 16), 127, dtype=np.uint8)).save(root / "detail.png")
    report = compile_semantic_relief(
        root / "labels.png",
        root / "recipe.json",
        root / "out",
        physical_width_mm=8.0,
        physical_height_mm=16.0,
        relief_depth_mm=1.0,
        detail_source_path=root / "detail.png",
    )
    assert report["detail_clipped_fraction"] == 0.0
    assert any("detail_source_has_no_local_dynamic_range" in warning for warning in report["warnings"])


def test_anisotropic_edt_preserves_physical_equivalence_and_output_invariants(tmp_path: Path) -> None:
    coarse = np.ones((4, 8), dtype=bool)
    fine = np.ones((8, 16), dtype=bool)
    assert _component_diameters_mm(coarse, (1.0, 0.5)) == _component_diameters_mm(fine, (0.5, 0.25))
    assert _component_diameters_mm(coarse, (1.0, 0.5)) == [4.0]

    report = _compile(tmp_path)
    encoded = np.asarray(Image.open(tmp_path / "compiled" / "relief-map-16.png"))
    silhouette = np.asarray(Image.open(tmp_path / "compiled" / "silhouette-mask.png"))
    labels = np.asarray(Image.open(tmp_path / "labels-8.png"))
    assert encoded.dtype == np.uint16
    assert int(encoded.min()) >= 0 and int(encoded.max()) <= 65535
    assert np.array_equal(silhouette > 0, labels > 0)
    assert report["pixel_pitch_mm"] == [0.5, 1.0]


def test_cli_sanitizes_known_input_errors(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    def fail(*args: object, **kwargs: object) -> dict:
        raise SemanticReliefInputError("private detail that must not be printed")

    monkeypatch.setattr(semantic_cli, "compile_semantic_relief", fail)
    result = semantic_cli.main(
        [
            "--labels", "labels.png", "--recipe", "recipe.json", "--output", "out",
            "--width-mm", "8", "--height-mm", "16", "--relief-depth-mm", "1",
        ]
    )
    captured = capsys.readouterr()
    assert result == 2
    assert captured.err.strip() == "semantic_relief_compile_failed"
    assert "private detail" not in captured.err


def test_compiler_output_is_accepted_by_absolute_no_smoothing_build(tmp_path: Path) -> None:
    report = _compile(tmp_path)
    build_report = build(
        tmp_path / "compiled" / "relief-map-16.png",
        tmp_path / "built",
        BuildRecipe(
            width_mm=8.0,
            height_mm=16.0,
            base_thickness_mm=1.0,
            relief_depth_mm=1.0,
            grid_long_edge=16,
            smoothing_sigma_px=0.0,
            normalization_mode="absolute",
        ),
    )
    assert report["artifacts"]["relief_map_16"]["file"] == "relief-map-16.png"
    assert build_report.recipe["normalization_mode"] == "absolute"
    assert build_report.recipe["smoothing_sigma_px"] == 0.0
