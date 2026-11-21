"""The register / forgot-password hooks send their email off the event loop
and surface the SMTP server's reply code when the send fails.

Before 2026-11 the hooks called the blocking SMTP client straight from
``async`` code with no timeout, so one stalled SMTP server froze every request
on the worker, healthchecks included.
"""
import smtplib
import threading
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.auth import UserManager
from app.core.config import settings
from app.services.system import email_service
from app.services.system.email_service import EmailSendError


@pytest.fixture
def smtp_backend() -> Iterator[None]:
    with (
        patch.object(settings, "email_backend", "smtp"),
        patch.object(settings, "smtp_user", "mbk@example.com"),
        patch.object(settings, "smtp_password", "not-a-real-password"),
        patch("app.core.auth.log_auth_event", AsyncMock()),
    ):
        email_service._get_email_service.cache_clear()
        yield
    email_service._get_email_service.cache_clear()


def _manager() -> UserManager:
    manager = UserManager.__new__(UserManager)
    manager.user_db = MagicMock()
    return manager


def _user() -> MagicMock:
    user = MagicMock()
    user.id = "u1"
    user.email = "owner@example.com"
    return user


async def test_forgot_password_email_is_sent_off_the_event_loop(smtp_backend: None) -> None:
    loop_thread = threading.get_ident()
    send_threads: list[int] = []
    server = MagicMock()
    server.sendmail.side_effect = lambda *_: send_threads.append(threading.get_ident()) or {}

    with patch("smtplib.SMTP", return_value=server):
        await _manager().on_after_forgot_password(_user(), "reset-token")

    assert send_threads and send_threads[0] != loop_thread


async def test_verification_email_failure_carries_the_smtp_code(smtp_backend: None) -> None:
    server = MagicMock()
    server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"bad credentials")

    with patch("smtplib.SMTP", return_value=server), pytest.raises(EmailSendError) as exc:
        await _manager().on_after_request_verify(_user(), "verify-token")

    assert exc.value.kind == "misconfigured"
    assert exc.value.smtp_code == 535
