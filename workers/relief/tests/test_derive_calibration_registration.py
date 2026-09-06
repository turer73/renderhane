from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from derive_calibration_registration import (
    DEPTH_CODES,
    REGION_COLOURS,
    derive_calibration_registration,
)
from PIL import Image


def _fixture(tmp_path: Path) -> dict[str, Path]:
    artwork_labels = np.ones((50, 100), dtype=np.uint16)
    artwork_labels[12:36, 12:36] = 2
    artwork_labels[10:40, 62:78] = 3
    geometry_labels = np.asarray(
        Image.fromarray(artwork_labels).resize((200, 100), Image.Resampling.NEAREST)
    )
    depth = DEPTH_CODES[geometry_labels - 1].astype(np.uint16)
    silhouette = np.full(depth.shape, 255, dtype=np.uint8)
    rgba = np.zeros((50, 100, 4), dtype=np.uint8)
    for region_id, colour in enumerate(REGION_COLOURS, start=1):
        rgba[artwork_labels == region_id, :3] = colour
    rgba[:, :, 3] = 255

    paths = {
        "depth": tmp_path / "depth.png",
        "silhouette": tmp_path / "silhouette.png",
        "artwork": tmp_path / "artwork.png",
        "registration": tmp_path / "registration.json",
    }
    Image.fromarray(depth).save(paths["depth"])
    Image.fromarray(silhouette).save(paths["silhouette"])
    Image.fromarray(rgba, mode="RGBA").save(paths["artwork"])
    paths["registration"].write_text(
        json.dumps(
            {
                "schema_version": 2,
                "verification_canvas_px": [200, 100],
                "artwork_canvas_px": [100, 50],
                "physical_canvas_mm": [20.0, 10.0],
                "verification_pixel_pitch_mm": [0.1, 0.1],
            }
        ),
        encoding="utf-8",
    )
    return paths


def test_derives_independent_final_glb_and_artwork_semantics(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    report = derive_calibration_registration(
        final_depth_path=paths["depth"],
        final_silhouette_path=paths["silhouette"],
        aligned_artwork_path=paths["artwork"],
        registration_path=paths["registration"],
        output_dir=tmp_path / "evidence",
    )

    assert report["decision"] == "pass"
    assert report["artwork_semantic_registration_status"] == "validated"
    assert (
        report["evidence_source"]
        == "independently_derived_final_geometry_and_artwork_label_rasters"
    )
    assert report["source_bindings"]["binding_scope"] == "independent_derived_artifacts"
    assert report["semantic_mismatch_pixels"] == 0
    assert report["derivation"]["registration_fitting"] == "none"
    assert (tmp_path / "evidence/independent-semantic-overlay.png").is_file()


def test_rejects_artwork_colour_outside_calibration_contract(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    with Image.open(paths["artwork"]) as image:
        rgba = np.asarray(image).copy()
    rgba[0, 0, :3] = [1, 2, 3]
    Image.fromarray(rgba, mode="RGBA").save(paths["artwork"])

    with pytest.raises(ValueError, match="outside calibration contract"):
        derive_calibration_registration(
            final_depth_path=paths["depth"],
            final_silhouette_path=paths["silhouette"],
            aligned_artwork_path=paths["artwork"],
            registration_path=paths["registration"],
            output_dir=tmp_path / "evidence-bad",
        )
