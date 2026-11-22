"""Tests for platform_shared.extraction.backoff.

Covers the pre-extraction retry contract: success resets the 429
counter, 429s retry with the on_rate_limit hook firing each attempt and
re-raise after max_attempts, non-429 API errors propagate unchanged
(log-and-reraise per check-third-party-error-codes.md), and a failing
on_rate_limit hook never breaks the backoff.
"""
from __future__ import annotations

import logging
import time
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx
import pytest

from platform_shared.extraction import AnthropicFailureKind, RateLimitPausedError, backoff
from platform_shared.extraction.backoff import (
    rate_limit_pause_seconds,
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


def _overloaded_error() -> anthropic.InternalServerError:
    req = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    resp = httpx.Response(529, request=req, headers={"request-id": "req_011abc"})
    body = {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}
    return anthropic.InternalServerError("Overloaded", response=resp, body=body)


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
        assert [e.will_retry for e in events] == [True, False]
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


class TestNonRateLimitErrorLogging:
    async def test_logs_real_status_error_type_and_request_id(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_overloaded_error())

        with caplog.at_level(logging.WARNING, logger=backoff.__name__):
            with pytest.raises(anthropic.InternalServerError):
                await create_with_backoff(client, model="m", max_tokens=1)

        message = caplog.records[-1].getMessage()
        assert "type=overloaded_error" in message
        assert "status=529" in message
        assert "request_id=req_011abc" in message


class TestWaitBudget:
    async def test_429_over_budget_reraises_without_sleeping(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error("30"))
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep), pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(client, max_wait_seconds=0, model="m", max_tokens=1)

        assert client.messages.create.await_count == 1
        sleep.assert_not_awaited()
        # The throttle still records the wait, so the next caller holds off.
        assert throttle.resume_at > time.monotonic() + 20

    async def test_429_within_budget_sleeps_and_retries(self) -> None:
        client = MagicMock()
        ok = MagicMock()
        client.messages.create = AsyncMock(side_effect=[_rate_limit_error("30"), ok])
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep):
            result = await create_with_backoff(client, max_wait_seconds=45, model="m", max_tokens=1)

        assert result is ok
        sleep.assert_awaited_once_with(30.0)

    async def test_budget_counts_every_sleep(self) -> None:
        # 30s fits a 45s budget once; the second 30s wait would overrun it.
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error("30"))
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep), pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(client, max_wait_seconds=45, model="m", max_tokens=1)

        assert client.messages.create.await_count == 2
        sleep.assert_awaited_once_with(30.0)

    async def test_throttle_longer_than_the_budget_raises_without_calling_the_api(self) -> None:
        throttle.resume_at = time.monotonic() + 300
        client = MagicMock()
        client.messages.create = AsyncMock(return_value=MagicMock())
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep), pytest.raises(RateLimitPausedError) as raised:
            await create_with_backoff(client, max_wait_seconds=10, model="m", max_tokens=1)

        client.messages.create.assert_not_awaited()
        sleep.assert_not_awaited()
        assert raised.value.kind is AnthropicFailureKind.RATE_LIMITED
        assert raised.value.is_transient is True
        assert 295 < raised.value.retry_after_seconds <= 300

    async def test_zero_budget_raises_while_any_throttle_is_left(self) -> None:
        throttle.resume_at = time.monotonic() + 5
        client = MagicMock()
        client.messages.create = AsyncMock(return_value=MagicMock())

        with pytest.raises(RateLimitPausedError):
            await create_with_backoff(client, max_wait_seconds=0, model="m", max_tokens=1)

        client.messages.create.assert_not_awaited()

    async def test_throttle_within_the_budget_is_waited_out(self) -> None:
        throttle.resume_at = time.monotonic() + 5
        client = MagicMock()
        ok = MagicMock()
        client.messages.create = AsyncMock(return_value=ok)
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep):
            result = await create_with_backoff(client, max_wait_seconds=10, model="m", max_tokens=1)

        assert result is ok
        sleep.assert_awaited_once()
        assert 4 < sleep.await_args.args[0] <= 5

    async def test_without_a_budget_the_whole_throttle_is_waited_out(self) -> None:
        """The default every other app uses is unchanged: wait, then call."""
        throttle.resume_at = time.monotonic() + 300
        client = MagicMock()
        ok = MagicMock()
        client.messages.create = AsyncMock(return_value=ok)
        sleep = AsyncMock()

        with patch.object(backoff.asyncio, "sleep", sleep):
            result = await create_with_backoff(client, model="m", max_tokens=1)

        assert result is ok
        assert 295 < sleep.await_args.args[0] <= 300
        client.messages.create.assert_awaited_once()

    async def test_a_429_over_budget_tells_the_hook_it_is_not_retried(self) -> None:
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error("30"))
        events: list[RateLimitEvent] = []

        async def on_rl(evt: RateLimitEvent) -> None:
            events.append(evt)

        with pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(client, on_rate_limit=on_rl, max_wait_seconds=0, model="m", max_tokens=1)

        assert [(e.attempt, e.will_retry) for e in events] == [(1, False)]


class TestRateLimitPause:
    def test_no_pause_without_a_rate_limit(self) -> None:
        throttle.resume_at = 0.0
        assert rate_limit_pause_seconds() == 0.0

    async def test_a_429_sets_the_pause_a_queue_waits_out(self) -> None:
        throttle.resume_at = 0.0
        client = MagicMock()
        client.messages.create = AsyncMock(side_effect=_rate_limit_error("30"))

        with pytest.raises(anthropic.RateLimitError):
            await create_with_backoff(client, max_wait_seconds=0, model="m", max_tokens=1)

        assert 25 < rate_limit_pause_seconds() <= 30
