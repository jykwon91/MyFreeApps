"""Tests for platform_shared.extraction.backoff.

Covers the pre-extraction retry contract: success resets the 429
counter, 429s retry with the on_rate_limit hook firing each attempt and
re-raise after max_attempts, non-429 API errors propagate unchanged
(log-and-reraise per check-third-party-error-codes.md), and a failing
on_rate_limit hook never breaks the backoff.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import anthropic
import httpx
import pytest

from platform_shared.extraction import backoff
from platform_shared.extraction.backoff import (
    RateLimitEvent,
    ThrottleState,
    create_with_backoff,
    throttle,
)


@pytest.fixture(autouse=True)
def _reset_throttle() -> None:
    """The throttle is a process-global; isolate every test."""
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0
    yield
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0


def _rate_limit_error(retry_after: str = "0") -> anthropic.RateLimitError:
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(429, headers={"retry-after": retry_after}, request=req)
    return anthropic.RateLimitError("rate limited", response=resp, body=None)


def _server_error() -> anthropic.InternalServerError:
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(500, request=req)
    return anthropic.InternalServerError("boom", response=resp, body=None)


class TestThrottleState:
    def test_defaults(self) -> None:
        s = ThrottleState()
        assert s.consecutive_429s == 0
        assert s.resume_at == 0.0


class TestCreateWithBackoff:
    async def test_success_returns_message_and_resets_counter(self) -> None:
        throttle.consecutive_429s = 3
        client = MagicMock()
        sentinel = MagicMock()
        client.messages.create = AsyncMock(return_value=sentinel)

        result = await create_with_backoff(client, model="m", max_tokens=10)

        assert result is sentinel
        assert throttle.consecutive_429s == 0
        client.messages.create.assert_awaited_once_with(model="m", max_tokens=10)

    async def test_429_retries_then_reraises_and_fires_hook(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error())
        events: list[RateLimitEvent] = []

        async def on_rl(evt: RateLimitEvent) -> None:
            events.append(evt)

        with pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(
                client, on_rate_limit=on_rl, max_attempts=2, model="m", max_tokens=10
            )

        assert client.messages.create.await_count == 2
        assert [e.attempt for e in events] == [1, 2]
        assert events[-1].max_attempts == 2
        assert throttle.consecutive_429s == 2

    async def test_429_then_success(self) -> None:
        client = MagicMock()
        ok = MagicMock()
        client.messages.create = AsyncMock(side_effect=[_rate_limit_error(), ok])

        result = await create_with_backoff(client, max_attempts=3, model="m", max_tokens=1)

        assert result is ok
        assert throttle.consecutive_429s == 0  # reset on success

    async def test_non_429_propagates_unchanged_without_retry(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_server_error())

        with pytest.raises(anthropic.InternalServerError):
            await create_with_backoff(client, max_attempts=5, model="m", max_tokens=1)

        # log-and-reraise: NOT retried (only 429 retries)
        assert client.messages.create.await_count == 1

    async def test_failing_hook_does_not_break_backoff(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error())

        async def bad_hook(_evt: RateLimitEvent) -> None:
            raise RuntimeError("telemetry down")

        # Hook raising must not mask the eventual RateLimitError re-raise.
        with pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(
                client, on_rate_limit=bad_hook, max_attempts=2, model="m", max_tokens=1
            )
        assert client.messages.create.await_count == 2
