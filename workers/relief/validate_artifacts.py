from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

import numpy as np
import trimesh

from export_3mf import CORE_NS

ENGINE_VERSION = "artifact-consistency-validator-v0.1.0"
MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_MODEL_XML_BYTES = 128 * 1024 * 1024
MAX_VERTICES = 1_500_000
MAX_TRIANGLES = 3_000_000


@dataclass(frozen=True)
class MeshEvidence:
    format: str
    path: str
    sha256: str
    source_unit: str
    scale_to_mm: float
    vertex_count: int
    triangle_count: int
    bounds_mm: list[list[float]]
    extents_mm: list[float]
    watertight: bool
    winding_consistent: bool
    is_volume: bool
    open_edge_count: int
    component_count: int


@dataclass(frozen=True)
class ArtifactConsistencyReport:
    schema_version: int
    engine_version: str
    decision: str
    tolerance_mm: float
    reference_format: str
    artifacts: list[dict[str, Any]]
    comparisons: list[dict[str, Any]]
    failures: list[str]
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _open_edge_count(mesh: trimesh.Trimesh) -> int:
    if len(mesh.edges_unique_inverse) == 0:
        return 0
    counts = np.bincount(mesh.edges_unique_inverse)
    return int(np.count_nonzero(counts == 1))


def _scene_to_mesh(loaded: trimesh.Scene | trimesh.Trimesh) -> trimesh.Trimesh:
    if isinstance(loaded, trimesh.Trimesh):
        return loaded.copy()
    meshes: list[trimesh.Trimesh] = []
    for node_name in sorted(loaded.graph.nodes_geometry):
        transform, geometry_name = loaded.graph.get(node_name)
        geometry = loaded.geometry[geometry_name].copy()
        geometry.apply_transform(transform)
        meshes.append(geometry)
    if not meshes:
        raise ValueError("artifact contains no mesh geometry")
    return trimesh.util.concatenate(meshes)


def _normalise_mesh(mesh: trimesh.Trimesh, scale_to_mm: float) -> trimesh.Trimesh:
    mesh = mesh.copy()
    if scale_to_mm != 1.0:
        mesh.apply_scale(scale_to_mm)
    if mesh.vertices.size == 0 or mesh.faces.size == 0:
        raise ValueError("artifact mesh is empty")
    if not np.isfinite(mesh.vertices).all():
        raise ValueError("artifact contains non-finite coordinates")
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    if len(mesh.vertices) > MAX_VERTICES or len(mesh.faces) > MAX_TRIANGLES:
        raise ValueError("artifact exceeds validation complexity limits")
    return mesh


def _mesh_evidence(
    mesh: trimesh.Trimesh,
    *,
    format_name: str,
    path: Path,
    source_unit: str,
    scale_to_mm: float,
) -> MeshEvidence:
    bounds = np.asarray(mesh.bounds, dtype=np.float64)
    extents = np.asarray(mesh.extents, dtype=np.float64)
    return MeshEvidence(
        format=format_name,
        path=str(path),
        sha256=_sha256(path),
        source_unit=source_unit,
        scale_to_mm=scale_to_mm,
        vertex_count=int(len(mesh.vertices)),
        triangle_count=int(len(mesh.faces)),
        bounds_mm=np.round(bounds, 8).tolist(),
        extents_mm=np.round(extents, 8).tolist(),
        watertight=bool(mesh.is_watertight),
        winding_consistent=bool(mesh.is_winding_consistent),
        is_volume=bool(mesh.is_volume),
        open_edge_count=_open_edge_count(mesh),
        component_count=len(mesh.split(only_watertight=False)),
    )


def _load_stl(path: Path) -> tuple[trimesh.Trimesh, MeshEvidence]:
    loaded = trimesh.load(path, force="scene", process=False)
    mesh = _normalise_mesh(_scene_to_mesh(loaded), 1.0)
    return mesh, _mesh_evidence(
        mesh,
        format_name="stl",
        path=path,
        source_unit="millimeter",
        scale_to_mm=1.0,
    )


