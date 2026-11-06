"""EMAIL_BACKEND picks how MyBookkeeper sends mail.

MyBookkeeper used to ignore the setting and always send over SMTP, so a local
stack or CI with no SMTP server failed every verification email and
/auth/register returned 500 after creating the account.
"""

from collections.abc import Iterator
from unittest.mock import patch

import pytest

from app.core.config import Settings, settings
from app.services.system import email_service


@pytest.fixture
def backend(request: pytest.FixtureRequest) -> Iterator[None]:
    with patch.object(settings, "email_backend", request.param):
        email_service._get_email_service.cache_clear()
        yield
    email_service._get_email_service.cache_clear()


@pytest.mark.parametrize("backend", ["console"], indirect=True)
def test_console_logs_the_send_without_smtp(backend: None, caplog: pytest.LogCaptureFixture) -> None:
    with patch("smtplib.SMTP") as smtp, caplog.at_level("INFO"):
        email_service.send_email_or_raise(["owner@example.com"], "Verify your email", "<p>Hi</p>")
    smtp.assert_not_called()
    assert "[email:console]" in caplog.text
    assert email_service.is_configured() is True


@pytest.mark.parametrize("backend", ["smtp"], indirect=True)
def test_smtp_still_sends_over_smtp(backend: None) -> None:
    with (
        patch.object(settings, "smtp_user", "mbk@example.com"),
        patch.object(settings, "smtp_password", "app-password"),
        patch("smtplib.SMTP") as smtp,
    ):
        email_service._get_email_service.cache_clear()
        email_service.send_email_or_raise(["owner@example.com"], "Verify your email", "<p>Hi</p>")
    smtp.assert_called_once()


def test_default_is_smtp() -> None:
    assert Settings.model_fields["email_backend"].default == "smtp"
