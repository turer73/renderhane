from __future__ import annotations

import importlib.util
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

WORKER_DIR = Path(__file__).resolve().parents[1]
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


benchmark = load_module("phase0_benchmark", WORKER_DIR / "run_phase0_benchmark.py")
coupon = load_module("uv_coupon", WORKER_DIR / "generate_uv_clearance_coupon.py")


def write_fixture(directory: Path) -> dict[str, Path]:
    directory.mkdir()
    width = height = 64
    x = np.linspace(0, 1, width, dtype=np.float32)[None, :]
    y = np.linspace(0, 1, height, dtype=np.float32)[:, None]
    relief = np.clip(x * 0.6 + y * 0.4, 0, 1)
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[6:58, 8:56] = 255
    uv = np.zeros((height, width, 4), dtype=np.uint8)
    uv[..., 0] = 120
    uv[..., 1] = np.arange(height, dtype=np.uint8)[:, None] * 3
    uv[..., 2] = np.arange(width, dtype=np.uint8)[None, :] * 3
    uv[..., 3] = mask

    paths = {
        "relief": directory / "relief.png",
        "mask": directory / "mask.png",
        "uv": directory / "uv.png",
        "white": directory / "white.png",
        "varnish": directory / "varnish.png",
    }
    Image.fromarray(np.round(relief * 65535).astype(np.uint16)).save(paths["relief"])
    Image.fromarray(mask).save(paths["mask"])
    Image.fromarray(uv, mode="RGBA").save(paths["uv"])
    Image.fromarray(mask).save(paths["white"])
    Image.fromarray(mask).save(paths["varnish"])
    return paths


def test_phase0_runner_keeps_physical_decision_pending(tmp_path: Path) -> None:
    paths = write_fixture(tmp_path / "fixture")
    out = tmp_path / "benchmark"
    summary = benchmark.run_benchmark(
        relief_map=paths["relief"],
        mask=paths["mask"],
        output_dir=out,
        depths=(0.6, 1.0),
        width_mm=70,
        base_thickness_mm=3,
        grid_long_edge=48,
        artwork_long_edge_px=256,
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        front_master=paths["uv"],
        source_note="unit-test fixture",
    )
    assert summary["digital_benchmark_status"] == "validated"
    assert summary["physical_benchmark_status"] == "pending"
    assert summary["default_relief_depth_mm"] is None
    assert len(summary["builds"]) == 2
    assert (out / "physical-measurements.csv").read_text().count("pending") == 8

    package = out / "renderhane-relief-pro-phase0.zip"
    with zipfile.ZipFile(package) as archive:
        names = set(archive.namelist())
        assert "builds/0.6mm/model.3mf" in names
        assert "builds/1.0mm/uv-print-aligned.png" in names
        assert "PHYSICAL-TEST.md" in names
        assert "DIGITAL-STATUS.md" in names
        assert "physical-measurements.csv" in names
        assert "inputs/front-master.png" in names
    status = (out / "DIGITAL-STATUS.md").read_text()
    assert "unit-test fixture" in status
    assert "üretime hazır" in status


def test_uv_coupon_contains_five_declared_levels_and_valid_geometry(tmp_path: Path) -> None:
    result = coupon.generate_coupon(tmp_path / "coupon", grid_long_edge=96)
    assert result["digital_status"] == "validated"
    assert result["production_status"] == "physical_validation_required"
    assert result["levels_mm"] == [0.0, 0.6, 1.0, 1.4, 1.8]
    report = json.loads((tmp_path / "coupon/build/manufacturing-report.json").read_text())
    assert report["validation"]["watertight"] is True
    assert report["validation"]["extents_mm"] == [120.0, 35.0, 4.8]
    with Image.open(tmp_path / "coupon/build/uv-print-aligned.png") as image:
        assert image.size == (2400, 700)


def test_benchmark_rejects_mismatched_input_canvases(tmp_path: Path) -> None:
    paths = write_fixture(tmp_path / "fixture-mismatch")
    bad_front = tmp_path / "bad-front.png"
    Image.new("RGBA", (32, 32), (0, 0, 0, 0)).save(bad_front)
    try:
        benchmark.run_benchmark(
            relief_map=paths["relief"],
            mask=paths["mask"],
            output_dir=tmp_path / "mismatch-out",
            depths=(0.6,),
            grid_long_edge=32,
            artwork_long_edge_px=256,
            front_master=bad_front,
        )
    except ValueError as exc:
        assert "canvases do not match" in str(exc)
    else:
        raise AssertionError("Expected mismatched benchmark canvases to be rejected")


def test_benchmark_refuses_non_empty_output_directory(tmp_path: Path) -> None:
    paths = write_fixture(tmp_path / "fixture-stale")
    out = tmp_path / "benchmark-stale"
    out.mkdir()
    (out / "stale.txt").write_text("old")
    try:
        benchmark.run_benchmark(
            relief_map=paths["relief"],
            mask=paths["mask"],
            output_dir=out,
            depths=(0.6,),
            grid_long_edge=32,
            artwork_long_edge_px=256,
        )
    except ValueError as exc:
        assert "not empty" in str(exc)
    else:
        raise AssertionError("Expected non-empty benchmark output to be rejected")


def test_coupon_refuses_non_empty_output_directory(tmp_path: Path) -> None:
    out = tmp_path / "coupon-stale"
    out.mkdir()
    (out / "stale.txt").write_text("old")
    try:
        coupon.generate_coupon(out, grid_long_edge=64)
    except ValueError as exc:
        assert "not empty" in str(exc)
    else:
        raise AssertionError("Expected non-empty coupon output to be rejected")
