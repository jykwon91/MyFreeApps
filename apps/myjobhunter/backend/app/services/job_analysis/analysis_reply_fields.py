"""Field-level normalisation of Claude's job-analysis reply.

Split out of :mod:`job_analysis_service` (above the 500-LOC no-growth line).
Each helper coerces one part of the envelope to the stored shape: out-of-enum
values fall back to the dimension's "no signal" status instead of failing the
whole analysis, and list / text lengths are capped.
"""
from __future__ import annotations

from typing import Any

from app.services.job_analysis._job_analysis_utils import (
    _SALARY_PERIOD_MAP,
    _VALID_REMOTE_TYPE,
    _safe_float,
    _str_or_none,
)

_DIMENSION_KEYS: tuple[str, ...] = (
    "skill_match",
    "seniority",
    "salary",
    "location_remote",
    "work_auth",
)

_DIMENSION_STATUS: dict[str, frozenset[str]] = {
    "skill_match": frozenset(("strong", "partial", "gap", "unclear")),
    "seniority": frozenset(("aligned", "below", "above", "unclear")),
    "salary": frozenset(
        ("above_target", "in_range", "below_target", "not_disclosed", "no_target"),
    ),
    "location_remote": frozenset(
        ("compatible", "stretch", "incompatible", "unclear"),
    ),
    "work_auth": frozenset(("compatible", "blocker", "unclear")),
}

# Cap red/green flag list lengths server-side too — defensive against
# prompt-injection that inflates the array beyond what the UI handles.
_MAX_FLAGS = 5

# Cap rationale length per dimension. The model is asked for 1-2
# sentences; cap at 600 chars to keep payload size predictable.
_MAX_RATIONALE_CHARS = 600


def validate_extracted(raw: Any) -> dict:
    """Coerce the extracted block to the JobAnalysisExtracted shape."""
    if not isinstance(raw, dict):
        return {
            "title": None,
            "company": None,
            "location": None,
            "remote_type": None,
            "posted_salary_min": None,
            "posted_salary_max": None,
            "posted_salary_currency": None,
            "posted_salary_period": None,
            "summary": None,
        }
    remote = _str_or_none(raw.get("remote_type"))
    if remote not in _VALID_REMOTE_TYPE:
        remote = None
    period = _str_or_none(raw.get("posted_salary_period"))
    if period not in _SALARY_PERIOD_MAP:
        period = None
    currency = _str_or_none(raw.get("posted_salary_currency"))
    if currency:
        currency = currency[:3].upper()
    return {
        "title": _str_or_none(raw.get("title")),
        "company": _str_or_none(raw.get("company")),
        "location": _str_or_none(raw.get("location")),
        "remote_type": remote,
        "posted_salary_min": _safe_float(raw.get("posted_salary_min")),
        "posted_salary_max": _safe_float(raw.get("posted_salary_max")),
        "posted_salary_currency": currency,
        "posted_salary_period": period,
        "summary": _str_or_none(raw.get("summary")),
    }


def validate_dimensions(raw: Any) -> list[dict]:
    """Validate the dimensions array against the fixed key order.

    Builds a key→row map from whatever Claude returned, then emits one
    row per expected key in the canonical order. Missing keys produce
    a row with status='unclear' and a generic rationale.
    """
    found: dict[str, dict] = {}
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            key = _str_or_none(item.get("key"))
            if key in _DIMENSION_STATUS:
                status_raw = _str_or_none(item.get("status"))
                rationale = _str_or_none(item.get("rationale")) or ""
                if rationale and len(rationale) > _MAX_RATIONALE_CHARS:
                    rationale = rationale[: _MAX_RATIONALE_CHARS - 1] + "…"
                allowed = _DIMENSION_STATUS[key]
                if status_raw not in allowed:
                    status_raw = _fallback_status_for(key)
                found[key] = {
                    "key": key,
                    "status": status_raw,
                    "rationale": rationale,
                }

    out: list[dict] = []
    for key in _DIMENSION_KEYS:
        row = found.get(key)
        if row is None:
            out.append(
                {
                    "key": key,
                    "status": _fallback_status_for(key),
                    "rationale": (
                        "Insufficient signal in the JD or profile to assess this dimension."
                    ),
                }
            )
        else:
            out.append(row)
    return out


def _fallback_status_for(key: str) -> str:
    """Return the safest 'no signal' status for a given dimension."""
    if key == "salary":
        return "not_disclosed"
    return "unclear"


def flag_list(raw: Any) -> list[str]:
    """Coerce a value to a bounded list of short strings."""
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        cleaned = item.strip()
        if not cleaned:
            continue
        if len(cleaned) > 200:
            cleaned = cleaned[:199] + "…"
        out.append(cleaned)
        if len(out) >= _MAX_FLAGS:
            break
    return out
