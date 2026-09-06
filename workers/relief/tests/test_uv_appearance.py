from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from build_uv_appearance import main as uv_appearance_main
from relief_engine.uv_appearance import DEFAULT_SPEC, build_uv_appearance, normalize_spec


def _inputs(
    tmp_path: Path,
    *,
    height: np.ndarray | None = None,
    mask: np.ndarray | None = None,
) -> tuple[Path, Path, Path]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    height = np.tile(np.linspace(0, 65535, 64, dtype=np.uint16), (48, 1)) if height is None else height
    mask = np.full(height.shape, 255, dtype=np.uint8) if mask is None else mask
    relief, artwork, silhouette = tmp_path / "relief.png", tmp_path / "artwork.png", tmp_path / "silhouette.png"
    Image.fromarray(height).save(relief)
    rgb = np.zeros((*height.shape, 3), dtype=np.uint8)
    rgb[..., 0], rgb[..., 1], rgb[..., 2] = 150, 90, 40
    Image.fromarray(rgb, mode="RGB").save(artwork)
    Image.fromarray(mask, mode="L").save(silhouette)
    return relief, artwork, silhouette


def _build(relief: Path, artwork: Path, silhouette: Path, out_dir: Path, **kwargs: float) -> dict:
    return build_uv_appearance(
        relief,
        artwork,
        silhouette,
        out_dir,
        physical_width_mm=kwargs.get("physical_width_mm", 64),
        physical_height_mm=kwargs.get("physical_height_mm", 24),
        relief_depth_mm=kwargs.get("relief_depth_mm", 2),
    )


def test_outputs_are_same_canvas_deterministic_and_not_physical_claims(tmp_path: Path) -> None:
    relief, artwork, silhouette = _inputs(tmp_path)
    first = _build(relief, artwork, silhouette, tmp_path / "one")
    second = _build(relief, artwork, silhouette, tmp_path / "two")
    assert first == second
    assert first["appearance_status"] == "not_calibrated" and first["physical_z_mm"] is None
    assert first["artwork_up_axis"] == "-y" and "recompile_after_rotation" in first["orientation_contract"]
    assert first["surface_height_range_mm"] == 2
    assert first["out_of_mask_changed_pixels"] == 0
    assert set(first["slope_diagnostic_mm_per_mm"]) == {"p95", "max"}
    assert first["printer_profile_max_surface_variation_mm"] is None
    assert first["uneven_surface_validation_status"] == "not_validated"
    for name, mode in (("uv-artwork-depth-enhanced.png", "RGB"), ("shading-map-16.png", "I;16"), ("appearance-normal.png", "RGB"), ("appearance-varnish-mask.png", "L")):
        with Image.open(tmp_path / "one" / name) as image:
            assert image.size == (64, 48) and image.mode == mode
        assert hashlib.sha256((tmp_path / "one" / name).read_bytes()).hexdigest() == hashlib.sha256((tmp_path / "two" / name).read_bytes()).hexdigest()
    assert json.loads((tmp_path / "one" / "uv-appearance-job-ticket.json").read_text()) == first


def test_flat_all_active_map_is_pixel_identical_and_signed_neutral(tmp_path: Path) -> None:
    height = np.full((16, 16), 32768, dtype=np.uint16)
    relief, artwork, silhouette = _inputs(tmp_path, height=height)
    ticket = _build(relief, artwork, silhouette, tmp_path / "flat")
    with Image.open(artwork) as source, Image.open(tmp_path / "flat" / "uv-artwork-depth-enhanced.png") as output:
        assert np.array_equal(np.asarray(source), np.asarray(output))
    with Image.open(tmp_path / "flat" / "shading-map-16.png") as shading:
        assert np.all(np.asarray(shading) == 32768)
    assert ticket["surface_height_range_mm"] == 0


def test_shaped_mask_preserves_exterior_and_uses_neutral_diagnostics_outside(tmp_path: Path) -> None:
    height = np.zeros((32, 32), dtype=np.uint16)
    height[8:24, 8:24] = np.tile(np.linspace(5000, 60000, 16, dtype=np.uint16), (16, 1))
    mask = np.zeros((32, 32), dtype=np.uint8)
    mask[8:24, 8:24] = 255
    relief, artwork, silhouette = _inputs(tmp_path, height=height, mask=mask)
    ticket = _build(relief, artwork, silhouette, tmp_path / "masked")
    with Image.open(artwork) as source, Image.open(tmp_path / "masked" / "uv-artwork-depth-enhanced.png") as output:
        assert np.array_equal(np.asarray(source)[mask == 0], np.asarray(output)[mask == 0])
    with Image.open(tmp_path / "masked" / "shading-map-16.png") as shading:
        assert np.all(np.asarray(shading)[mask == 0] == 32768)
    assert ticket["out_of_mask_changed_pixels"] == 0


