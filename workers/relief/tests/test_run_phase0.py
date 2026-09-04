from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from run_phase0 import run_phase0


def _fixture(directory: Path, size: int = 128) -> dict[str, Path]:
    directory.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:size, 0:size]
    centre = (size - 1) / 2.0
    radius = size * 0.38
    mask = (x - centre) ** 2 + (y - centre) ** 2 <= radius**2
    relief = np.clip(1.0 - np.sqrt((x-centre)**2 + (y-centre)**2) / radius, 0.0, 1.0)
    relief[~mask] = 0.0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = 80
    rgba[..., 1] = 150
    rgba[..., 2] = 210
    rgba[..., 3] = (mask * 255).astype(np.uint8)

    paths = {
        "front": directory / "front.png",
        "relief": directory / "relief.png",
        "mask": directory / "mask.png",
        "uv": directory / "uv.png",
        "white": directory / "white.png",
    }
    Image.fromarray(rgba, mode="RGBA").save(paths["front"])
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(paths["relief"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["mask"])
    Image.fromarray(rgba, mode="RGBA").save(paths["uv"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["white"])
    return paths


def test_phase0_refuses_unreviewed_front_master_by_default(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture")
    with pytest.raises(ValueError, match="requires human review"):
        run_phase0(
            front_master=paths["front"],
            relief_map=paths["relief"],
            mask=paths["mask"],
            uv_artwork=paths["uv"],
            white_mask=paths["white"],
            output_dir=tmp_path / "out",
            minimum_long_edge_px=128,
            depths_mm=[1.0],
            grid_long_edge=64,
        )


def test_phase0_candidate_build_never_grants_production_approval(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture")
    output = tmp_path / "out"
    summary = run_phase0(
        front_master=paths["front"],
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        output_dir=output,
        minimum_long_edge_px=128,
        depths_mm=[0.6, 1.0],
        grid_long_edge=64,
        allow_review_input=True,
    )

    assert summary["candidate_only"] is True
    assert summary["physical_validation_status"] == "pending"
    assert summary["production_status"] == "not_approved_pending_physical_validation"
    assert len(summary["variants"]) == 2
    assert (output / "phase0-summary.json").is_file()


def test_phase0_with_human_declarations_still_requires_physical_evidence(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture")
    summary = run_phase0(
        front_master=paths["front"],
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        output_dir=tmp_path / "out",
        minimum_long_edge_px=128,
        depths_mm=[1.0],
        grid_long_edge=64,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert summary["front_master_decision"] == "pass_with_warnings"
    assert summary["digital_geometry_gate"] in {"pass", "fail"}
    assert summary["physical_validation_status"] == "pending"
    assert summary["production_status"] == "not_approved_pending_physical_validation"
