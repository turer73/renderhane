from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import build_package as build_package_module
from build_package import LEGACY_MARKER_CONTENT, LEGACY_MARKER_NAME, build_package
from generate_synthetic_benchmark import generate
from relief_builder import BuildRecipe


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_directory_link(link: Path, target: Path) -> None:
    if os.name == "nt":
        created = subprocess.run(
            ["cmd.exe", "/d", "/c", "mklink", "/J", str(link), str(target)],
            check=False,
            capture_output=True,
            text=True,
        )
        assert created.returncode == 0, created.stderr or created.stdout
    else:
        link.symlink_to(target, target_is_directory=True)


def _remove_directory_link(link: Path) -> None:
    if os.name == "nt":
        link.rmdir()
    else:
        link.unlink()


def _write_rgba(path: Path, size: tuple[int, int]) -> None:
    width, height = size
    yy, xx = np.mgrid[0:height, 0:width]
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[..., 0] = np.round(xx / max(width - 1, 1) * 255).astype(np.uint8)
    rgba[..., 1] = np.round(yy / max(height - 1, 1) * 255).astype(np.uint8)
    rgba[..., 2] = 128
    rgba[..., 3] = 255
    Image.fromarray(rgba, mode="RGBA").save(path)


def test_build_package_generates_geometry_uv_and_pending_physical_status(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    uv = fixture / "uv.png"
    _write_rgba(uv, (96, 72))
    white = fixture / "white.png"
    varnish = fixture / "varnish.png"
    Image.open(fixture / "silhouette-mask.png").save(white)
    Image.open(fixture / "silhouette-mask.png").save(varnish)

    first = tmp_path / "first"
    second = tmp_path / "second"
    recipe = BuildRecipe(
        width_mm=70.0,
        base_thickness_mm=3.0,
        relief_depth_mm=1.2,
        grid_long_edge=64,
    )

    manifest_a = build_package(
        relief_map=fixture / "relief-map-16.png",
        mask=fixture / "silhouette-mask.png",
        uv_artwork=uv,
        white_mask=white,
        varnish_mask=varnish,
        output_dir=first,
        recipe=recipe,
        title="Fixture Relief",
    )
    _manifest_b = build_package(
        relief_map=fixture / "relief-map-16.png",
        mask=fixture / "silhouette-mask.png",
        uv_artwork=uv,
        white_mask=white,
        varnish_mask=varnish,
        output_dir=second,
        recipe=recipe,
        title="Fixture Relief",
    )

    assert manifest_a["digital_geometry_status"] == "ready"
    assert manifest_a["uv_artwork_status"] == "complete"
    assert manifest_a["physical_validation_status"] == "pending"
    assert manifest_a["production_status"] == "pending_physical_validation"

    for relative in (
        "geometry/model.glb",
        "geometry/model.stl",
        "geometry/model.3mf",
        "artwork/uv-artwork-srgb.png",
        "artwork/white-mask.png",
        "artwork/varnish-mask.png",
        "reports/geometry-report.json",
        "reports/3mf-report.json",
        "manifest.json",
        "production-package.zip",
    ):
        assert (first / relative).is_file(), relative

    assert _sha256(first / "production-package.zip") == _sha256(second / "production-package.zip")
    persisted = json.loads((first / "manifest.json").read_text(encoding="utf-8"))
    assert persisted["package"]["sha256"] == _sha256(first / "production-package.zip")


def test_build_package_rejects_misaligned_uv_canvas(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    wrong = fixture / "wrong.png"
    _write_rgba(wrong, (95, 72))

    with pytest.raises(ValueError, match="Shared-canvas validation failed"):
        build_package(
            relief_map=fixture / "relief-map-16.png",
            mask=fixture / "silhouette-mask.png",
            uv_artwork=wrong,
            output_dir=tmp_path / "out",
            recipe=BuildRecipe(width_mm=70.0, relief_depth_mm=1.0, grid_long_edge=64),
        )


def test_deprecated_package_refuses_unowned_output_directory(tmp_path: Path) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    output = tmp_path / "existing"
    output.mkdir()
    keep = output / "keep.txt"
    keep.write_text("do not delete", encoding="utf-8")

    with pytest.raises(FileExistsError, match="not an existing Renderhane package"):
        build_package(
            relief_map=fixture / "relief-map-16.png",
            output_dir=output,
            recipe=BuildRecipe(
                width_mm=70.0,
                relief_depth_mm=1.0,
                grid_long_edge=64,
            ),
        )

    assert keep.read_text(encoding="utf-8") == "do not delete"


def test_deprecated_package_rejects_linked_ownership_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    output = tmp_path / "existing"
    output.mkdir()
    keep = output / "keep.txt"
    keep.write_text("do not delete", encoding="utf-8")
    marker = output / LEGACY_MARKER_NAME
    marker.write_text(LEGACY_MARKER_CONTENT, encoding="utf-8", newline="\n")
    original_is_symlink = Path.is_symlink
    monkeypatch.setattr(
        Path,
        "is_symlink",
        lambda path: path == marker or original_is_symlink(path),
    )

    with pytest.raises(FileExistsError, match="not an existing Renderhane package"):
        build_package(
            relief_map=fixture / "relief-map-16.png",
            output_dir=output,
            recipe=BuildRecipe(
                width_mm=70.0,
                relief_depth_mm=1.0,
                grid_long_edge=64,
            ),
        )

    assert keep.read_text(encoding="utf-8") == "do not delete"


def test_deprecated_package_rejects_junction_output_without_touching_target(
    tmp_path: Path,
) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    target = tmp_path / "target"
    target.mkdir()
    sentinel = target / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (target / LEGACY_MARKER_NAME).write_text(
        LEGACY_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_output = tmp_path / "linked-output"
    _create_directory_link(linked_output, target)

    try:
        with pytest.raises(ValueError, match="linked output directory"):
            build_package(
                relief_map=fixture / "relief-map-16.png",
                output_dir=linked_output,
                recipe=BuildRecipe(
                    width_mm=70.0,
                    relief_depth_mm=1.0,
                    grid_long_edge=64,
                ),
            )
    finally:
        _remove_directory_link(linked_output)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


def test_deprecated_package_rejects_ancestor_junction_without_touching_target(
    tmp_path: Path,
) -> None:
    fixture = tmp_path / "fixture"
    generate(fixture, width=96, height=72)
    target_parent = tmp_path / "target-parent"
    owned_output = target_parent / "package"
    owned_output.mkdir(parents=True)
    sentinel = owned_output / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (owned_output / LEGACY_MARKER_NAME).write_text(
        LEGACY_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_parent = tmp_path / "linked-parent"
    _create_directory_link(linked_parent, target_parent)

    try:
        with pytest.raises(ValueError, match="linked output directory"):
            build_package(
                relief_map=fixture / "relief-map-16.png",
                output_dir=linked_parent / "package",
                recipe=BuildRecipe(
                    width_mm=70.0,
                    relief_depth_mm=1.0,
                    grid_long_edge=64,
                ),
            )
    finally:
        _remove_directory_link(linked_parent)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


@pytest.mark.parametrize(
    ("extra_args", "expected_mode"),
    [
        ([], "robust"),
        (["--normalization-mode", "absolute"], "absolute"),
    ],
)
def test_deprecated_package_cli_exposes_explicit_normalization_compatibility(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    extra_args: list[str],
    expected_mode: str,
) -> None:
    captured: dict[str, BuildRecipe] = {}

    def fake_build_package(**kwargs):
        captured["recipe"] = kwargs["recipe"]
        return {
            "digital_geometry_status": "ready",
            "uv_artwork_status": "incomplete",
            "physical_validation_status": "pending",
            "package": {"path": "production-package.zip"},
        }

    monkeypatch.setattr(build_package_module, "build_package", fake_build_package)
    result = build_package_module.main(
        [
            "--relief-map",
            str(tmp_path / "relief.png"),
            "--output",
            str(tmp_path / "output"),
            *extra_args,
        ]
    )

    assert result == 0
    assert captured["recipe"].normalization_mode == expected_mode
