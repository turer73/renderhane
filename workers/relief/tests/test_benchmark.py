from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

WORKER_DIR = Path(__file__).resolve().parents[1]


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = _load_module(
    "generate_synthetic_benchmark",
    WORKER_DIR / "generate_synthetic_benchmark.py",
)
benchmark = _load_module("benchmark", WORKER_DIR / "benchmark.py")


def test_synthetic_multi_depth_benchmark_passes_digital_gate(tmp_path: Path) -> None:
    fixture_dir = tmp_path / "fixture"
    result_dir = tmp_path / "results"
    generator.generate(fixture_dir, width=96, height=72)

    summary = benchmark.run_benchmark(
        fixture_dir / "relief-map-16.png",
        result_dir,
        [0.6, 1.0, 1.4, 1.8],
        mask=fixture_dir / "silhouette-mask.png",
        width_mm=70.0,
        base_thickness_mm=3.0,
        grid_long_edge=64,
    )

    assert summary["digital_gate"] == "pass"
    assert summary["failed_depths_mm"] == []
    assert [row["depth_mm"] for row in summary["variants"]] == [0.6, 1.0, 1.4, 1.8]

    for row in summary["variants"]:
        assert row["watertight"] is True
        assert row["is_volume"] is True
        assert row["open_edge_count"] == 0
        assert row["extents_mm"][0] == pytest.approx(70.0, abs=1e-5)
        assert row["extents_mm"][2] == pytest.approx(3.0 + row["depth_mm"], abs=1e-5)
        assert "model.stl" in row["artifacts"]
        assert "model.glb" in row["artifacts"]

    assert (result_dir / "benchmark-summary.json").is_file()
    assert (result_dir / "benchmark-summary.csv").is_file()


def test_benchmark_rejects_invalid_depths(tmp_path: Path) -> None:
    fixture_dir = tmp_path / "fixture"
    generator.generate(fixture_dir, width=64, height=64)

    with pytest.raises(ValueError):
        benchmark.run_benchmark(
            fixture_dir / "relief-map-16.png",
            tmp_path / "out",
            [0.0],
        )
