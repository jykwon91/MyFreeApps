"""Shared tiny utilities for the job-analysis service modules.

These helpers are used by both ``job_analysis_service`` (validate +
score path) and ``job_analysis_promote_service`` (promote path). Keeping
them in a common private module avoids circular imports between the two
sibling modules.

All functions are module-private by convention (underscore prefix) —
they are not part of the public API.
"""
from __future__ import annotations

# Salary period values from the prompt are mapped to the application
# model's check-constraint values (annual / monthly / hourly).
_SALARY_PERIOD_MAP: dict[str, str] = {
    "year": "annual",
    "month": "monthly",
    "hour": "hourly",
}

_VALID_REMOTE_TYPE: frozenset[str] = frozenset(("remote", "hybrid", "onsite"))


def _str_or_none(value: object) -> str | None:
    if not value or not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped else None


def _safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if result < 0:
        return None
    return result


def _safe_remote_type(value: object) -> str:
    cleaned = _str_or_none(value)
    if cleaned in _VALID_REMOTE_TYPE:
        return cleaned  # type: ignore[return-value]
    return "unknown"


def _map_salary_period(value: object) -> str | None:
    cleaned = _str_or_none(value)
    if cleaned is None:
        return None
    return _SALARY_PERIOD_MAP.get(cleaned)
