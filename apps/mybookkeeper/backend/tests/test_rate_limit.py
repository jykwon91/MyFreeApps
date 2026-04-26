"""Tests for the in-memory rate limiter."""
import pytest
from fastapi import HTTPException

from app.core.rate_limit import RateLimiter


class TestRateLimiter:
    def test_allows_up_to_max(self) -> None:
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            limiter.check("ip1")

    def test_blocks_after_max(self) -> None:
        limiter = RateLimiter(max_attempts=3, window_seconds=60)
        for _ in range(3):
            limiter.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("ip1")
        assert exc_info.value.status_code == 429

    def test_independent_keys(self) -> None:
        limiter = RateLimiter(max_attempts=2, window_seconds=60)
        limiter.check("ip1")
        limiter.check("ip1")
        # ip2 should still be allowed
        limiter.check("ip2")

    def test_single_attempt_limit(self) -> None:
        limiter = RateLimiter(max_attempts=1, window_seconds=60)
        limiter.check("ip1")
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("ip1")
        assert exc_info.value.status_code == 429


class TestRateLimiterExpiry:
    def test_expired_entries_cleaned(self) -> None:
        limiter = RateLimiter(max_attempts=1, window_seconds=0)
        # With window=0 all entries expire immediately
        limiter.check("ip1")
        # Next call should succeed because the window already passed
        limiter.check("ip1")
