"""How long one Claude call may keep retrying an Anthropic rate limit (429)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClaudeRetryPolicy:
    """Passed to the shared ``create_with_backoff``.

    ``max_attempts`` is the total number of requests; ``max_wait_seconds`` is
    the most the call may sleep in total on the shared throttle and between
    429 retries (``None`` is unbounded).
    """

    max_attempts: int
    max_wait_seconds: float | None
