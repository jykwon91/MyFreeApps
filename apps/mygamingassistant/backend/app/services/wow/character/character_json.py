"""Safe readers for Blizzard's JSON: a wrong type reads as missing, never raises."""
from __future__ import annotations

from typing import Any


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_str(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def as_int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def as_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def name_of(value: Any) -> str | None:
    return as_str(as_dict(value).get("name"))
