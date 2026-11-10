"""Timezone-aware datetime helpers."""
from datetime import datetime, timezone


def require_aware_utc(value: datetime, *, name: str) -> datetime:
    """Return ``value`` converted to UTC; raise if it carries no timezone.

    A naive datetime's zone is a guess, so comparing it against a UTC
    instant would silently be off by the host's offset (or raise a
    ``TypeError`` deep inside the comparison). ``name`` labels the error.

    Raises:
        ValueError: If ``value`` is naive.
    """
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be timezone-aware, got naive {value.isoformat()}")
    return value.astimezone(timezone.utc)


__all__ = ["require_aware_utc"]
