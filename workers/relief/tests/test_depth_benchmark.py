from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from depth_benchmark import run_manifest


def _write_inputs(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    height = width = 96
    labels = np.zeros((height, width), dtype=np.uint8)
    labels[12:34, 16:80] = 1  # far
    labels[34:58, 12:84] = 2  # middle
    labels[58:82, 8:88] = 3   # near
    labels[66:75, 28:68] = 4  # text/logo
    silhouette = labels > 0
    text_mask = labels == 4

    direct = np.zeros((height, width), dtype=np.float32)
    direct[labels == 1] = 0.20
    direct[labels == 2] = 0.45
    direct[labels == 3] = 0.70
    direct[labels == 4] = 0.92

    inverted = np.where(silhouette, 1.0 - direct, 0.0)
    wrong = np.zeros_like(direct)
    wrong[labels == 1] = 0.80
    wrong[labels == 2] = 0.20
    wrong[labels == 3] = 0.55
    wrong[labels == 4] = 0.35

    for name, array in (
        ("direct.png", direct),
        ("inverted.png", inverted),
        ("wrong.png", wrong),
    ):
        Image.fromarray(np.round(array * 65535).astype(np.uint16), mode="I;16").save(directory / name)
    Image.fromarray(labels, mode="L").save(directory / "labels.png")
    Image.fromarray((silhouette * 255).astype(np.uint8), mode="L").save(directory / "silhouette.png")
    Image.fromarray((text_mask * 255).astype(np.uint8), mode="L").save(directory / "text.png")

    manifest = {
        "semantic_labels": "labels.png",
        "silhouette_mask": "silhouette.png",
        "text_mask": "text.png",
        "regions": {
            "1": {"name": "far", "rank": 1},
            "2": {"name": "middle", "rank": 2},
            "3": {"name": "near", "rank": 3},
            "4": {"name": "text", "rank": 4},
        },
        "candidates": [
            {"id": "direct", "model": "fixture-direct", "path": "direct.png", "license": "test"},
            {"id": "inverted", "model": "fixture-inverted", "path": "inverted.png", "license": "test"},
            {"id": "wrong", "model": "fixture-wrong", "path": "wrong.png", "license": "test"},
        ],
    }
    manifest_path = directory / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest_path


def test_depth_benchmark_scores_semantic_order_and_detects_inversion(tmp_path: Path) -> None:
    manifest = _write_inputs(tmp_path / "inputs")
    report = run_manifest(manifest, tmp_path / "out")
    scores = {row["candidate_id"]: row for row in report["scores"]}

    assert scores["direct"]["orientation"] == "direct"
    assert scores["direct"]["ordinal_pair_accuracy"] == pytest.approx(1.0)
    assert scores["direct"]["decision"] == "usable_candidate"

    assert scores["inverted"]["orientation"] == "inverted"
    assert scores["inverted"]["ordinal_pair_accuracy"] == pytest.approx(1.0)
    assert scores["inverted"]["composite_score"] >= 0.80

    assert scores["wrong"]["ordinal_pair_accuracy"] < 0.85
    assert scores["wrong"]["decision"] in {"needs_review", "reject_candidate"}

    assert (tmp_path / "out" / "depth-benchmark-report.json").is_file()
    assert (tmp_path / "out" / "depth-benchmark-report.csv").is_file()
    assert (tmp_path / "out" / "normalised" / "direct-normalised-16.png").is_file()


def test_depth_benchmark_rejects_canvas_mismatch(tmp_path: Path) -> None:
    manifest = _write_inputs(tmp_path / "inputs")
    payload = json.loads(manifest.read_text(encoding="utf-8"))
    wrong = np.zeros((95, 96), dtype=np.uint16)
    Image.fromarray(wrong, mode="I;16").save(manifest.parent / "mismatch.png")
    payload["candidates"] = [{"id": "mismatch", "path": "mismatch.png"}]
    manifest.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="does not match labels"):
        run_manifest(manifest, tmp_path / "out")
