"""Sending the verification and password-reset emails logs no email address.

INFO lines become Sentry breadcrumbs; ``app.core.auth`` logs the user id instead.
"""
import logging
from unittest.mock import AsyncMock, patch

import pytest

from app.services.email import password_reset_email, verification_email

_EMAIL = "jane.doe@example.com"


async def test_verification_email_logs_no_address(caplog: pytest.LogCaptureFixture) -> None:
    send = AsyncMock()
    with patch.object(verification_email, "send_email_or_raise", send), caplog.at_level(logging.DEBUG):
        await verification_email.send_verification_email(_EMAIL, "verify-token")
    send.assert_awaited_once()
    assert _EMAIL not in caplog.text


async def test_password_reset_email_logs_no_address(caplog: pytest.LogCaptureFixture) -> None:
    send = AsyncMock()
    with patch.object(password_reset_email, "send_email_or_raise", send), caplog.at_level(logging.DEBUG):
        await password_reset_email.send_password_reset_email(_EMAIL, "reset-token")
    send.assert_awaited_once()
    assert _EMAIL not in caplog.text
