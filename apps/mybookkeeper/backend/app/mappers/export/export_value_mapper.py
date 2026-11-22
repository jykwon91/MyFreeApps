"""Converts one stored column value into its JSON form for the account data export."""
import enum
import ipaddress
import uuid
from datetime import date, datetime, time
from decimal import Decimal

from app.mappers.export.json_value import JsonValue

_JSON_SCALARS = (str, int, float, bool)
_IP_TYPES = (ipaddress.IPv4Address, ipaddress.IPv6Address, ipaddress.IPv4Network, ipaddress.IPv6Network)


def to_export_value(value: object) -> JsonValue:
    """Return ``value`` as JSON: ids, money and timestamps become strings.

    Money stays a string so no cents are lost to float rounding. An unknown
    type raises instead of being guessed at, so a new column type is noticed.
    """
    if value is None:
        return None
    if isinstance(value, enum.Enum):
        return to_export_value(value.value)
    if isinstance(value, _JSON_SCALARS):
        return value
    if isinstance(value, (uuid.UUID, Decimal, *_IP_TYPES)):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [to_export_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_export_value(item) for key, item in value.items()}
    raise TypeError(f"No export conversion for {type(value).__name__}")
