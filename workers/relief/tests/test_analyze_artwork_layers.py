from __future__ import annotations

import hashlib
import json
import struct
import zlib
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import analyze_artwork_layers as artwork_module
from analyze_artwork_layers import analyze_artwork_layers


def _save_mask(path: Path, values: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((values.astype(np.uint8) * 255), mode="L").save(path)


def _save_rgba(path: Path, alpha: np.ndarray, *, icc: bytes | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rgba = np.zeros((*alpha.shape, 4), dtype=np.uint8)
    rgba[..., 0] = 180
    rgba[..., 1] = 90
    rgba[..., 2] = 40
    rgba[..., 3] = alpha.astype(np.uint8) * 255
    image = Image.fromarray(rgba, mode="RGBA")
    save_kwargs = {"icc_profile": icc} if icc is not None else {}
    image.save(path, **save_kwargs)


def _write_header_only_png(path: Path, width: int, height: int) -> None:
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    def chunk(name: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + name
            + payload
            + struct.pack(">I", zlib.crc32(name + payload) & 0xFFFFFFFF)
        )
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IEND", b"")
    )


def _fixture(tmp_path: Path, *, width: int = 8, height: int = 4) -> dict[str, Path]:
    silhouette = np.zeros((height, width), dtype=bool)
    silhouette[:, 2:6] = True
    silhouette_path = tmp_path / "silhouette.png"
    _save_mask(silhouette_path, silhouette)
    white_path = tmp_path / "white.png"
    varnish_path = tmp_path / "varnish.png"
    _save_mask(white_path, silhouette)
    _save_mask(varnish_path, silhouette)
    uv_path = tmp_path / "uv.png"
    _save_rgba(uv_path, silhouette)
    return {
        "silhouette": silhouette_path,
        "white": white_path,
        "varnish": varnish_path,
        "uv": uv_path,
    }


def _analyze(paths: dict[str, Path], *, width_mm: float = 8.0, height_mm: float = 4.0) -> dict:
    return analyze_artwork_layers(
        paths["silhouette"],
        paths.get("uv"),
        paths.get("white"),
        paths.get("varnish"),
        width_mm=width_mm,
        height_mm=height_mm,
    )


def test_contained_layers_pass_and_report_anisotropic_pitch(tmp_path: Path) -> None:
    report = _analyze(_fixture(tmp_path))

    json.dumps(report, sort_keys=True)
    assert report["pixel_pitch_mm"] == [1.0, 1.0]
    assert report["layer_coverage_status"] == "pass"
    assert report["artwork_semantic_registration_status"] == "not_validated"
    for name in ("uv_artwork", "white_mask", "varnish_mask"):
        layer = report["layers"][name]
        assert layer["outside_silhouette_pixels"] == 0
        assert layer["outside_silhouette_area_mm2"] == 0.0
        assert layer["max_nearest_silhouette_distance_mm"] == 0.0
        assert layer["status"] == "pass"

    report = _analyze(_fixture(tmp_path / "anisotropic"), width_mm=16.0, height_mm=4.0)
    assert report["pixel_pitch_mm"] == [2.0, 1.0]
    assert report["pixel_area_mm2"] == 2.0


def test_outside_alpha_and_mask_coverage_reports_pixels_area_and_distance(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    alpha = np.zeros((4, 8), dtype=bool)
    alpha[:, 1] = True
    _save_rgba(paths["uv"], alpha)
    mask = np.zeros((4, 8), dtype=bool)
    mask[:, 0] = True
    _save_mask(paths["white"], mask)

    report = _analyze(paths)
    assert report["layer_coverage_status"] == "fail"
    assert report["layers"]["uv_artwork"]["outside_silhouette_pixels"] == 4
    assert report["layers"]["uv_artwork"]["outside_silhouette_area_mm2"] == 4.0
    assert report["layers"]["uv_artwork"]["max_nearest_silhouette_distance_mm"] == 1.0
    assert report["layers"]["white_mask"]["outside_silhouette_pixels"] == 4


def test_opaque_rgb_cannot_infer_coverage(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    Image.new("RGB", (8, 4), (20, 30, 40)).save(paths["uv"])

    report = _analyze(paths)
    layer = report["layers"]["uv_artwork"]
    assert layer["status"] == "not_evaluable"
    assert layer["reason"] == "cannot_infer_from_opaque_colour"
    assert layer["warnings"] == ["cannot_infer_from_opaque_colour"]
    assert report["artwork_semantic_registration_status"] == "not_validated"


def test_empty_masks_are_not_evaluable_and_absent_layers_are_explicit(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    _save_mask(paths["white"], np.zeros((4, 8), dtype=bool))
    paths.pop("varnish")

    report = _analyze(paths)
    assert report["layers"]["white_mask"]["status"] == "not_evaluable"
    assert report["layers"]["white_mask"]["warnings"] == ["empty_coverage"]
    assert report["layers"]["varnish_mask"]["reason"] == "not_supplied"
    assert report["layer_coverage_status"] == "not_evaluable"


def test_wrong_canvas_and_non_finite_dimensions_are_rejected(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    Image.new("L", (7, 4), 255).save(paths["white"])
    with pytest.raises(ValueError, match="canvas mismatch"):
        _analyze(paths)

    paths = _fixture(tmp_path / "finite")
    with pytest.raises(ValueError, match="width_mm must be finite"):
        _analyze(paths, width_mm=float("nan"))
    with pytest.raises(ValueError, match="height_mm must be finite"):
        _analyze(paths, height_mm=float("inf"))


def test_finite_but_overflowing_physical_metrics_are_rejected(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    with pytest.raises(ValueError, match="JSON-safe numeric limits"):
        _analyze(paths, width_mm=1e308, height_mm=1e308)
    with pytest.raises(ValueError, match="JSON-safe numeric limits"):
        _analyze(paths, width_mm=1e308, height_mm=1.0)


def test_rgb_or_alpha_masks_are_rejected(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    for mode in ("RGB", "RGBA"):
        channels = 3 if mode == "RGB" else 4
        fill = (255,) * channels
        Image.new(mode, (8, 4), fill).save(paths["white"])
        with pytest.raises(ValueError, match="RGB/alpha mask ambiguity"):
            _analyze(paths)


def test_unsigned_16_bit_masks_are_accepted_and_canvas_limit_is_fail_closed(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    paths = _fixture(tmp_path)
    values = np.zeros((4, 8), dtype=np.uint16)
    values[:, 2:6] = 65535
    Image.fromarray(values).save(paths["white"])
    report = _analyze(paths)
    assert report["layers"]["white_mask"]["status"] == "pass"
    assert report["layers"]["white_mask"]["metadata"]["image_mode"] == "I;16"

    monkeypatch.setattr(artwork_module, "MAX_CANVAS_PIXELS", 1)
    with pytest.raises(ValueError, match="safe resource limit"):
        _analyze(paths)
    monkeypatch.undo()

    tiff_path = tmp_path / "white.tiff"
    Image.fromarray(values).save(tiff_path, format="TIFF")
    paths["white"] = tiff_path
    with pytest.raises(ValueError, match="must be PNG IHDR 16-bit grayscale"):
        _analyze(paths)


def test_oversized_header_is_rejected_before_decode(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    silhouette = tmp_path / "oversized-header.png"
    _write_header_only_png(silhouette, 7_000, 7_000)

    def fail_if_decoded(self: Image.Image, *args, **kwargs):
        raise AssertionError("oversized header must be rejected before image.load")

    monkeypatch.setattr(Image.Image, "load", fail_if_decoded)
    with pytest.raises(ValueError, match="safe resource limit"):
        analyze_artwork_layers(
            silhouette,
            None,
            None,
            None,
            width_mm=10.0,
            height_mm=10.0,
        )


def test_transparency_metadata_is_rejected_for_masks_and_rgb_uv(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    Image.new("L", (8, 4), 255).save(paths["white"], transparency=0)
    with pytest.raises(ValueError, match="colour-key transparency"):
        _analyze(paths)

    paths = _fixture(tmp_path / "rgb")
    Image.new("RGB", (8, 4), (255, 0, 0)).save(
        paths["uv"], transparency=(255, 0, 0)
    )
    with pytest.raises(ValueError, match="colour-key transparency"):
        _analyze(paths)


def test_input_bytes_and_icc_metadata_are_unchanged(tmp_path: Path) -> None:
    paths = _fixture(tmp_path)
    icc = b"synthetic-icc-profile"
    _save_rgba(paths["uv"], np.ones((4, 8), dtype=bool), icc=icc)
    before = {name: path.read_bytes() for name, path in paths.items()}
    report = _analyze(paths)
    after = {name: path.read_bytes() for name, path in paths.items()}

    assert before == after
    metadata = report["layers"]["uv_artwork"]["metadata"]
    assert metadata["embedded_icc"] is True
    assert metadata["embedded_icc_sha256"] == hashlib.sha256(icc).hexdigest()
    assert metadata["colour_conversion_applied"] is False
    assert metadata["alpha"]["present"] is True
    assert metadata["alpha"]["premultiplication_verified"] is False
