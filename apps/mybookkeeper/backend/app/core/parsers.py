import json
from datetime import datetime
from decimal import Decimal, InvalidOperation


def safe_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def safe_decimal(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value)
    except (InvalidOperation, TypeError):
        return None


def to_decimal(raw: object) -> Decimal | None:
    """Decimal for a number or numeric string (zero is None, as in safe_decimal).
    A bool is a checkbox, never 1 or 0."""
    if isinstance(raw, bool):
        return None
    if isinstance(raw, str):
        return safe_decimal(raw)
    if isinstance(raw, (int, float, Decimal)):
        return safe_decimal(raw)  # type: ignore[arg-type]
    return None


def to_text(raw: object) -> str:
    """Text for storage: JSON for structures (not a Python repr), str otherwise."""
    if isinstance(raw, (dict, list)):
        return json.dumps(raw)
    return str(raw)
