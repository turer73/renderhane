from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from xml.etree import ElementTree as ET

import numpy as np
import trimesh

CORE_NS = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)

ET.register_namespace("", CORE_NS)


@dataclass(frozen=True)
class ExportReport:
    schema_version: int
    source: str
    output: str
    source_sha256: str
    output_sha256: str
    unit: str
    vertex_count: int
    triangle_count: int
    extents_mm: list[float]
    watertight: bool
    winding_consistent: bool
    is_volume: bool

    def to_dict(self) -> dict[str, object]:
        return {
            "schema_version": self.schema_version,
            "source": self.source,
            "output": self.output,
            "source_sha256": self.source_sha256,
            "output_sha256": self.output_sha256,
            "unit": self.unit,
            "vertex_count": self.vertex_count,
            "triangle_count": self.triangle_count,
            "extents_mm": self.extents_mm,
            "watertight": self.watertight,
            "winding_consistent": self.winding_consistent,
            "is_volume": self.is_volume,
        }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _format_float(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("3MF coordinates must be finite")
    value = 0.0 if abs(value) < 5e-10 else value
    return f"{value:.9f}".rstrip("0").rstrip(".") or "0"


def _load_single_mesh(source: Path) -> trimesh.Trimesh:
    loaded = trimesh.load(source, force="scene", process=False)
    if isinstance(loaded, trimesh.Scene):
        geometries = [geometry.copy() for geometry in loaded.geometry.values()]
        if not geometries:
            raise ValueError("Source contains no mesh geometry")
        mesh = trimesh.util.concatenate(geometries)
    elif isinstance(loaded, trimesh.Trimesh):
        mesh = loaded.copy()
    else:
        raise ValueError(f"Unsupported mesh payload: {type(loaded).__name__}")

    if mesh.vertices.size == 0 or mesh.faces.size == 0:
        raise ValueError("Source mesh is empty")
    if not np.isfinite(mesh.vertices).all():
        raise ValueError("Source mesh contains NaN or infinite coordinates")
    if mesh.faces.min() < 0 or mesh.faces.max() >= len(mesh.vertices):
        raise ValueError("Source mesh has invalid face indices")

    # Merge exact duplicate vertices and remove faces that cannot be printed.
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()

    if mesh.faces.size == 0:
        raise ValueError("Source mesh has no non-degenerate triangles")
    return mesh


def _validate_for_manufacturing(mesh: trimesh.Trimesh) -> None:
    failures: list[str] = []
    if not mesh.is_watertight:
        failures.append("mesh is not watertight")
    if not mesh.is_winding_consistent:
        failures.append("mesh winding is inconsistent")
    if not mesh.is_volume:
        failures.append("mesh does not enclose a positive volume")
    if np.any(np.asarray(mesh.extents) <= 0):
        failures.append("mesh extents must be positive")
    if failures:
        raise ValueError("; ".join(failures))


def _model_xml(mesh: trimesh.Trimesh, title: str) -> bytes:
    model = ET.Element(
        f"{{{CORE_NS}}}model",
        {
            "unit": "millimeter",
            "xml:lang": "en-US",
        },
    )
    metadata = ET.SubElement(model, f"{{{CORE_NS}}}metadata", {"name": "Title"})
    metadata.text = title
    application = ET.SubElement(model, f"{{{CORE_NS}}}metadata", {"name": "Application"})
    application.text = "Renderhane Manufacturing Relief"

    resources = ET.SubElement(model, f"{{{CORE_NS}}}resources")
    obj = ET.SubElement(
        resources,
        f"{{{CORE_NS}}}object",
        {"id": "1", "type": "model", "name": title},
    )
    mesh_node = ET.SubElement(obj, f"{{{CORE_NS}}}mesh")
    vertices_node = ET.SubElement(mesh_node, f"{{{CORE_NS}}}vertices")

    for vertex in np.asarray(mesh.vertices, dtype=np.float64):
        ET.SubElement(
            vertices_node,
            f"{{{CORE_NS}}}vertex",
            {
                "x": _format_float(float(vertex[0])),
                "y": _format_float(float(vertex[1])),
                "z": _format_float(float(vertex[2])),
            },
        )

    triangles_node = ET.SubElement(mesh_node, f"{{{CORE_NS}}}triangles")
    for face in np.asarray(mesh.faces, dtype=np.int64):
        ET.SubElement(
            triangles_node,
            f"{{{CORE_NS}}}triangle",
            {"v1": str(int(face[0])), "v2": str(int(face[1])), "v3": str(int(face[2]))},
        )

    build = ET.SubElement(model, f"{{{CORE_NS}}}build")
    ET.SubElement(build, f"{{{CORE_NS}}}item", {"objectid": "1"})

    ET.indent(model, space="  ")
    return ET.tostring(model, encoding="utf-8", xml_declaration=True)


def _content_types_xml() -> bytes:
    root = ET.Element(f"{{{CONTENT_NS}}}Types")
    ET.SubElement(
        root,
        f"{{{CONTENT_NS}}}Default",
        {"Extension": "rels", "ContentType": "application/vnd.openxmlformats-package.relationships+xml"},
    )
    ET.SubElement(
        root,
        f"{{{CONTENT_NS}}}Default",
        {"Extension": "model", "ContentType": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"},
    )
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _relationships_xml() -> bytes:
    root = ET.Element(f"{{{REL_NS}}}Relationships")
    ET.SubElement(
        root,
        f"{{{REL_NS}}}Relationship",
        {
            "Target": "/3D/3dmodel.model",
            "Id": "rel0",
            "Type": "http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel",
        },
    )
    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _write_deterministic_zip(output: Path, members: Iterable[tuple[str, bytes]]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, payload in sorted(members, key=lambda item: item[0]):
            info = zipfile.ZipInfo(name, date_time=FIXED_ZIP_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            info.create_system = 3
            archive.writestr(info, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def export_3mf(source: Path, output: Path, *, title: str = "Renderhane Relief") -> ExportReport:
    if not source.is_file():
        raise FileNotFoundError(source)
    mesh = _load_single_mesh(source)
    _validate_for_manufacturing(mesh)

    members = [
        ("[Content_Types].xml", _content_types_xml()),
        ("_rels/.rels", _relationships_xml()),
        ("3D/3dmodel.model", _model_xml(mesh, title)),
    ]
    _write_deterministic_zip(output, members)

    return ExportReport(
        schema_version=1,
        source=str(source),
        output=str(output),
        source_sha256=_sha256(source),
        output_sha256=_sha256(output),
        unit="millimeter",
        vertex_count=int(len(mesh.vertices)),
        triangle_count=int(len(mesh.faces)),
        extents_mm=[round(float(value), 6) for value in mesh.extents],
        watertight=bool(mesh.is_watertight),
        winding_consistent=bool(mesh.is_winding_consistent),
        is_volume=bool(mesh.is_volume),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Export a validated mesh as deterministic generic 3MF")
    parser.add_argument("--input", type=Path, required=True, help="Validated STL/OBJ/GLB in millimetres")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--title", default="Renderhane Relief")
    parser.add_argument("--report", type=Path, default=None)
    args = parser.parse_args(argv)

    try:
        report = export_3mf(args.input, args.output, title=args.title)
    except Exception as exc:
        print(f"3MF export failed: {exc}", file=sys.stderr)
        return 2

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            json.dumps(report.to_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
    print(json.dumps(report.to_dict(), ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
