"""The JSON schema the savings research reply must follow (``output_config.format``).

Structured outputs can't enforce numeric or length bounds, so
``savings_idea_mapper`` clamps every value; the schema fixes the shape and
the enums.
"""
from typing import Any

from app.core.savings_enums import IDEA_CATEGORIES, IDEA_EFFORTS


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    return {"anyOf": [schema, {"type": "null"}]}


_INT = {"type": "integer"}
_STR = {"type": "string"}

_CARD_DETAILS: dict[str, Any] = {
    "type": "object",
    "properties": {
        "sign_up_bonus": _STR,
        "minimum_spend_dollars": _nullable(_INT),
        "spend_window_months": _nullable(_INT),
        "annual_fee_dollars": _nullable(_INT),
        "first_year_value_dollars": _nullable(_INT),
        "credit_impact": _STR,
    },
    "required": [
        "sign_up_bonus",
        "minimum_spend_dollars",
        "spend_window_months",
        "annual_fee_dollars",
        "first_year_value_dollars",
        "credit_impact",
    ],
    "additionalProperties": False,
}

_IDEA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": list(IDEA_CATEGORIES)},
        "subject": _STR,
        "title": _STR,
        "savings_low_dollars": _INT,
        "savings_high_dollars": _INT,
        "effort": {"type": "string", "enum": list(IDEA_EFFORTS)},
        "why_it_fits": _STR,
        "steps": {"type": "array", "items": _STR},
        "source_urls": {"type": "array", "items": _STR},
        "expires_on": _nullable({"type": "string", "format": "date"}),
        "card_details": _nullable(_CARD_DETAILS),
    },
    "required": [
        "category",
        "subject",
        "title",
        "savings_low_dollars",
        "savings_high_dollars",
        "effort",
        "why_it_fits",
        "steps",
        "source_urls",
        "expires_on",
        "card_details",
    ],
    "additionalProperties": False,
}

SAVINGS_REPLY_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {"ideas": {"type": "array", "items": _IDEA}},
    "required": ["ideas"],
    "additionalProperties": False,
}
