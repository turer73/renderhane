"""CLI for compiling semantic labels into a canonical absolute height map."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

try:
    from relief_engine.semantic_ops import SemanticReliefInputError, compile_semantic_relief
except ModuleNotFoundError as exc:  # pragma: no cover - supports ``python -m workers.relief...``
    if exc.name != "relief_engine":
        raise
    from .relief_engine.semantic_ops import SemanticReliefInputError, compile_semantic_relief


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compile exact-canvas semantic labels into a uint16 relief map."
    )
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--recipe", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--width-mm", type=float, required=True)
    parser.add_argument("--height-mm", type=float, required=True)
    parser.add_argument("--relief-depth-mm", type=float, required=True)
    parser.add_argument("--minimum-feature-mm", type=float, default=0.6)
    parser.add_argument("--depth-candidate", type=Path)
    parser.add_argument("--detail-source", type=Path)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        report = compile_semantic_relief(
            args.labels,
            args.recipe,
            args.output,
            physical_width_mm=args.width_mm,
            physical_height_mm=args.height_mm,
            relief_depth_mm=args.relief_depth_mm,
            minimum_feature_mm=args.minimum_feature_mm,
            depth_candidate_path=args.depth_candidate,
            detail_source_path=args.detail_source,
        )
    except (SemanticReliefInputError, OSError, TypeError, ValueError):
        print("semantic_relief_compile_failed", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
