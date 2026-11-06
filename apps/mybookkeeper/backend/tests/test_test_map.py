"""scripts/test-map.json must name only files that exist.

run-affected-tests.sh picks tests by matching changed files against the map's
source paths. A path that has moved never matches, so its tests silently stop
running when it changes; a test that has moved or been deleted makes pytest,
vitest or Playwright fail on a missing file.
"""

import json
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[2]
TEST_MAP = json.loads((APP_DIR / "scripts" / "test-map.json").read_text())

# vitest is given bare file names and filters on them, so a name just has to
# exist somewhere under the frontend's sources.
FRONTEND_TEST_NAMES = {p.name for p in (APP_DIR / "frontend" / "src").rglob("*.test.*")}


def _exists(path: str) -> bool:
    # A trailing slash is how the runner tells a directory from a file.
    return (APP_DIR / path).is_dir() if path.endswith("/") else (APP_DIR / path).is_file()


def _missing_paths() -> list[str]:
    missing = [
        f"shared_paths: {p}" for p in TEST_MAP["shared_paths"] if not _exists(p)
    ]
    missing += [
        f"always_e2e: {s}"
        for s in TEST_MAP["always_e2e"]
        if not (APP_DIR / "frontend" / "e2e" / s).is_file()
    ]
    for name, domain in TEST_MAP["domains"].items():
        missing += [
            f"{name} source_paths: {p}"
            for p in domain.get("source_paths", [])
            if not _exists(p)
        ]
        missing += [
            f"{name} backend_tests: {t}"
            for t in domain.get("backend_tests", [])
            if not (APP_DIR / "backend" / "tests" / t).is_file()
        ]
        missing += [
            f"{name} frontend_tests: {t}"
            for t in domain.get("frontend_tests", [])
            if t not in FRONTEND_TEST_NAMES
        ]
        missing += [
            f"{name} e2e_specs: {s}"
            for s in domain.get("e2e_specs", [])
            if not (APP_DIR / "frontend" / "e2e" / s).is_file()
        ]
    return missing


def test_every_path_in_the_test_map_exists() -> None:
    assert _missing_paths() == []

