"""Public API for Renderhane's deterministic Relief Pro Phase 0 engine."""

from .mesh_ops import (
    build_rectangular_relief_mesh,
    build_silhouette_relief_mesh,
    count_open_edges,
    trace_boundary_loops,
    validate_mesh,
)
from .models import (
    ENGINE_NAME,
    ENGINE_VERSION,
    FIXED_ZIP_TIME,
    MAX_SOURCE_FILE_BYTES,
    MAX_SOURCE_PIXELS,
    REPORT_SCHEMA_VERSION,
    BuildRecipe,
    BuildReport,
    MeshValidation,
    inspect_source_image,
    ShapeMode,
    canonical_json_bytes,
    dependency_versions,
    sha256_bytes,
    sha256_file,
)
from .pipeline import build

__all__ = [
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "FIXED_ZIP_TIME",
    "MAX_SOURCE_FILE_BYTES",
    "MAX_SOURCE_PIXELS",
    "REPORT_SCHEMA_VERSION",
    "BuildRecipe",
    "BuildReport",
    "MeshValidation",
    "ShapeMode",
    "build",
    "build_rectangular_relief_mesh",
    "build_silhouette_relief_mesh",
    "canonical_json_bytes",
    "count_open_edges",
    "dependency_versions",
    "inspect_source_image",
    "sha256_bytes",
    "sha256_file",
    "trace_boundary_loops",
    "validate_mesh",
]
