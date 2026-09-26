"""Bounded wire contract for the private Relief Pro test workshop."""
from __future__ import annotations

import base64
import binascii
import hashlib
import io
import math
import platform
from contextlib import contextmanager
from dataclasses import asdict
from importlib.metadata import version
from pathlib import Path

import numpy as np
from analyze_semantic_registration import (
    MAX_CANVAS_PIXELS as MAX_SEMANTIC_CANVAS_PIXELS,
)
from analyze_semantic_registration import (
    MAX_REGION_PIXEL_WORK,
    normalize_semantic_manifest,
)
from build_relief_pro_package import ENGINE_VERSION as PACKAGE_VERSION
from PIL import Image
from product_relief_builder import ProductRecipe
from workshop_store import WORKSHOP_VERSION

MAX_BODY_BYTES = 4_000_000  # Below the hosted control-plane request limit, including base64.
MAX_PIXELS = 4096 * 4096
SEMANTIC_LAYERS = ("geometry_semantic_ids", "artwork_semantic_ids")
LAYERS = (
    "relief_map",
    "mask",
    "uv_artwork",
    "white_mask",
    "varnish_mask",
    *SEMANTIC_LAYERS,
)
DEPTHS = (0.6, 1.0, 1.4, 1.8)


def toolchain() -> dict[str, str]:
    return {name: version(name) for name in ("numpy", "Pillow", "scipy", "trimesh", "manifold3d", "networkx")} | {
        "python": platform.python_version(), "platform": platform.system(),
    }


