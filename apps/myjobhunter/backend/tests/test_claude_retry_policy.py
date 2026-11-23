"""Claude rate limits: a user's request fails fast, a background worker waits it out.

Every Claude call goes through the shared ``create_with_backoff`` with a
``ClaudeRetryPolicy``. Request paths (parse-jd, extract-from-url, job
analysis, company research, refinement turns) use the short policy, so a 429
answers "busy, try again" with Retry-After instead of holding the request
for minutes. Workers (resume parse, refinement preparation, discovery
scoring) use the long one. The SDK's own retries are off so they don't
stack on the backoff's.
"""
from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pytest
from platform_shared.extraction import (
    AnthropicFailureKind,
    ExtractionError,
    RateLimitPausedError,
    throttle,
)

from app.core.ai_failure_messages import AI_BUSY_MESSAGE, AI_RETRY_AFTER_SECONDS
from app.core.claude_retry_constants import (
    CLAUDE_SDK_MAX_RETRIES,
    REQUEST_PATH_CLAUDE_RETRY,
    WORKER_CLAUDE_RETRY,
)
from app.services.application import jd_parsing_service
from app.services.extraction import claude_service, jd_url_parser
from app.services.resume_refinement import critique_service
from app.services.resume_refinement.errors import CritiqueRetryExceeded

_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
_PROVIDER_TEXT = "provider detail: org quota for claude-x exhausted"
_BACKOFF_LOGGER = "platform_shared.extraction.backoff"
_SAMPLE_JD = (
    "Senior Backend Engineer at Acme. Python, Postgres, Kubernetes. "
    "Remote in the US. $180k-$220k per year."
)


def _rate_limited(retry_after: str | None = None) -> anthropic.RateLimitError:
    headers = {"retry-after": retry_after} if retry_after is not None else {}
    response = httpx2.Response(429, request=_REQUEST, headers=headers)
    body = {"type": "error", "error": {"type": "rate_limit_error", "message": _PROVIDER_TEXT}}
    return anthropic.RateLimitError(_PROVIDER_TEXT, response=response, body=body)


def _overloaded() -> anthropic.APIStatusError:
    response = httpx2.Response(529, request=_REQUEST, headers={"request-id": "req_overloaded_1"})
    body = {"type": "error", "error": {"type": "overloaded_error", "message": _PROVIDER_TEXT}}
    return anthropic.InternalServerError(_PROVIDER_TEXT, response=response, body=body)


def _reply(text: str = '{"ok": true}') -> MagicMock:
    message = MagicMock(spec=anthropic.types.Message)
    message.content = [MagicMock(type="text", text=text)]
    message.usage = MagicMock(input_tokens=10, output_tokens=20)
    message.model = "claude-sonnet-4-6"
    message.stop_reason = "end_turn"
    return message


def _sdk(create: AsyncMock) -> Any:
    return patch.object(
        claude_service, "_get_client", return_value=MagicMock(messages=MagicMock(create=create)),
    )


@pytest.fixture(autouse=True)
def _reset_shared_throttle() -> Iterator[None]:
    """A 429 arms the process-global throttle; don't let it leak into other tests."""
    yield
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0


@pytest.fixture
def no_usage_log() -> Iterator[None]:
    with patch.object(claude_service, "_record_log", new=AsyncMock()):
        yield


async def _call(policy: Any) -> dict:
    return await claude_service.call_claude(
        system_prompt="p", user_content="u", context_type="test",
        user_id=uuid.uuid4(), retry_policy=policy,
    )


# ---------------------------------------------------------------------------
# The client
# ---------------------------------------------------------------------------


def test_client_turns_off_sdk_retries() -> None:
    """The shared backoff is the only retry loop; the SDK's would stack on it."""
    saved = claude_service._client
    claude_service._client = None
    try:
        client = claude_service._get_client()
        assert client.max_retries == CLAUDE_SDK_MAX_RETRIES == 0
    finally:
        claude_service._client = saved


# ---------------------------------------------------------------------------
# Request path: fail fast
# ---------------------------------------------------------------------------


