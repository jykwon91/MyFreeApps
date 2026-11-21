"""The register / forgot-password hooks send their email off the event loop
and surface the SMTP server's reply code when the send fails.

Before 2026-11 the hooks called the blocking SMTP client straight from
``async`` code with no timeout, so one stalled SMTP server froze every request
on the worker.
"""
import smtplib
import threading
from unittest.mock import MagicMock, patch

import pytest
from app.core.auth import UserManager
from app.services.email.email_sender import EmailSendError
from platform_shared.core.tracked_task import drain_tracked


def _smtp_settings() -> MagicMock:
    return MagicMock(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_user="mailer@example.com",
        smtp_password="not-a-real-password",
        email_from_name="Test",
        email_backend="smtp",
    )


def _manager() -> UserManager:
    manager = UserManager.__new__(UserManager)
    manager.user_db = MagicMock()
    return manager


def _user() -> MagicMock:
    user = MagicMock()
    user.id = "u1"
    user.email = "person@example.com"
    return user


async def test_forgot_password_email_is_sent_off_the_event_loop() -> None:
    loop_thread = threading.get_ident()
    send_threads: list[int] = []
    server = MagicMock()
    server.sendmail.side_effect = lambda *_: send_threads.append(threading.get_ident()) or {}

    with (
        patch("app.services.email.email_sender.settings", _smtp_settings()),
        patch("smtplib.SMTP", return_value=server),
    ):
        await _manager().on_after_forgot_password(_user(), "reset-token")
        await drain_tracked()

    assert send_threads and send_threads[0] != loop_thread


async def test_verification_email_failure_carries_the_smtp_code() -> None:
    server = MagicMock()
    server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"bad credentials")

    with (
        patch("app.services.email.email_sender.settings", _smtp_settings()),
        patch("smtplib.SMTP", return_value=server),
        pytest.raises(EmailSendError) as exc,
    ):
        await _manager().on_after_request_verify(_user(), "verify-token")

    assert exc.value.kind == "misconfigured"
    assert exc.value.smtp_code == 535
