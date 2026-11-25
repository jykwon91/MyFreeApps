"""Read an app's KEY=VALUE env files. Standard library only: ``seed_env``
imports this and runs on the VPS host's bare ``python3``."""
from __future__ import annotations

from pathlib import Path


def parse_env(text: str) -> dict[str, str]:
    """Parse KEY=VALUE lines into a dict. Comments/blank lines are skipped."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        values[key.strip()] = value.strip()
    return values


def raw_env_values(text: str) -> dict[str, str]:
    """Like ``parse_env`` but keeps each value exactly as written after ``=``.
    The apps read their env files with ``format: raw``, so a pasted non-breaking
    space that ``str.strip()`` would remove still reaches them."""
    values: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value
    return values


def read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    return parse_env(path.read_text(encoding="utf-8"))