class TestRequestPathFailsFast:
    @pytest.mark.asyncio
    async def test_429_with_no_short_retry_after_raises_without_sleeping(
        self, no_usage_log: None,
    ) -> None:
        create = AsyncMock(side_effect=_rate_limited())
        sleep = AsyncMock()
        with _sdk(create), patch("asyncio.sleep", new=sleep), pytest.raises(ExtractionError) as exc:
            await _call(REQUEST_PATH_CLAUDE_RETRY)

        assert create.await_count == 1
        sleep.assert_not_awaited()
        assert exc.value.kind is AnthropicFailureKind.RATE_LIMITED

    @pytest.mark.asyncio
    async def test_429_asking_for_a_short_wait_is_retried_once(self, no_usage_log: None) -> None:
        create = AsyncMock(side_effect=[_rate_limited("2"), _reply()])
        sleep = AsyncMock()
        with _sdk(create), patch("asyncio.sleep", new=sleep):
            assert await _call(REQUEST_PATH_CLAUDE_RETRY) == {"ok": True}

        assert create.await_count == 2
        sleep.assert_awaited_once_with(2.0)

    @pytest.mark.asyncio
    async def test_a_long_shared_throttle_is_not_waited_out(self, no_usage_log: None) -> None:
        """An earlier 429 asked for a long pause: no request is sent at all."""
        throttle.resume_at = time.monotonic() + 120
        create = AsyncMock(return_value=_reply())
        with _sdk(create), pytest.raises(RateLimitPausedError) as exc:
            await _call(REQUEST_PATH_CLAUDE_RETRY)

        create.assert_not_awaited()
        assert exc.value.kind is AnthropicFailureKind.RATE_LIMITED

    @pytest.mark.asyncio
    @pytest.mark.timeout(15)
    async def test_parse_jd_route_answers_busy_with_retry_after_at_once(
        self, user_factory: Any, as_user: Any,
    ) -> None:
        """No sleep is patched: on the old (long) policy this would wait 60 s and time out."""
        user = await user_factory()
        create = AsyncMock(side_effect=_rate_limited())
        with _sdk(create):
            async with await as_user(user) as authed:
                resp = await authed.post("/applications/parse-jd", json={"jd_text": _SAMPLE_JD})

        assert resp.status_code == 502, resp.text
        assert resp.json()["detail"] == AI_BUSY_MESSAGE
        assert resp.headers["retry-after"] == str(AI_RETRY_AFTER_SECONDS)
        assert _PROVIDER_TEXT not in resp.text
        assert create.await_count == 1


# ---------------------------------------------------------------------------
# Worker path: wait it out
# ---------------------------------------------------------------------------


class TestWorkerPathWaitsItOut:
    @pytest.mark.asyncio
    async def test_resume_parse_retries_with_the_long_backoff(self, no_usage_log: None) -> None:
        create = AsyncMock(side_effect=[_rate_limited()] * 4 + [_reply('{"skills": ["Python"]}')])
        sleep = AsyncMock()
        with _sdk(create), patch("asyncio.sleep", new=sleep):
            result = await claude_service.extract_resume("Resume text", uuid.uuid4(), uuid.uuid4())

        assert result["skills"] == ["Python"]
        assert create.await_count == WORKER_CLAUDE_RETRY.max_attempts == 5
        assert [c.args[0] for c in sleep.await_args_list] == [60, 120, 240, 480]


# ---------------------------------------------------------------------------
# Non-429 errors are logged by their codes, never the provider's text
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_429_error_is_logged_with_its_codes(
    no_usage_log: None, caplog: pytest.LogCaptureFixture,
) -> None:
    create = AsyncMock(side_effect=_overloaded())
    with (
        caplog.at_level(logging.WARNING, logger=_BACKOFF_LOGGER),
        _sdk(create),
        pytest.raises(ExtractionError) as exc,
    ):
        await _call(REQUEST_PATH_CLAUDE_RETRY)

    assert exc.value.kind is AnthropicFailureKind.UPSTREAM
    assert create.await_count == 1
    backoff_log = " ".join(r.getMessage() for r in caplog.records if r.name == _BACKOFF_LOGGER)
    assert "type=overloaded_error status=529 request_id=req_overloaded_1" in backoff_log
    assert _PROVIDER_TEXT not in caplog.text


# ---------------------------------------------------------------------------
# Each caller states the policy that fits who is waiting
# ---------------------------------------------------------------------------


class TestCallersPassTheirPolicy:
    @pytest.mark.asyncio
    async def test_parse_jd_uses_the_request_policy(self) -> None:
        spy = AsyncMock(return_value={})
        with patch.object(claude_service, "call_claude", spy):
            await jd_parsing_service.parse_jd(_SAMPLE_JD, uuid.uuid4())
        assert spy.await_args.kwargs["retry_policy"] is REQUEST_PATH_CLAUDE_RETRY

    @pytest.mark.asyncio
    async def test_extract_from_url_fallback_uses_the_request_policy(self) -> None:
        spy = AsyncMock(return_value={})
        with patch.object(claude_service, "call_claude", spy):
            await jd_url_parser.claude_fallback(
                visible_text=_SAMPLE_JD, source_url="https://example.com/job", user_id=uuid.uuid4(),
            )
        assert spy.await_args.kwargs["retry_policy"] is REQUEST_PATH_CLAUDE_RETRY

    @pytest.mark.asyncio
    async def test_refinement_critique_uses_the_worker_policy(self) -> None:
        spy = AsyncMock(return_value={
            "parsed": {"targets": []}, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0,
        })
        with (
            patch.object(critique_service, "call_claude_with_meta", spy),
            pytest.raises(CritiqueRetryExceeded),
        ):
            await critique_service.run_critique(
                resume_markdown="# Resume", user_id=uuid.uuid4(), session_id=uuid.uuid4(),
            )
        assert spy.await_args.kwargs["retry_policy"] is WORKER_CLAUDE_RETRY
