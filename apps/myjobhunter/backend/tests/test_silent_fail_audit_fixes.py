"""Tests for MJH silent-fail audit fixes — parity with MBK PR #261.

Audit findings:
- Gmail surface: MJH has no gmail_service.py or email_discovery_service.py.
  Only surface is verification_email.py — already raises rather than returning
  bool. Covered here to prevent regression.
- Claude backoff loop: logs WARNING on rate-limit. Covered here.
- _record_log: no bare except; DB write failures propagate. Covered here.
- verification_email.send_verification_email: propagates send failures upward
  so the registration flow surfaces the error rather than silently succeeding.

See also test_turnstile_boot_check.py for the boot-guard parity tests.
"""
from __future__ import annotations

import logging
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest


# ---------------------------------------------------------------------------
# Claude _call_with_backoff — rate-limit warning visibility
# ---------------------------------------------------------------------------


class TestCallWithBackoffLogging:
    """_call_with_backoff must log a WARNING (with structured fields) on every
    rate-limit retry so production dashboards surface throttling without needing
    to scan raw Anthropic response headers."""

    @pytest.mark.anyio
    async def test_rate_limit_logs_warning(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """RateLimitError on first attempt must emit a WARNING log and retry."""
        from app.services.extraction.claude_service import _call_with_backoff

        mock_message = MagicMock(spec=anthropic.types.Message)
        mock_message.content = []
        mock_message.usage = MagicMock(input_tokens=10, output_tokens=20)
        mock_message.model = "claude-sonnet-4-6"

        rate_limit_exc = anthropic.RateLimitError(
            message="rate limited",
            response=MagicMock(headers={"retry-after": "1"}),
            body=None,
        )

        call_count = 0

        async def _fake_create(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise rate_limit_exc
            return mock_message

        with (
            patch(
                "app.services.extraction.claude_service._get_client",
                return_value=MagicMock(
                    messages=MagicMock(create=_fake_create)
                ),
            ),
            patch("asyncio.sleep", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="app.services.extraction.claude_service"),
        ):
            result = await _call_with_backoff(
                model="claude-sonnet-4-6",
                max_tokens=100,
                system=[{"type": "text", "text": "test"}],
                messages=[{"role": "user", "content": "hello"}],
            )

        assert result is mock_message, "Should succeed on second attempt"
        warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert warning_records, (
            "Expected at least one WARNING log on rate-limit retry; got none"
        )

    @pytest.mark.anyio
    async def test_rate_limit_warning_contains_attempt_info(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """The WARNING message must include attempt count so operators can
        track how often the API is being throttled."""
        from app.services.extraction.claude_service import _call_with_backoff

        mock_message = MagicMock(spec=anthropic.types.Message)
        mock_message.content = []
        mock_message.usage = MagicMock(input_tokens=0, output_tokens=0)
        mock_message.model = "claude-sonnet-4-6"

        call_count = 0

        async def _fake_create(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 1:
                raise anthropic.RateLimitError(
                    message="rate limited",
                    response=MagicMock(headers={}),
                    body=None,
                )
            return mock_message

        with (
            patch(
                "app.services.extraction.claude_service._get_client",
                return_value=MagicMock(
                    messages=MagicMock(create=_fake_create)
                ),
            ),
            patch("asyncio.sleep", new=AsyncMock()),
            caplog.at_level(logging.WARNING, logger="app.services.extraction.claude_service"),
        ):
            await _call_with_backoff(
                model="claude-sonnet-4-6",
                max_tokens=100,
                system=[{"type": "text", "text": "test"}],
                messages=[{"role": "user", "content": "hello"}],
            )

        warning_messages = " ".join(r.message for r in caplog.records if r.levelno == logging.WARNING)
        # Should mention either "rate" or "attempt" so the operator knows the cause
        assert any(kw in warning_messages.lower() for kw in ("rate", "attempt", "limit")), (
            f"WARNING message should mention throttling context; got: {warning_messages!r}"
        )

    @pytest.mark.anyio
    async def test_rate_limit_exhausted_raises(self) -> None:
        """After 5 failed attempts the function must re-raise RateLimitError
        rather than swallowing it — silent degradation on repeated throttling
        would leave callers thinking the call succeeded."""
        from app.services.extraction.claude_service import _call_with_backoff

        async def _always_rate_limited(**kwargs):
            raise anthropic.RateLimitError(
                message="rate limited",
                response=MagicMock(headers={}),
                body=None,
            )

        with (
            patch(
                "app.services.extraction.claude_service._get_client",
                return_value=MagicMock(
                    messages=MagicMock(create=_always_rate_limited)
                ),
            ),
            patch("asyncio.sleep", new=AsyncMock()),
        ):
            with pytest.raises(anthropic.RateLimitError):
                await _call_with_backoff(
                    model="claude-sonnet-4-6",
                    max_tokens=100,
                    system=[{"type": "text", "text": "test"}],
                    messages=[{"role": "user", "content": "hello"}],
                )


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

    def test_send_failure_propagates(self) -> None:
        """When the underlying send raises, send_verification_email must
        propagate it rather than catching and returning False."""
        from app.services.email.email_sender import EmailSendError
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            side_effect=EmailSendError("SMTP connection refused"),
        ):
            with pytest.raises(EmailSendError):
                send_verification_email("user@example.com", "tok123")

    def test_not_configured_propagates(self) -> None:
        """When email is not configured, the error propagates — not swallowed."""
        from app.services.email.email_sender import EmailNotConfiguredError
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            side_effect=EmailNotConfiguredError("no backend configured"),
        ):
            with pytest.raises(EmailNotConfiguredError):
                send_verification_email("user@example.com", "tok123")

    def test_send_success_does_not_raise(self) -> None:
        """When send succeeds, the function completes without raising."""
        from app.services.email.verification_email import send_verification_email

        with patch(
            "app.services.email.verification_email.send_email_or_raise",
            return_value=None,
        ):
            # Must complete without raising
            send_verification_email("user@example.com", "tok123")


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