def engine_fingerprint() -> str:
    root = Path(__file__).parent
    repo = root.parents[1]
    digest = hashlib.sha256()
    for path in sorted([*root.glob("*.py"), *(root / "relief_engine").rglob("*.py"),
                       *(repo / "benchmarks/relief").glob("*-physical-measurement-template-v2.csv")]):
        digest.update(path.relative_to(repo).as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
    return digest.hexdigest()


@contextmanager
def png_input(raw: bytes):
    try:
        with Image.open(io.BytesIO(raw)) as image:
            yield image
    except (OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ValueError("invalid_png_input") from exc


def _png(array: np.ndarray) -> str:
    buffer = io.BytesIO()
    Image.fromarray(array).save(buffer, format="PNG", optimize=False)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def sample_layers() -> dict[str, str]:
    """Rights-safe calibration ONLY: identical analytic regions drive height and colour."""
    size = 512
    y, x = np.mgrid[:size, :size]
    mask = (x >= 32) & (x < 480) & (y >= 64) & (y < 448)
    circle = (x - 160) ** 2 + (y - 225) ** 2 < 68**2
    arrow = ((x > 290) & (x < 325) & (y > 165) & (y < 320)) | (
        (y >= 130) & (y <= 190) & (abs(x - 307) < y - 128))
    heights = np.where(circle, 50000, np.where(arrow, 65535, 8000)).astype(np.uint16)
    heights[~mask] = 0
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[:, :, :3] = [225, 224, 210]
    rgba[circle, :3] = [24, 140, 164]
    rgba[arrow, :3] = [224, 99, 44]
    rgba[:, :, 3] = mask.astype(np.uint8) * 255
    geometry_ids = np.where(circle, 2, np.where(arrow, 3, 1)).astype(np.uint16)
    geometry_ids[~mask] = 0
    artwork_ids = np.zeros((size, size), dtype=np.uint16)
    artwork_ids[mask] = 1
    artwork_ids[np.all(rgba[:, :, :3] == [24, 140, 164], axis=2) & mask] = 2
    artwork_ids[np.all(rgba[:, :, :3] == [224, 99, 44], axis=2) & mask] = 3
    return {"relief_map": _png(heights), "mask": _png(mask.astype(np.uint8) * 255),
            "uv_artwork": _png(rgba), "white_mask": _png(mask.astype(np.uint8) * 255),
            "varnish_mask": _png((circle & mask).astype(np.uint8) * 255),
            "geometry_semantic_ids": _png(geometry_ids),
            "artwork_semantic_ids": _png(artwork_ids)}


def sample_semantic_manifest() -> dict:
    return normalize_semantic_manifest({
        "schema_version": 1,
        "regions": [
            {"id": 1, "name": "base"},
            {"id": 2, "name": "circle"},
            {"id": 3, "name": "arrow"},
        ],
    })


def validate_submission(data: dict) -> tuple[dict, dict]:
    if not isinstance(data, dict) or set(data) - {
        "recipe", "layers", "sample", "semantic_manifest", "acknowledge_candidate"
    }:
        raise ValueError("unknown submission fields")
    if data.get("acknowledge_candidate") is not True:
        raise ValueError("acknowledge_candidate is required; digital is not physical approval")
    recipe_input = data.get("recipe", {})
    if not isinstance(recipe_input, dict) or set(recipe_input) - {"width_mm", "relief_depth_mm"}:
        raise ValueError("only width_mm and relief_depth_mm are configurable in this pilot")
    width, depth = recipe_input.get("width_mm", 70.0), recipe_input.get("relief_depth_mm", 1.0)
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in (width, depth)):
        raise ValueError("dimensions must be finite numbers")
    if not 20 <= width <= 140 or depth not in DEPTHS:
        raise ValueError("width must be 20..140 mm; depth must be 0.6, 1.0, 1.4 or 1.8 mm")
    recipe = ProductRecipe(width_mm=float(width), relief_depth_mm=float(depth),
                           base_thickness_mm=3.0, grid_long_edge=256, normalization_mode="absolute")
    recipe.validate()
    if data.get("sample") == "calibration-v1":
        if "layers" in data or "semantic_manifest" in data:
            raise ValueError("sample and uploaded layers/semantic manifest are mutually exclusive")
        layers = sample_layers()
        semantic_manifest = sample_semantic_manifest()
    elif "sample" in data:
        raise ValueError("unknown sample")
    else:
        layers = data.get("layers")
        semantic_manifest = data.get("semantic_manifest")
    if not isinstance(layers, dict) or set(layers) - set(LAYERS) or not {"relief_map", "mask"} <= set(layers):
        raise ValueError("relief_map and mask PNG layers are required")
    supplied_semantic_layers = set(layers) & set(SEMANTIC_LAYERS)
    if supplied_semantic_layers and supplied_semantic_layers != set(SEMANTIC_LAYERS):
        raise ValueError("semantic geometry and artwork ID layers must be supplied together")
    if bool(supplied_semantic_layers) != (semantic_manifest is not None):
        raise ValueError("semantic ID layers and semantic manifest must be supplied together")
    if semantic_manifest is not None:
        if not isinstance(semantic_manifest, dict) or "source_bindings" in semantic_manifest:
            raise ValueError("semantic source bindings are generated by the revision service")
        if "uv_artwork" not in layers:
            raise ValueError("semantic registration requires uv_artwork")
        semantic_manifest = normalize_semantic_manifest(semantic_manifest)
    dimensions = None
    hashes = {}
    semantic_ids: dict[str, set[int]] = {}
    coverage_masks: dict[str, np.ndarray] = {}
    total = 0
    for role, encoded in layers.items():
        if not isinstance(encoded, str) or len(encoded) > MAX_BODY_BYTES:
            raise ValueError(f"invalid {role} payload")
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise ValueError(f"invalid {role} base64") from exc
        total += len(raw)
        if total > 2_900_000 or len(raw) < 26 or raw[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("PNG inputs must total at most 2.9 MB")
        with png_input(raw) as img:
            if img.format != "PNG" or getattr(img, "n_frames", 1) != 1:
                raise ValueError("only single-frame PNG is supported")
            w, h = img.size
            if min(w, h) < 32 or max(w, h) > 4096 or w * h > MAX_PIXELS:
                raise ValueError("canvas must be 32..4096 pixels on each side")
            if dimensions is not None and dimensions != img.size:
                raise ValueError("all input layers must share the exact source canvas")
            dimensions = img.size
            if role == "relief_map" and raw[24:26] != bytes((16, 0)):
                raise ValueError("relief_map must be unsigned 16-bit grayscale PNG")
            if role in {"mask", "white_mask", "varnish_mask"} and img.mode != "L":
                raise ValueError(f"{role} must be an unambiguous 8-bit grayscale PNG")
            if role in SEMANTIC_LAYERS and (
                raw[24] not in {8, 16} or raw[25] != 0
            ):
                raise ValueError(f"{role} must be an 8-bit or 16-bit grayscale PNG")
            if "transparency" in img.info:
                raise ValueError("colour-key transparency is ambiguous; use RGBA artwork and grayscale masks")
            if role == "uv_artwork" and img.mode not in {"RGB", "RGBA"}:
                raise ValueError("uv_artwork must be RGB or RGBA PNG")
            img.load()  # Reject truncated data before committing the immutable revision.
            if role == "mask":
                pixels = np.asarray(img)
                if not np.all((pixels == 0) | (pixels == 255)) or not np.any(pixels == 255):
                    raise ValueError("silhouette must be a nonempty binary 0/255 mask")
                coverage_masks[role] = pixels == 255
            if role in SEMANTIC_LAYERS:
                pixels = np.asarray(img)
                if pixels.ndim != 2 or pixels.dtype.kind not in {"u", "i"}:
                    raise ValueError(f"{role} must decode to integer semantic IDs")
                if pixels.size == 0 or int(pixels.min()) < 0 or int(pixels.max()) > 65535:
                    raise ValueError(f"{role} contains semantic IDs outside uint16")
                semantic_ids[role] = {
                    int(value) for value in np.unique(pixels) if int(value) != 0
                }
                coverage_masks[role] = pixels != 0
        hashes[role] = hashlib.sha256(raw).hexdigest()
    if semantic_manifest is not None:
        declared_ids = {region["id"] for region in semantic_manifest["regions"]}
        if any(ids != declared_ids for ids in semantic_ids.values()):
            raise ValueError("semantic label IDs must exactly match semantic manifest")
        if any(
            not np.array_equal(coverage_masks[role], coverage_masks["mask"])
            for role in SEMANTIC_LAYERS
        ):
            raise ValueError(
                "semantic label coverage must exactly match the silhouette mask"
            )
        semantic_pixel_count = dimensions[0] * dimensions[1]
        if (
            semantic_pixel_count > MAX_SEMANTIC_CANVAS_PIXELS
            or semantic_pixel_count * len(declared_ids) > MAX_REGION_PIXEL_WORK
        ):
            raise ValueError("semantic region analysis exceeds the safe work limit")
        semantic_manifest["source_bindings"] = {
            "geometry_source_role": "relief_map",
            "geometry_source_sha256": hashes["relief_map"],
            "artwork_source_role": "uv_artwork",
            "artwork_source_sha256": hashes["uv_artwork"],
            "binding_scope": "revision_inputs_not_derivation_proof",
        }
    spec = {"workshop_version": WORKSHOP_VERSION, "package_engine": PACKAGE_VERSION,
            "toolchain": toolchain(), "engine_sha256": engine_fingerprint(),
            "recipe": asdict(recipe), "source_hashes": hashes,
            "source_canvas_px": list(dimensions), "sample": data.get("sample"),
            "semantic_manifest": semantic_manifest,
            "product_line": "relief-pro", "billing": "internal_pilot_no_charge"}
    return spec, {"layers": layers}
