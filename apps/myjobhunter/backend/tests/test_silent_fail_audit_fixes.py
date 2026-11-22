"""Tests for MJH silent-fail audit fixes — parity with MBK PR #261.

Audit findings:
- Gmail surface: MJH has no gmail_service.py or email_discovery_service.py.
  Only surface is verification_email.py — already raises rather than returning
  bool. Covered here to prevent regression.
- Claude backoff loop (the shared ``create_with_backoff``): logs WARNING on
  rate-limit and re-raises once exhausted. Covered here.
- _record_log: no bare except; DB write failures propagate. Covered here.
- verification_email.send_verification_email: propagates send failures upward
  so the registration flow surfaces the error rather than silently succeeding.

See also test_turnstile_boot_check.py for the boot-guard parity tests.
"""
from __future__ import annotations

import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import httpx2
import pytest
from platform_shared.extraction import AnthropicFailureKind, ExtractionError, throttle

from app.core.claude_retry_constants import WORKER_CLAUDE_RETRY
from app.services.extraction import claude_service


# ---------------------------------------------------------------------------
# Claude calls go through the shared backoff — rate-limit warning visibility
# ---------------------------------------------------------------------------

_BACKOFF_LOGGER = "platform_shared.extraction.backoff"


def _rate_limit_error(headers: dict[str, str]) -> anthropic.RateLimitError:
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx2.Response(429, request=request, headers=headers)
    return anthropic.RateLimitError(
        "rate limited",
        response=response,
        body={"type": "error", "error": {"type": "rate_limit_error", "message": "slow down"}},
    )


def _reply() -> MagicMock:
    message = MagicMock(spec=anthropic.types.Message)
    message.content = [MagicMock(type="text", text='{"ok": true}')]
    message.usage = MagicMock(input_tokens=10, output_tokens=20)
    message.model = "claude-sonnet-4-6"
    return message


@pytest.fixture(autouse=True)
def _reset_shared_throttle():
    """A 429 arms the process-global throttle; don't let it leak into other tests."""
    yield
    throttle.consecutive_429s = 0
    throttle.resume_at = 0.0


async def _call_claude_with(create) -> dict:
    with (
        patch.object(
            claude_service, "_get_client",
            return_value=MagicMock(messages=MagicMock(create=create)),
        ),
        patch.object(claude_service, "_record_log", new=AsyncMock()),
        patch("asyncio.sleep", new=AsyncMock()),
    ):
        return await claude_service.call_claude(
            system_prompt="test", user_content="hello", context_type="test",
            user_id=uuid.uuid4(), retry_policy=WORKER_CLAUDE_RETRY,
        )


class TestCallWithBackoffLogging:
    """Every MJH Claude call must log a WARNING (with attempt info) on each
    rate-limit retry so production dashboards surface throttling."""

    @pytest.mark.anyio
    async def test_rate_limit_logs_warning_and_retries(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        create = AsyncMock(side_effect=[_rate_limit_error({"retry-after": "1"}), _reply()])

        with caplog.at_level(logging.WARNING, logger=_BACKOFF_LOGGER):
            result = await _call_claude_with(create)

        assert result == {"ok": True}, "Should succeed on second attempt"
        assert create.await_count == 2
        warning_messages = " ".join(
            r.getMessage() for r in caplog.records if r.levelno == logging.WARNING
        )
        assert "rate limited" in warning_messages.lower()
        assert "attempt 1/5" in warning_messages

    @pytest.mark.anyio
    async def test_rate_limit_exhausted_raises_classified_error(self) -> None:
        """After 5 failed attempts the call raises (never swallows) — as a
        rate-limited ExtractionError, which callers retry later."""
        create = AsyncMock(side_effect=_rate_limit_error({}))

        with pytest.raises(ExtractionError) as exc_info:
            await _call_claude_with(create)

        assert create.await_count == 5
        assert exc_info.value.kind is AnthropicFailureKind.RATE_LIMITED
        assert exc_info.value.is_transient


# ---------------------------------------------------------------------------
# verification_email — raises rather than returning bool on send failure
# ---------------------------------------------------------------------------


class TestVerificationEmailRaisesOnFailure:
    """send_verification_email must propagate exceptions upward.

    The pre-2026-05-05 version returned a bool on failure, which meant
    a registered user could end up with no verification email and no
    error surface. The current version calls send_email_or_raise which
    propagates failures — these tests verify that contract is intact.
    """

    async def test_send_failure_propagates(self) -> None:
        """When the underlying send raises, send_verification_email must
        propagate it rather than catching and returning False."""
        from app.services.email.email_sender import EmailSendError
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            side_effect=EmailSendError("SMTP connection refused", kind="transient"),
        ):
            with pytest.raises(EmailSendError):
                await send_verification_email("user@example.com", "tok123")

    async def test_not_configured_propagates(self) -> None:
        """When email is not configured, the error propagates — not swallowed."""
        from app.services.email.email_sender import EmailNotConfiguredError
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            side_effect=EmailNotConfiguredError("no backend configured"),
        ):
            with pytest.raises(EmailNotConfiguredError):
                await send_verification_email("user@example.com", "tok123")

    async def test_send_success_does_not_raise(self) -> None:
        """When send succeeds, the function completes without raising."""
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            return_value=None,
        ):
            # Must complete without raising
            await send_verification_email("user@example.com", "tok123")


# ---------------------------------------------------------------------------
# _record_log — no bare except; DB failures propagate
# ---------------------------------------------------------------------------


class TestRecordLogFailsLoud:
    """_record_log must not swallow DB errors.

    Cost-tracking writes are load-bearing for per-user budget enforcement —
    the discovery score worker reads SUM(cost_usd) to decide whether to
    keep spending. A silent failure here = silent budget bypass = real money
    lost. Same anti-pattern MBK removed in PR #205.
    """

    @pytest.mark.anyio
    async def test_db_error_propagates(self) -> None:
        """When AsyncSessionLocal raises during a cost-log write, the error
        must propagate so the caller knows the log wasn't written."""
        from sqlalchemy.exc import OperationalError

        from app.services.extraction.claude_service import _record_log
        import uuid

        db_error = OperationalError("DB unavailable", params=None, orig=None)

        with patch(
            "app.services.extraction.claude_service.AsyncSessionLocal",
            side_effect=db_error,
        ):
            with pytest.raises(OperationalError):
                await _record_log(
                    user_id=uuid.uuid4(),
                    context_id=None,
                    context_type="jd_parse",
                    message=None,
                    duration_ms=100,
                    status="success",
                    error_message=None,
                )
