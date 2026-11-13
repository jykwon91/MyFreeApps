"""Where every app's (and the scaffold's) frontend index.css lives, for the CSS conformance tests. Not a test module.

Apps are discovered from apps/*/app.yaml and each must have frontend/src/index.css (every app
today ships a web frontend; an app without one needs an explicit, reviewed exemption in the test
that reads it).
"""
from __future__ import annotations

from pathlib import Path

# tests/ -> shared-backend/ -> packages/ -> repo/
REPO_ROOT = Path(__file__).resolve().parents[3]
SCAFFOLD_CSS = REPO_ROOT / "infra" / "templates" / "scaffold" / "frontend" / "src" / "index.css"
APPS = sorted(p.parent.name for p in (REPO_ROOT / "apps").glob("*/app.yaml"))
CSS_FILES: dict[str, Path] = {
    "scaffold": SCAFFOLD_CSS,
    **{app: REPO_ROOT / "apps" / app / "frontend" / "src" / "index.css" for app in APPS},
}
