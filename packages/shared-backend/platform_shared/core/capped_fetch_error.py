"""The error :func:`platform_shared.core.capped_fetch.fetch_capped` raises."""
from __future__ import annotations

from platform_shared.core.capped_fetch_failure_reason import CappedFetchFailureReason


class CappedFetchError(Exception):
    """A user-supplied URL could not be fetched within its limits.

    Carries the host only, never the full URL: some of these URLs are
    secrets (a private calendar feed link is a bearer credential), so the
    message is safe to log or to store for the user to read.
    """

    def __init__(
        self,
        reason: CappedFetchFailureReason,
        *,
        host: str,
        status_code: int | None = None,
    ) -> None:
        self.reason: CappedFetchFailureReason = reason
        self.host = host
        self.status_code = status_code
        detail = f"HTTP {status_code}" if status_code is not None else reason
        super().__init__(f"fetch from {host or 'unknown host'} failed: {detail}")
