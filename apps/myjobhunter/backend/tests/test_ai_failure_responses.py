"""What users see when Claude fails behind an AI endpoint.

Each test runs the real service code down to the Anthropic SDK and fakes
only the SDK client, so it covers the whole path: the shared classification,
the service error, and the HTTP answer. A temporary failure (busy, timed
out, unreachable) is a 502 with ``Retry-After``; a failure no retry can fix
is a 502 without it. The detail is always our own copy, never the
provider's error text.
"""
from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pytest
from platform_shared.extraction import AnthropicFailureKind, ExtractionError

from app.core.claude_retry_constants import REQUEST_PATH_CLAUDE_RETRY
from app.core.ai_failure_messages import (
    AI_BUSY_MESSAGE,
    AI_RETRY_AFTER_SECONDS,
    AI_UNAVAILABLE_MESSAGE,
)
from app.core.job_failure_messages import JOB_ANALYSIS_FAILED_MESSAGE
from app.services.extraction import claude_service

_PROVIDER_TEXT = "provider detail: org quota for claude-x exhausted"
_REQUEST = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
_SAMPLE_JD = (
    "Senior Backend Engineer at Acme. Python, Postgres, Kubernetes. "
    "Remote in the US. $180k-$220k per year."
)


def _status_error(
    cls: type[anthropic.APIStatusError], status: int, error_type: str,
) -> anthropic.APIStatusError:
    response = httpx2.Response(status, request=_REQUEST)
    body = {"type": "error", "error": {"type": error_type, "message": _PROVIDER_TEXT}}
    return cls(_PROVIDER_TEXT, response=response, body=body)


def _overloaded() -> anthropic.APIStatusError:
    return _status_error(anthropic.InternalServerError, 529, "overloaded_error")


def _bad_key() -> anthropic.APIStatusError:
    return _status_error(anthropic.AuthenticationError, 401, "authentication_error")


def _sdk_raising(error: Exception) -> Iterator[None]:
    client = MagicMock()
    client.messages.create = AsyncMock(side_effect=error)
    return patch.object(claude_service, "_get_client", return_value=client)


def _assert_busy(resp: Any) -> None:
    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == AI_BUSY_MESSAGE
    assert resp.headers["retry-after"] == str(AI_RETRY_AFTER_SECONDS)
    assert _PROVIDER_TEXT not in resp.text


def _assert_unavailable(resp: Any) -> None:
    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == AI_UNAVAILABLE_MESSAGE
    assert "retry-after" not in resp.headers
    assert _PROVIDER_TEXT not in resp.text


# ---------------------------------------------------------------------------
# claude_service: SDK errors leave as classified ExtractionErrors
# ---------------------------------------------------------------------------


class TestClaudeServiceClassifiesFailures:
    @pytest.mark.parametrize(
        ("sdk_error", "kind"),
        [
            (anthropic.APITimeoutError(request=_REQUEST), AnthropicFailureKind.UPSTREAM),
            (anthropic.APIConnectionError(request=_REQUEST), AnthropicFailureKind.UPSTREAM),
            (_overloaded(), AnthropicFailureKind.UPSTREAM),
            (_bad_key(), AnthropicFailureKind.MISCONFIGURED),
            (_status_error(anthropic.BadRequestError, 400, "invalid_request_error"),
             AnthropicFailureKind.INPUT_REJECTED),
        ],
        ids=["timeout", "connection", "overloaded", "auth", "invalid-request"],
    )
    @pytest.mark.asyncio
    async def test_sdk_error_becomes_classified_extraction_error(
        self, sdk_error: Exception, kind: AnthropicFailureKind,
    ) -> None:
        with _sdk_raising(sdk_error), pytest.raises(ExtractionError) as exc_info:
            await claude_service.call_claude(
                system_prompt="p", user_content="u", context_type="test",
                user_id=uuid.uuid4(),
                retry_policy=REQUEST_PATH_CLAUDE_RETRY,
            )

        assert exc_info.value.kind is kind
        assert exc_info.value.__cause__ is sdk_error
        assert _PROVIDER_TEXT not in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_failed_usage_log_does_not_replace_the_claude_error(self) -> None:
        """If writing the error row fails too, callers still get the Claude failure."""
        with (
            _sdk_raising(_overloaded()),
            patch.object(
                claude_service, "_record_log",
                AsyncMock(side_effect=RuntimeError("db down")),
            ),
            pytest.raises(ExtractionError) as exc_info,
        ):
            await claude_service.call_claude(
                system_prompt="p", user_content="u", context_type="test",
                user_id=uuid.uuid4(),
                retry_policy=REQUEST_PATH_CLAUDE_RETRY,
            )

        assert exc_info.value.kind is AnthropicFailureKind.UPSTREAM


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


