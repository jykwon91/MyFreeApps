"""Coercion of untrusted model numbers (photo import and discovery drafts).

Both extraction paths hand the user an editable draft that is later saved
through ``RecipeCreateRequest``. A value the save would reject (non-finite, or
over the field's maximum) would surface as a "too large" error the user did not
cause, so it is set to null instead: a blank is better than an invented number.
Only the fact that a value was dropped is logged, never the value itself.
"""
from __future__ import annotations

import logging
import math
import re
from fractions import Fraction
from typing import Any

from app.schemas.recipe.version_schemas import INGREDIENT_QUANTITY_MAX, RECIPE_MINUTES_MAX

logger = logging.getLogger(__name__)


def _in_range(number: float, maximum: float, kind: str) -> bool:
    if math.isfinite(number) and 0 <= number <= maximum:
        return True
    logger.warning("Draft value out of range, set to null: kind=%s", kind)
    return False


def coerce_minutes(value: Any, maximum: int = RECIPE_MINUTES_MAX) -> int | None:
    if isinstance(value, bool):  # bool is an int subclass — reject explicitly
        return None
    if isinstance(value, str):
        match = re.match(r"\s*(\d+)", value)  # leading integer, e.g. "30 min"
        if not match:
            return None
        value = int(match.group(1))
    if not isinstance(value, (int, float)) or value < 0:
        return None
    try:
        number = int(value)
    except (OverflowError, ValueError):  # inf / NaN
        logger.warning("Draft value out of range, set to null: kind=minutes")
        return None
    return number if _in_range(number, maximum, "minutes") else None


def coerce_quantity(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    number = _parse_number(value)
    if number is None or number < 0:
        return None
    return number if _in_range(number, INGREDIENT_QUANTITY_MAX, "quantity") else None


def _parse_number(value: Any) -> float | None:
    try:
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, str) or not value.strip():
            return None
        text = value.strip()
        try:  # plain decimal, e.g. "1.5"
            return float(text)
        except ValueError:
            # fraction or mixed number, e.g. "1/2" or "1 1/2"
            return float(sum(Fraction(part) for part in text.split()))
    except (ValueError, ZeroDivisionError):
        return None
    except OverflowError:  # an integer too big for a float
        return math.inf