def _load_glb(path: Path) -> tuple[trimesh.Trimesh, MeshEvidence]:
    loaded = trimesh.load(path, force="scene", process=False)
    mesh = _normalise_mesh(_scene_to_mesh(loaded), 1000.0)
    return mesh, _mesh_evidence(
        mesh,
        format_name="glb",
        path=path,
        source_unit="meter",
        scale_to_mm=1000.0,
    )


def _read_3mf_model(path: Path) -> bytes:
    if path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("3MF archive exceeds size limit")
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if any(name.startswith("/") or ".." in Path(name).parts for name in names):
            raise ValueError("3MF contains an unsafe archive path")
        try:
            info = archive.getinfo("3D/3dmodel.model")
        except KeyError as exc:
            raise ValueError("3MF is missing 3D/3dmodel.model") from exc
        if info.file_size > MAX_MODEL_XML_BYTES:
            raise ValueError("3MF model XML exceeds size limit")
        payload = archive.read(info)
    if b"<!DOCTYPE" in payload.upper() or b"<!ENTITY" in payload.upper():
        raise ValueError("3MF model XML contains a forbidden DTD/entity declaration")
    return payload


def _load_3mf(path: Path) -> tuple[trimesh.Trimesh, MeshEvidence]:
    root = ET.fromstring(_read_3mf_model(path))
    unit = root.attrib.get("unit", "millimeter")
    unit_scales = {
        "micron": 0.001,
        "millimeter": 1.0,
        "centimeter": 10.0,
        "inch": 25.4,
        "foot": 304.8,
        "meter": 1000.0,
    }
    if unit not in unit_scales:
        raise ValueError(f"unsupported 3MF unit: {unit}")
    scale_to_mm = unit_scales[unit]

    objects = root.findall(f".//{{{CORE_NS}}}object")
    build_items = root.findall(f".//{{{CORE_NS}}}build/{{{CORE_NS}}}item")
    if len(objects) != 1 or len(build_items) != 1:
        raise ValueError("Phase 0 3MF must contain exactly one object and one build item")
    object_id = objects[0].attrib.get("id")
    if build_items[0].attrib.get("objectid") != object_id:
        raise ValueError("3MF build item does not reference the model object")

    vertex_nodes = objects[0].findall(
        f".//{{{CORE_NS}}}vertices/{{{CORE_NS}}}vertex"
    )
    triangle_nodes = objects[0].findall(
        f".//{{{CORE_NS}}}triangles/{{{CORE_NS}}}triangle"
    )
    if not vertex_nodes or not triangle_nodes:
        raise ValueError("3MF object has no vertices or triangles")
    if len(vertex_nodes) > MAX_VERTICES or len(triangle_nodes) > MAX_TRIANGLES:
        raise ValueError("3MF exceeds validation complexity limits")

    vertices = np.asarray(
        [
            [
                float(vertex.attrib["x"]),
                float(vertex.attrib["y"]),
                float(vertex.attrib["z"]),
            ]
            for vertex in vertex_nodes
        ],
        dtype=np.float64,
    )
    faces = np.asarray(
        [
            [
                int(triangle.attrib["v1"]),
                int(triangle.attrib["v2"]),
                int(triangle.attrib["v3"]),
            ]
            for triangle in triangle_nodes
        ],
        dtype=np.int64,
    )
    if not np.isfinite(vertices).all():
        raise ValueError("3MF contains non-finite coordinates")
    if faces.min() < 0 or faces.max() >= len(vertices):
        raise ValueError("3MF contains invalid triangle indices")

    mesh = _normalise_mesh(
        trimesh.Trimesh(vertices=vertices, faces=faces, process=False),
        scale_to_mm,
    )
    return mesh, _mesh_evidence(
        mesh,
        format_name="3mf",
        path=path,
        source_unit=unit,
        scale_to_mm=scale_to_mm,
    )


def _maximum_absolute_delta(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.max(np.abs(left - right)))


