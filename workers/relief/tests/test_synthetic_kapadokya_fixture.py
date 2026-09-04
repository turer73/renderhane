from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import numpy as np
import pytest

MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "benchmarks"
    / "relief"
    / "generate_synthetic_kapadokya.py"
)
SPEC = importlib.util.spec_from_file_location("synthetic_kapadokya_fixture", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
FIXTURE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(FIXTURE)


def test_block_glyph_raster_and_svg_share_exact_rectangles() -> None:
    rectangles = FIXTURE.block_text_rectangles(FIXTURE.TEXT_LABEL)
    mask = np.asarray(FIXTURE.block_text_mask(), dtype=np.uint8)
    svg = FIXTURE.block_text_svg()

    assert rectangles
    assert "<text" not in svg
    assert "font-family" not in svg
    assert svg.count("<rect ") == len(rectangles)
    assert int(np.count_nonzero(mask)) == len(rectangles) * FIXTURE.TEXT_CELL_PX**2
    assert hashlib.sha256(mask.tobytes()).hexdigest() == (
        "d0a7c989a6fb22006ee4834d0d6a43277012dc9fbe1633c2a49c612970e364d1"
    )


def test_block_glyph_renderer_rejects_implicit_font_fallback() -> None:
    with pytest.raises(ValueError, match="unsupported deterministic glyph"):
        FIXTURE.block_text_rectangles("KAPADOKYA?")
