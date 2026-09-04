from __future__ import annotations

import os
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

import run_phase0 as phase0_module
from run_phase0 import run_phase0


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
        "varnish": directory / "varnish.png",
        "text_vector": directory / "text-vector.svg",
    }
    Image.fromarray(rgba, mode="RGBA").save(paths["front"])
    Image.fromarray(np.round(relief * 65535).astype(np.uint16), mode="I;16").save(paths["relief"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["mask"])
    Image.fromarray(rgba, mode="RGBA").save(paths["uv"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["white"])
    Image.fromarray((mask * 255).astype(np.uint8), mode="L").save(paths["varnish"])
    paths["text_vector"].write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
        '<rect x="32" y="88" width="64" height="8"/></svg>\n',
        encoding="utf-8",
    )
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


def test_phase0_rejects_linked_ownership_marker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unsafe = tmp_path / "existing"
    unsafe.mkdir()
    keep = unsafe / "keep.txt"
    keep.write_text("do not delete", encoding="utf-8")
    marker = unsafe / phase0_module.PHASE0_MARKER
    marker.write_text(
        phase0_module.PHASE0_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    original_is_symlink = Path.is_symlink
    monkeypatch.setattr(
        Path,
        "is_symlink",
        lambda path: path == marker or original_is_symlink(path),
    )

    with pytest.raises(FileExistsError, match="refusing to replace unowned"):
        phase0_module._prepare_root(unsafe)

    assert keep.read_text(encoding="utf-8") == "do not delete"


def test_phase0_rejects_input_inside_reused_output(tmp_path: Path) -> None:
    output = tmp_path / "existing"
    output.mkdir()
    marker = output / phase0_module.PHASE0_MARKER
    marker.write_text(
        phase0_module.PHASE0_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    source = output / "relief.png"
    source.write_bytes(b"preserve source")

    with pytest.raises(ValueError, match="input cannot be inside"):
        phase0_module._prepare_root(output, (source,))

    assert source.read_bytes() == b"preserve source"


def test_phase0_rejects_junction_output_without_touching_target(
    tmp_path: Path,
) -> None:
    target = tmp_path / "target"
    target.mkdir()
    sentinel = target / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (target / phase0_module.PHASE0_MARKER).write_text(
        phase0_module.PHASE0_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_output = tmp_path / "linked-output"
    _create_directory_link(linked_output, target)

    try:
        with pytest.raises(ValueError, match="linked Phase 0 output"):
            phase0_module._prepare_root(linked_output)
    finally:
        _remove_directory_link(linked_output)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


def test_phase0_rejects_ancestor_junction_without_touching_target(
    tmp_path: Path,
) -> None:
    target_parent = tmp_path / "target-parent"
    owned_output = target_parent / "phase0"
    owned_output.mkdir(parents=True)
    sentinel = owned_output / "keep.txt"
    sentinel.write_text("do not delete", encoding="utf-8")
    (owned_output / phase0_module.PHASE0_MARKER).write_text(
        phase0_module.PHASE0_MARKER_CONTENT,
        encoding="utf-8",
        newline="\n",
    )
    linked_parent = tmp_path / "linked-parent"
    _create_directory_link(linked_parent, target_parent)

    try:
        with pytest.raises(ValueError, match="linked Phase 0 output"):
            phase0_module._prepare_root(linked_parent / "phase0")
    finally:
        _remove_directory_link(linked_parent)

    assert sentinel.read_text(encoding="utf-8") == "do not delete"


def test_phase0_candidate_build_never_grants_production_approval(tmp_path: Path) -> None:
    paths = _fixture(tmp_path / "fixture")
    output = tmp_path / "out"
    summary = run_phase0(
        front_master=paths["front"],
        relief_map=paths["relief"],
        mask=paths["mask"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        output_dir=output,
        minimum_long_edge_px=128,
        depths_mm=[0.6, 1.0],
        grid_long_edge=64,
        allow_review_input=True,
    )

    assert summary["candidate_only"] is True
    assert summary["digital_status"] == "needs_review"
    assert summary["digital_geometry_gate"] == "pass"
    assert "low_grid_resolution" in summary["digital_warnings"]
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
        varnish_mask=paths["varnish"],
        output_dir=tmp_path / "out",
        minimum_long_edge_px=128,
        depths_mm=[1.0],
        grid_long_edge=96,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert summary["front_master_decision"] == "pass_with_warnings"
    assert summary["digital_status"] == "needs_review"
    assert summary["digital_geometry_gate"] == "pass"
    assert summary["digital_warnings"] == [
        "front_master:text_or_logo_vector_not_supplied"
    ]
    assert summary["variants"][0]["digital_status"] == "validated"
    assert summary["variants"][0]["digital_warnings"] == []
    assert summary["variants"][0]["physical_validation_status"] == "pending"
    assert (
        summary["variants"][0]["production_status"]
        == "not_approved_pending_physical_validation"
    )
    assert summary["physical_validation_status"] == "pending"
    assert summary["production_status"] == "not_approved_pending_physical_validation"


def test_phase0_clean_digital_gate_still_requires_physical_evidence(
    tmp_path: Path,
) -> None:
    paths = _fixture(tmp_path / "fixture")
    summary = run_phase0(
        front_master=paths["front"],
        relief_map=paths["relief"],
        mask=paths["mask"],
        text_vector=paths["text_vector"],
        uv_artwork=paths["uv"],
        white_mask=paths["white"],
        varnish_mask=paths["varnish"],
        output_dir=tmp_path / "out",
        minimum_long_edge_px=128,
        depths_mm=[1.0],
        grid_long_edge=96,
        declared_orthographic=True,
        declared_no_cast_shadow=True,
    )

    assert summary["front_master_decision"] == "pass_contract_checks"
    assert summary["candidate_only"] is False
    assert summary["digital_status"] == "validated"
    assert summary["digital_geometry_gate"] == "pass"
    assert summary["digital_warnings"] == []
    assert summary["variants"][0]["digital_status"] == "validated"
    assert summary["physical_validation_status"] == "pending"
    assert summary["production_status"] == "not_approved_pending_physical_validation"


def test_phase0_fails_closed_when_product_geometry_gate_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    paths = _fixture(tmp_path / "fixture")
    monkeypatch.setattr(
        phase0_module,
        "validate_front_master",
        lambda *args, **kwargs: {"decision": "pass"},
    )
    monkeypatch.setattr(
        phase0_module,
        "build_relief_pro_package",
        lambda **kwargs: {
            "digital_geometry_status": "failed",
            "product_validation": {
                "digital_status": "needs_review",
                "digital_geometry_gate": "fail",
                "failures": ["mesh_not_watertight"],
                "warnings": [],
            },
            "artwork_file_set_status": "incomplete",
            "artwork_semantic_registration_status": "not_validated",
            "physical_validation_status": "pending",
            "production_status": "not_approved_pending_physical_validation",
            "package_receipt": {
                "physical_validation_status": "pending",
                "production_status": "not_approved_pending_physical_validation",
            },
        },
    )

    summary = run_phase0(
        front_master=paths["front"],
        relief_map=paths["relief"],
        mask=paths["mask"],
        output_dir=tmp_path / "out",
        depths_mm=[1.0],
    )

    assert summary["digital_status"] == "needs_review"
    assert summary["digital_geometry_gate"] == "fail"
    assert summary["digital_failures"] == ["mesh_not_watertight"]
    assert summary["physical_validation_status"] == "pending"
    assert summary["production_status"] == "not_approved_pending_physical_validation"


def test_phase0_cli_returns_nonzero_for_needs_review(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        phase0_module,
        "run_phase0",
        lambda **kwargs: {
            "digital_status": "needs_review",
            "digital_geometry_gate": "pass",
        },
    )

    assert phase0_module.main(
        [
            "--front-master",
            str(tmp_path / "front.png"),
            "--relief-map",
            str(tmp_path / "relief.png"),
            "--mask",
            str(tmp_path / "mask.png"),
            "--output",
            str(tmp_path / "out"),
        ]
    ) == 1
