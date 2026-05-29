"""Claude JSON response parsing + field validation helpers.

Pure functions that turn a raw Claude text response (and individual parsed
fields) into validated primitives, appending human-readable notes to a shared
``failures`` list. No DB, no SDK, no I/O. Shared by every classifier entrypoint.

Extracted from the former ``classifier_service.py`` (a utility grab-bag) so the
shared parse/validate helpers have a cohesive home with PUBLIC names.
"""
from __future__ import annotations

from typing import Any, Optional


def strip_json_fences(raw_text: str) -> str:
    """Strip a leading ```json / ``` markdown fence if Claude added one."""
    clean = raw_text.strip()
    if clean.startswith("```"):
        clean = clean.split("```", 2)[1]
        if clean.startswith("json"):
            clean = clean[4:]
        clean = clean.strip()
    return clean


def validate_aim_coord(
    value: Any, axis: str, failures: list[str]
) -> Optional[float]:
    """Validate one normalized aim-anchor coordinate (shared with single-image path)."""
    if value is None:
        return None
    try:
        coord = float(value)
    except (TypeError, ValueError):
        failures.append(f"aim_anchor_{axis} '{value}' is not a number")
        return None
    if not (0.0 <= coord <= 1.0):
        failures.append(f"aim_anchor_{axis}={coord} out of range [0,1]")
        return None
    return coord


def validate_grid_index(
    value: Any, field_name: str, n: int, failures: list[str]
) -> Optional[int]:
    """Validate a 1-based frame index returned by the grid classifier.

    Returns the 1-based int if it is an integer within [1, n], else None and
    appends a human-readable note to *failures*.
    """
    if value is None:
        return None
    try:
        idx = int(value)
    except (TypeError, ValueError):
        failures.append(f"{field_name} '{value}' is not an integer")
        return None
    if not (1 <= idx <= n):
        failures.append(f"{field_name}={idx} out of range [1,{n}]")
        return None
    return idx
