"""Deterministic manufacturing exports, SVG registration and artifact metadata."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import Any, Literal
from xml.sax.saxutils import escape

import numpy as np
import trimesh

from .models import FIXED_ZIP_TIME, sha256_file


def _format_float(value: float) -> str:
    if abs(value) < 5e-13:
        value = 0.0
    return format(float(value), ".9g")


def deterministic_3mf_bytes(mesh_mm: trimesh.Trimesh, title: str, recipe_hash: str) -> bytes:
    vertices = np.asarray(mesh_mm.vertices, dtype=np.float64)
    faces = np.asarray(mesh_mm.faces, dtype=np.int64)
    model = io.StringIO()
    model.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    model.write('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n')
    model.write(f'  <metadata name="Title">{escape(title)}</metadata>\n')
    model.write('  <metadata name="Application">Renderhane Manufacturing Relief</metadata>\n')
    model.write(f'  <metadata name="Description">recipe_sha256={recipe_hash}</metadata>\n')
    model.write('  <resources>\n    <object id="1" type="model" name="Renderhane Relief">\n      <mesh>\n        <vertices>\n')
    for x, y, z in vertices:
        model.write(
            f'          <vertex x="{_format_float(x)}" y="{_format_float(y)}" z="{_format_float(z)}"/>\n'
        )
    model.write('        </vertices>\n        <triangles>\n')
    for v1, v2, v3 in faces:
        model.write(f'          <triangle v1="{int(v1)}" v2="{int(v2)}" v3="{int(v3)}"/>\n')
    model.write('        </triangles>\n      </mesh>\n    </object>\n  </resources>\n')
    model.write('  <build>\n    <item objectid="1"/>\n  </build>\n</model>\n')

    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
        '</Types>\n'
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
        '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n'
        '</Relationships>\n'
    )

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in (
            ("[Content_Types].xml", content_types.encode("utf-8")),
            ("_rels/.rels", relationships.encode("utf-8")),
            ("3D/3dmodel.model", model.getvalue().encode("utf-8")),
        ):
            info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


def load_exported_mesh(path: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(path, force="mesh", process=True)
    if not isinstance(loaded, trimesh.Trimesh):
        raise ValueError(f"Export did not reload as a mesh: {path.name}")
    return loaded


def compare_export(
    path: Path,
    expected_mesh_mm: trimesh.Trimesh,
    units: Literal["millimetres", "metres"],
) -> dict[str, Any]:
    loaded = load_exported_mesh(path)
    expected_extents = np.asarray(expected_mesh_mm.extents, dtype=np.float64)
    scale = 0.001 if units == "metres" else 1.0
    expected = expected_extents * scale
    actual = np.asarray(loaded.extents, dtype=np.float64)
    tolerance = 1e-6 if units == "metres" else 1e-4
    extents_match = bool(np.allclose(actual, expected, atol=tolerance, rtol=0.0))
    return {
        "reloaded": True,
        "units": units,
        "extents": [round(float(value), 9) for value in actual],
        "extents_match": extents_match,
        "watertight": bool(loaded.is_watertight),
        "winding_consistent": bool(loaded.is_winding_consistent),
        "is_volume": bool(loaded.is_volume),
        "vertex_count": int(len(loaded.vertices)),
        "face_count": int(len(loaded.faces)),
    }


def artifact_record(path: Path, media_type: str, units: str | None = None) -> dict[str, Any]:
    record: dict[str, Any] = {
        "file": path.name,
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "media_type": media_type,
    }
    if units:
        record["units"] = units
    return record


def write_deterministic_zip(destination: Path, files: list[Path]) -> None:
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(files, key=lambda item: item.name):
            info = zipfile.ZipInfo(path.name, FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(
                info,
                path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def write_contour_svg(
    destination: Path,
    width_mm: float,
    height_mm: float,
    contour_loops_mm: list[list[tuple[float, float]]],
) -> None:
    if not contour_loops_mm:
        raise ValueError("No contour loop is available for SVG export")

    commands: list[str] = []
    for loop in contour_loops_mm:
        if len(loop) < 3:
            raise ValueError("Contour loop must contain at least three points")
        converted = [
            (x + width_mm / 2.0, height_mm / 2.0 - y)
            for x, y in loop
        ]
        x0, y0 = converted[0]
        commands.append(f"M {_format_float(x0)} {_format_float(y0)}")
        commands.extend(
            f"L {_format_float(x)} {_format_float(y)}"
            for x, y in converted[1:]
        )
        commands.append("Z")

    path_data = " ".join(commands)
    stroke = max(0.10, min(width_mm, height_mm) * 0.002)
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{_format_float(width_mm)}mm" height="{_format_float(height_mm)}mm" viewBox="0 0 {_format_float(width_mm)} {_format_float(height_mm)}">
  <metadata>Renderhane Phase 0 physical contour; model X right, model Y up</metadata>
  <path d="{path_data}" fill="none" stroke="#000" stroke-width="{_format_float(stroke)}" fill-rule="evenodd"/>
</svg>
'''
    destination.write_text(svg, encoding="utf-8")


def write_registration_svg(
    destination: Path,
    width_mm: float,
    height_mm: float,
    source_extent_px: tuple[float, float, float, float],
) -> None:
    stroke = max(0.15, min(width_mm, height_mm) * 0.003)
    inset = max(1.0, min(width_mm, height_mm) * 0.04)
    cx = width_mm / 2.0
    cy = height_mm / 2.0
    source_text = ",".join(_format_float(value) for value in source_extent_px)
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{_format_float(width_mm)}mm" height="{_format_float(height_mm)}mm" viewBox="0 0 {_format_float(width_mm)} {_format_float(height_mm)}">
  <metadata>Renderhane Phase 0 registration; source_extent_px={source_text}</metadata>
  <g fill="none" stroke="#000" stroke-width="{_format_float(stroke)}">
    <rect x="{_format_float(inset)}" y="{_format_float(inset)}" width="{_format_float(width_mm - 2 * inset)}" height="{_format_float(height_mm - 2 * inset)}"/>
    <line x1="{_format_float(cx - 3)}" y1="{_format_float(cy)}" x2="{_format_float(cx + 3)}" y2="{_format_float(cy)}"/>
    <line x1="{_format_float(cx)}" y1="{_format_float(cy - 3)}" x2="{_format_float(cx)}" y2="{_format_float(cy + 3)}"/>
    <circle cx="{_format_float(cx)}" cy="{_format_float(cy)}" r="2"/>
    <circle cx="{_format_float(inset)}" cy="{_format_float(inset)}" r="1"/>
    <circle cx="{_format_float(width_mm - inset)}" cy="{_format_float(inset)}" r="1"/>
    <circle cx="{_format_float(width_mm - inset)}" cy="{_format_float(height_mm - inset)}" r="1"/>
    <circle cx="{_format_float(inset)}" cy="{_format_float(height_mm - inset)}" r="1"/>
  </g>
</svg>
'''
    destination.write_text(svg, encoding="utf-8")
