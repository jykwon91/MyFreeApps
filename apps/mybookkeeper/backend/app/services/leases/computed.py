"""Whitelisted computed-expression DSL for lease placeholders.

Supports exactly these forms:
- ``(KEY_A - KEY_B).days`` — date diff in days (both keys must be type=date)
- ``(KEY_A + KEY_B)`` — string concatenation
- ``today`` — current date

Anything else raises ``ComputedExprError`` at parse time. There is NO
``eval()`` involved — the parser is a hand-rolled regex matcher.
"""
from __future__ import annotations

import datetime as _dt
import re
from typing import Final

# (KEY_A - KEY_B).days
# Keys may contain letters, digits, underscores, spaces, and dashes — but the
# operator dash must be unambiguous, so we anchor it as ``\s+-\s+`` (dash
# surrounded by whitespace) to distinguish from intra-key dashes like
# ``MOVE-OUT DATE``.
_DIFF_DAYS_RE: Final = re.compile(
    r"^\s*\(\s*([A-Z][A-Z0-9_ \-]*?)\s+-\s+([A-Z][A-Z0-9_ \-]*?)\s*\)\s*\.\s*days\s*$",
)
# (KEY_A + KEY_B) — same whitespace-anchored operator rule.
_CONCAT_RE: Final = re.compile(
    r"^\s*\(\s*([A-Z][A-Z0-9_ \-]*?)\s+\+\s+([A-Z][A-Z0-9_ \-]*?)\s*\)\s*$",
)
# today
_TODAY_RE: Final = re.compile(r"^\s*today\s*$")


class ComputedExprError(ValueError):
    """Raised when a computed expression is malformed or references unknown keys."""


def _normalise_key(raw: str) -> str:
    return re.sub(r"\s+", " ", raw.strip())


def validate_expr(expr: str) -> None:
    """Raise ``ComputedExprError`` iff ``expr`` is not in the allowlisted DSL."""
    if not expr or not isinstance(expr, str):
        raise ComputedExprError("Computed expression must be a non-empty string")
    if (
        _DIFF_DAYS_RE.match(expr) is None
        and _CONCAT_RE.match(expr) is None
        and _TODAY_RE.match(expr) is None
    ):
        raise ComputedExprError(
            "Unsupported computed expression. Allowed forms: "
            "'(A - B).days', '(A + B)', 'today'"
        )


def evaluate(
    expr: str,
    values: dict[str, object],
    *,
    today: _dt.date | None = None,
) -> str:
    """Evaluate ``expr`` against ``values`` and return a string suitable for substitution.

    Raises ``ComputedExprError`` for malformed expressions or missing values.
    """
    validate_expr(expr)
    today = today or _dt.date.today()

    if _TODAY_RE.match(expr):
        return today.isoformat()

    diff = _DIFF_DAYS_RE.match(expr)
    if diff:
        a_key = _normalise_key(diff.group(1))
        b_key = _normalise_key(diff.group(2))
        a = _coerce_date(values.get(a_key), a_key)
        b = _coerce_date(values.get(b_key), b_key)
        return str((a - b).days)

    concat = _CONCAT_RE.match(expr)
    if concat:
        a_key = _normalise_key(concat.group(1))
        b_key = _normalise_key(concat.group(2))
        a_val = values.get(a_key)
        b_val = values.get(b_key)
        if a_val is None or b_val is None:
            raise ComputedExprError(
                f"Concat needs both '{a_key}' and '{b_key}' to be set"
            )
        return f"{a_val}{b_val}"

    # validate_expr already covers this branch — defensive.
    raise ComputedExprError(f"Unreachable: unsupported expression {expr!r}")


def _coerce_date(value: object, key: str) -> _dt.date:
    if value is None:
        raise ComputedExprError(f"Missing value for date key '{key}'")
    if isinstance(value, _dt.date) and not isinstance(value, _dt.datetime):
        return value
    if isinstance(value, _dt.datetime):
        return value.date()
    if isinstance(value, str):
        try:
            return _dt.date.fromisoformat(value)
        except ValueError as exc:
            raise ComputedExprError(
                f"Value for '{key}' is not a valid ISO date: {value!r}"
            ) from exc
    raise ComputedExprError(
        f"Value for '{key}' must be a date, got {type(value).__name__}"
    )