class TestParseJdRoute:
    @pytest.mark.asyncio
    async def test_busy_claude_is_a_retryable_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        with _sdk_raising(_overloaded()):
            async with await as_user(user) as authed:
                resp = await authed.post("/applications/parse-jd", json={"jd_text": _SAMPLE_JD})
        _assert_busy(resp)

    @pytest.mark.asyncio
    async def test_bad_api_key_is_a_final_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        with _sdk_raising(_bad_key()):
            async with await as_user(user) as authed:
                resp = await authed.post("/applications/parse-jd", json={"jd_text": _SAMPLE_JD})
        _assert_unavailable(resp)


class TestAnalyzeRoute:
    @pytest.mark.asyncio
    async def test_busy_claude_is_a_retryable_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        with _sdk_raising(_overloaded()):
            async with await as_user(user) as authed:
                resp = await authed.post("/jobs/analyze", json={"jd_text": _SAMPLE_JD})
        _assert_busy(resp)

    @pytest.mark.asyncio
    async def test_bad_api_key_is_a_final_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        with _sdk_raising(_bad_key()):
            async with await as_user(user) as authed:
                resp = await authed.post("/jobs/analyze", json={"jd_text": _SAMPLE_JD})
        _assert_unavailable(resp)

    @pytest.mark.asyncio
    async def test_unreadable_reply_is_a_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        user = await user_factory()
        reply_text = "Claude returned invalid JSON: Sure! Here is the analysis you asked for"
        with patch.object(
            claude_service, "call_claude_with_meta", new=AsyncMock(side_effect=ValueError(reply_text)),
        ):
            async with await as_user(user) as authed:
                resp = await authed.post("/jobs/analyze", json={"jd_text": _SAMPLE_JD})
        assert resp.status_code == 502, resp.text
        assert resp.json()["detail"] == JOB_ANALYSIS_FAILED_MESSAGE
        assert "invalid JSON" not in resp.text


class TestCompanyResearchRoute:
    async def _research(self, user_factory: Any, as_user: Any, sdk_error: Exception) -> Any:
        tavily_results = [
            {
                "url": "https://glassdoor.com/reviews/acme",
                "title": "Acme Reviews",
                "content": "Good benefits.",
                "score": 0.9,
                "source_type": "glassdoor",
            },
        ]
        user = await user_factory()
        async with await as_user(user) as authed:
            create = await authed.post(
                "/companies",
                json={"name": "Acme", "primary_domain": "acme.example.com"},
            )
            assert create.status_code == 201, create.text
            company_id = create.json()["id"]

        with (
            patch(
                "app.services.company.company_research_service.search_company",
                new=AsyncMock(return_value=tavily_results),
            ),
            patch(
                "app.services.company.company_research_service.search_company_overview",
                new=AsyncMock(return_value=tavily_results),
            ),
            _sdk_raising(sdk_error),
        ):
            async with await as_user(user) as authed:
                return await authed.post(f"/companies/{company_id}/research")

    @pytest.mark.asyncio
    async def test_busy_claude_is_a_retryable_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        _assert_busy(await self._research(user_factory, as_user, _overloaded()))

    @pytest.mark.asyncio
    async def test_bad_api_key_is_a_final_502_with_our_copy(
        self, user_factory, as_user,
    ) -> None:
        _assert_unavailable(await self._research(user_factory, as_user, _bad_key()))