def validate_artifact_set(
    *,
    stl_path: Path,
    glb_path: Path,
    three_mf_path: Path,
    tolerance_mm: float = 0.02,
) -> ArtifactConsistencyReport:
    if not math.isfinite(tolerance_mm) or tolerance_mm <= 0:
        raise ValueError("tolerance_mm must be positive and finite")
    for path in (stl_path, glb_path, three_mf_path):
        if not path.is_file():
            raise FileNotFoundError(path)

    stl_mesh, stl = _load_stl(stl_path)
    glb_mesh, glb = _load_glb(glb_path)
    mf_mesh, mf = _load_3mf(three_mf_path)
    evidences = [stl, glb, mf]

    failures: list[str] = []
    warnings: list[str] = []
    for evidence in evidences:
        if not evidence.watertight:
            failures.append(f"{evidence.format}:not_watertight")
        if not evidence.winding_consistent:
            failures.append(f"{evidence.format}:winding_inconsistent")
        if not evidence.is_volume:
            failures.append(f"{evidence.format}:not_positive_volume")
        if evidence.open_edge_count != 0:
            failures.append(f"{evidence.format}:open_edges")
        if evidence.component_count != 1:
            failures.append(f"{evidence.format}:component_count_{evidence.component_count}")

    reference_bounds = np.asarray(stl.bounds_mm, dtype=np.float64)
    reference_extents = np.asarray(stl.extents_mm, dtype=np.float64)
    comparisons: list[dict[str, Any]] = []
    for evidence in (glb, mf):
        bounds_delta = _maximum_absolute_delta(
            reference_bounds,
            np.asarray(evidence.bounds_mm, dtype=np.float64),
        )
        extents_delta = _maximum_absolute_delta(
            reference_extents,
            np.asarray(evidence.extents_mm, dtype=np.float64),
        )
        comparison_pass = bounds_delta <= tolerance_mm and extents_delta <= tolerance_mm
        if not comparison_pass:
            failures.append(f"stl_vs_{evidence.format}:coordinate_mismatch")
        comparisons.append(
            {
                "reference": "stl",
                "candidate": evidence.format,
                "maximum_bounds_delta_mm": round(bounds_delta, 8),
                "maximum_extents_delta_mm": round(extents_delta, 8),
                "pass": comparison_pass,
            }
        )

    # STL can merge or duplicate vertices, so topology counts are informative,
    # not an equality requirement. A large triangle-count mismatch is suspicious.
    for evidence in (glb, mf):
        ratio = evidence.triangle_count / max(stl.triangle_count, 1)
        if ratio < 0.95 or ratio > 1.05:
            warnings.append(
                f"stl_vs_{evidence.format}:triangle_count_ratio_{ratio:.4f}"
            )

    decision = "pass" if not failures and not warnings else (
        "pass_with_warnings" if not failures else "fail"
    )
    return ArtifactConsistencyReport(
        schema_version=1,
        engine_version=ENGINE_VERSION,
        decision=decision,
        tolerance_mm=tolerance_mm,
        reference_format="stl",
        artifacts=[asdict(evidence) for evidence in evidences],
        comparisons=comparisons,
        failures=sorted(set(failures)),
        warnings=sorted(set(warnings)),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate cross-format consistency of Relief Pro STL/GLB/3MF artifacts"
    )
    parser.add_argument("--stl", type=Path, required=True)
    parser.add_argument("--glb", type=Path, required=True)
    parser.add_argument("--three-mf", type=Path, required=True)
    parser.add_argument("--tolerance-mm", type=float, default=0.02)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    try:
        report = validate_artifact_set(
            stl_path=args.stl,
            glb_path=args.glb,
            three_mf_path=args.three_mf,
            tolerance_mm=args.tolerance_mm,
        )
    except Exception as exc:
        print(f"artifact validation failed: {exc}", file=sys.stderr)
        return 2

    payload = json.dumps(
        report.to_dict(),
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return 0 if report.decision in {"pass", "pass_with_warnings"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
