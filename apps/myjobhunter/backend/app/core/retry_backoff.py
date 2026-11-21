"""When a worker job that hit a temporary failure may run again."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def next_retry_at(retry_count: int, base_seconds: int) -> datetime:
    """Now plus ``base_seconds * 2**retry_count`` (exponential backoff)."""
    return datetime.now(timezone.utc) + timedelta(seconds=base_seconds * (2 ** retry_count))
