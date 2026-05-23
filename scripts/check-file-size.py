#!/usr/bin/env python3
"""Check that source files do not silently balloon past safe LOC thresholds.

Two rules enforced:
  1. Hard limit — any non-allowlisted source file over 1000 LOC fails immediately.
  2. Growth guard — any source file already over 500 LOC on the base ref that has
     grown (net positive lines) since that ref also fails.

Usage:
    python scripts/check-file-size.py [--base <git-ref>]

The base ref defaults to origin/main and is used to compare current LOC against
the base for the growth guard.  Pass --base HEAD to skip the growth guard (useful
for local dry-runs when origin/main is not fetched).
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from typing import NamedTuple

import yaml

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HARD_LIMIT = 1000  # LOC — any file over this is an immediate failure
GROWTH_GUARD_THRESHOLD = 500  # LOC — files over this must not grow

SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".rs"}

EXCLUDED_DIRS = frozenset(
    {
        "node_modules",
        ".venv",
        "dist",
        "build",
        "target",
        "__pycache__",
    }
)

# Path segments that indicate a test file (checked against the full path,
# normalised to forward slashes).
EXCLUDED_PATH_PARTS = (
    "/tests/",
    "/test/",
    "/__tests__/",
    "/test_helpers/",
)

# Filename patterns that indicate a test file.
EXCLUDED_FILENAME_PREFIXES = ("test_",)
EXCLUDED_FILENAME_SUBSTRINGS = ("_test.", ".spec.", ".test.")

# Roots to scan, relative to the repo root.
SCAN_ROOTS = ("apps", "packages")

ALLOWLIST_PATH = Path("scripts/file-size-allowlist.yml")


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------


class Violation(NamedTuple):
    rule: str  # "hard_limit" or "growth_guard"
    path: str
    current_loc: int
    base_loc: int  # 0 when not applicable
    threshold: int


# ---------------------------------------------------------------------------
# Allowlist
# ---------------------------------------------------------------------------


def load_allowlist(repo_root: Path) -> tuple[frozenset[str], frozenset[str]]:
    """Return (over_1000_paths, allow_growth_paths) as frozensets of relative paths."""
    allowlist_file = repo_root / ALLOWLIST_PATH
    if not allowlist_file.exists():
        return frozenset(), frozenset()

    with allowlist_file.open() as fh:
        data = yaml.safe_load(fh) or {}

    def extract_paths(key: str) -> frozenset[str]:
        entries = data.get(key) or []
        return frozenset(e["path"] for e in entries if isinstance(e, dict) and "path" in e)

    return extract_paths("over_1000_loc"), extract_paths("allow_growth_over_500")


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------


def is_test_file(rel_path: str) -> bool:
    """Return True if the path looks like a test or helper file."""
    norm = rel_path.replace(os.sep, "/")
    if any(part in norm for part in EXCLUDED_PATH_PARTS):
        return True
    fname = os.path.basename(norm)
    if any(fname.startswith(p) for p in EXCLUDED_FILENAME_PREFIXES):
        return True
    if any(sub in fname for sub in EXCLUDED_FILENAME_SUBSTRINGS):
        return True
    return False


def iter_source_files(repo_root: Path) -> list[str]:
    """Yield paths (relative to repo_root, forward-slash-normalised) of source files."""
    results: list[str] = []
    for scan_root in SCAN_ROOTS:
        abs_root = repo_root / scan_root
        if not abs_root.exists():
            continue
        for root, dirs, files in os.walk(abs_root):
            # Prune excluded directories in-place so os.walk does not descend.
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
            for fname in files:
                if Path(fname).suffix not in SOURCE_EXTENSIONS:
                    continue
                abs_path = Path(root) / fname
                rel_path = abs_path.relative_to(repo_root).as_posix()
                if is_test_file(rel_path):
                    continue
                results.append(rel_path)
    return results


# ---------------------------------------------------------------------------
# LOC helpers
# ---------------------------------------------------------------------------


def count_lines(abs_path: Path) -> int:
    """Count non-empty lines in a file (same as wc -l behaviour for consistency)."""
    try:
        with abs_path.open(errors="ignore") as fh:
            return sum(1 for _ in fh)
    except OSError:
        return 0


def count_lines_at_ref(rel_path: str, git_ref: str) -> int:
    """Return LOC of rel_path at git_ref, or 0 if the file did not exist then."""
    try:
        result = subprocess.run(
            ["git", "show", f"{git_ref}:{rel_path}"],
            capture_output=True,
            check=True,
        )
        # Decode as UTF-8 with replacement to tolerate binary/non-UTF content.
        return result.stdout.decode("utf-8", errors="replace").count("\n")
    except subprocess.CalledProcessError:
        # File did not exist at base ref — treat as 0 LOC (new file).
        return 0


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------


def check_files(
    repo_root: Path,
    base_ref: str,
    over_1000_allowlist: frozenset[str],
    allow_growth_allowlist: frozenset[str],
) -> list[Violation]:
    violations: list[Violation] = []
    source_files = iter_source_files(repo_root)

    for rel_path in source_files:
        abs_path = repo_root / rel_path
        current_loc = count_lines(abs_path)

        # Rule 1 — hard limit
        if current_loc > HARD_LIMIT and rel_path not in over_1000_allowlist:
            violations.append(
                Violation(
                    rule="hard_limit",
                    path=rel_path,
                    current_loc=current_loc,
                    base_loc=0,
                    threshold=HARD_LIMIT,
                )
            )
            continue  # no need to also check growth guard for the same file

        # Rule 2 — growth guard (only for files already over the threshold)
        if current_loc > GROWTH_GUARD_THRESHOLD and rel_path not in allow_growth_allowlist:
            base_loc = count_lines_at_ref(rel_path, base_ref)
            if base_loc > GROWTH_GUARD_THRESHOLD and current_loc > base_loc:
                violations.append(
                    Violation(
                        rule="growth_guard",
                        path=rel_path,
                        current_loc=current_loc,
                        base_loc=base_loc,
                        threshold=GROWTH_GUARD_THRESHOLD,
                    )
                )

    return violations


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def print_summary(violations: list[Violation]) -> None:
    if not violations:
        print("check-file-size: all files within thresholds.")
        return

    hard = [v for v in violations if v.rule == "hard_limit"]
    growth = [v for v in violations if v.rule == "growth_guard"]

    print(f"\ncheck-file-size: {len(violations)} violation(s) found.\n")

    if hard:
        print(f"  HARD LIMIT (>{HARD_LIMIT} LOC) — {len(hard)} file(s):")
        for v in sorted(hard, key=lambda x: -x.current_loc):
            print(f"    {v.current_loc:5d} LOC  {v.path}")
        print()

    if growth:
        print(
            f"  GROWTH GUARD (file already >{GROWTH_GUARD_THRESHOLD} LOC and grew) — {len(growth)} file(s):"
        )
        for v in sorted(growth, key=lambda x: -(x.current_loc - x.base_loc)):
            delta = v.current_loc - v.base_loc
            print(
                f"    {v.current_loc:5d} LOC  (+{delta})  {v.path}"
                f"  [was {v.base_loc} on base]"
            )
        print()

    print(
        "To resolve:\n"
        "  - Split the file into focused modules under 500 LOC each.\n"
        "  - If the file genuinely cannot be split (pure constant tables, generated\n"
        "    code), add it to scripts/file-size-allowlist.yml with a reason.\n"
    )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail if source files exceed LOC thresholds.",
    )
    parser.add_argument(
        "--base",
        default="origin/main",
        metavar="GIT_REF",
        help="Git ref to compare against for the growth guard (default: origin/main).",
    )
    args = parser.parse_args()

    # Resolve repo root as the directory containing this script's parent.
    repo_root = Path(__file__).resolve().parent.parent

    over_1000_allowlist, allow_growth_allowlist = load_allowlist(repo_root)
    violations = check_files(repo_root, args.base, over_1000_allowlist, allow_growth_allowlist)
    print_summary(violations)

    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
