"""Filesystem locations, resolved relative to the repository."""

from __future__ import annotations

import os
from pathlib import Path

# services/agents/src/govnav_agents/paths.py -> repo root is 4 levels up.
REPO_ROOT = Path(os.environ.get("GOVNAV_REPO_ROOT", Path(__file__).resolve().parents[4]))
DATA_DIR = Path(os.environ.get("GOVNAV_DATA_DIR", REPO_ROOT / "data"))
INDEX_DIR = Path(os.environ.get("GOVNAV_INDEX_DIR", REPO_ROOT / "services" / "agents" / ".index"))
