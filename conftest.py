from __future__ import annotations

import importlib
import sys
from pathlib import Path

RELIEF_WORKER_DIR = Path(__file__).resolve().parent / "workers" / "relief"
if RELIEF_WORKER_DIR.is_dir() and str(RELIEF_WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(RELIEF_WORKER_DIR))

# Some worker regression tests intentionally load source files through
# importlib.util. Registering the modules once through the normal import system
# keeps dataclass/type resolution stable across Python 3.11+ collection.
for module_name in ("relief_builder", "export_3mf"):
    try:
        importlib.import_module(module_name)
    except ModuleNotFoundError:
        pass
