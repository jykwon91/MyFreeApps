"""Remember that a government feed just failed, so callers fail fast.

Process-local and holds only the failure reason string, never user data. Each
client owns one instance, so the sources stay independent.
"""
from __future__ import annotations

import time

from app.core.government_feed_constants import FEED_FAILURE_CACHE_TTL_SECONDS


class FeedFailureCache:
    def __init__(self) -> None:
        self._failures: dict[str, tuple[float, str]] = {}

    def recent_failure(self, key: str) -> str | None:
        """The reason ``key`` failed within the TTL, or None if it may be retried."""
        entry = self._failures.get(key)
        if entry is None:
            return None
        recorded_at, reason = entry
        if (time.monotonic() - recorded_at) >= FEED_FAILURE_CACHE_TTL_SECONDS:
            del self._failures[key]
            return None
        return reason

    def record(self, key: str, reason: str) -> None:
        self._failures[key] = (time.monotonic(), reason)

    def clear(self, key: str) -> None:
        self._failures.pop(key, None)

    def reset(self) -> None:
        self._failures.clear()