def test_valid_rgba_requires_matching_silhouette_and_preserves_alpha(tmp_path: Path) -> None:
    height = np.zeros((20, 20), dtype=np.uint16)
    height[4:16, 4:16] = np.tile(np.linspace(5000, 60000, 12, dtype=np.uint16), (12, 1))
    mask = np.zeros((20, 20), dtype=np.uint8)
    mask[4:16, 4:16] = 255
    relief, artwork, silhouette = _inputs(tmp_path, height=height, mask=mask)
    with Image.open(artwork) as source:
        rgb = np.asarray(source)
    rgba = np.dstack((rgb, mask))
    Image.fromarray(rgba, mode="RGBA").save(artwork)
    ticket = _build(relief, artwork, silhouette, tmp_path / "rgba")
    with Image.open(tmp_path / "rgba" / "uv-artwork-depth-enhanced.png") as output:
        assert output.mode == "RGBA"
        assert np.array_equal(np.asarray(output)[:, :, 3], mask)
    assert ticket["source_artwork_mode"] == ticket["output_artwork_mode"] == "RGBA"
    assert ticket["alpha_policy"].endswith("alpha_preserved")


def test_rgba_rejects_nonbinary_or_mismatched_alpha(tmp_path: Path) -> None:
    relief, artwork, silhouette = _inputs(tmp_path)
    with Image.open(artwork) as source:
        rgb = np.asarray(source)
    alpha = np.full(rgb.shape[:2], 255, dtype=np.uint8)
    alpha[0, 0] = 127
    Image.fromarray(np.dstack((rgb, alpha)), mode="RGBA").save(artwork)
    with pytest.raises(ValueError, match="alpha must contain only"):
        _build(relief, artwork, silhouette, tmp_path / "nonbinary")
    alpha[0, 0] = 0
    Image.fromarray(np.dstack((rgb, alpha)), mode="RGBA").save(artwork)
    with pytest.raises(ValueError, match="alpha coverage must exactly match"):
        _build(relief, artwork, silhouette, tmp_path / "mismatch")


def test_anisotropic_same_mm_slope_has_equivalent_normal(tmp_path: Path) -> None:
    def normal_for(name: str, width: float, height: float) -> np.ndarray:
        cols = rows = 16
        x = np.arange(cols, dtype=np.float64) * (width / cols)
        y = np.arange(rows, dtype=np.float64) * (height / rows)
        h_mm = 2 + 0.10 * x[None, :] + 0.07 * y[:, None]
        codes = np.rint(h_mm / 10 * 65535).astype(np.uint16)
        relief, artwork, silhouette = _inputs(tmp_path / name, height=codes)
        _build(relief, artwork, silhouette, tmp_path / f"{name}-out", physical_width_mm=width, physical_height_mm=height, relief_depth_mm=10)
        with Image.open(tmp_path / f"{name}-out" / "appearance-normal.png") as normal:
            return np.asarray(normal)[8, 8]

    first = normal_for("wide-y", 16, 32)
    second = normal_for("wide-x", 32, 16)
    assert np.max(np.abs(first.astype(int) - second.astype(int))) <= 1


def test_rejects_invalid_or_mismatched_silhouette_and_unknown_spec(tmp_path: Path) -> None:
    relief, artwork, silhouette = _inputs(tmp_path)
    bad_silhouette = tmp_path / "bad-silhouette.png"
    Image.new("L", (63, 48)).save(bad_silhouette)
    with pytest.raises(ValueError, match="silhouette mask"):
        _build(relief, artwork, bad_silhouette, tmp_path / "bad-mask")
    bad_artwork = tmp_path / "bad-artwork.png"
    Image.new("RGB", (63, 48)).save(bad_artwork)
    with pytest.raises(ValueError, match="exact source canvas"):
        _build(relief, bad_artwork, silhouette, tmp_path / "bad-artwork-out")
    Image.fromarray(np.zeros((48, 64), dtype=np.uint8), mode="L").save(relief)
    with pytest.raises(ValueError, match="unsigned 16-bit"):
        _build(relief, artwork, silhouette, tmp_path / "bad-relief")
    spec = dict(DEFAULT_SPEC)
    spec["unknown"] = True
    with pytest.raises(ValueError, match="invalid contract"):
        normalize_spec(spec)


def test_rejects_unsafe_shading_and_never_overwrites(tmp_path: Path) -> None:
    relief, artwork, silhouette = _inputs(tmp_path)
    spec = json.loads(json.dumps(DEFAULT_SPEC))
    spec["shading"]["detail_radius_mm"] = 2
    with pytest.raises(ValueError, match="must not exceed"):
        normalize_spec(spec)
    _build(relief, artwork, silhouette, tmp_path / "out")
    with pytest.raises(FileExistsError, match="new and non-linked"):
        _build(relief, artwork, silhouette, tmp_path / "out")


def test_cli_writes_ticket_and_sanitizes_errors(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    relief, artwork, silhouette = _inputs(tmp_path)
    base = ["--relief-map", str(relief), "--uv-artwork", str(artwork), "--silhouette", str(silhouette), "--physical-width-mm", "64", "--physical-height-mm", "24", "--relief-depth-mm", "2"]
    assert uv_appearance_main([*base, "--out-dir", str(tmp_path / "cli")]) == 0
    assert json.loads(capsys.readouterr().out)["artwork_up_axis"] == "-y"
    assert uv_appearance_main([*base, "--relief-map", str(tmp_path / "missing.png"), "--out-dir", str(tmp_path / "bad-cli")]) == 2
    assert capsys.readouterr().err == "uv_appearance_build_failed\n"
