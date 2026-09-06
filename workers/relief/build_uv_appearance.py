#!/usr/bin/env python3
"""Build deterministic UV appearance aids from canonical relief and RGB artwork."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from relief_engine.models import canonical_json_bytes
from relief_engine.uv_appearance import build_uv_appearance


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--relief-map", required=True, type=Path)
    parser.add_argument("--uv-artwork", required=True, type=Path)
    parser.add_argument("--silhouette", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--physical-width-mm", required=True, type=float)
    parser.add_argument("--physical-height-mm", required=True, type=float)
    parser.add_argument("--relief-depth-mm", required=True, type=float)
    parser.add_argument("--spec", type=Path)
    args = parser.parse_args(argv)
    try:
        spec = json.loads(args.spec.read_text(encoding="utf-8")) if args.spec else None
        ticket = build_uv_appearance(
            args.relief_map,
            args.uv_artwork,
            args.silhouette,
            args.out_dir,
            physical_width_mm=args.physical_width_mm,
            physical_height_mm=args.physical_height_mm,
            relief_depth_mm=args.relief_depth_mm,
            spec=spec,
        )
    except Exception:
        print("uv_appearance_build_failed", file=sys.stderr)
        return 2
    sys.stdout.buffer.write(canonical_json_bytes(ticket) + b"\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
