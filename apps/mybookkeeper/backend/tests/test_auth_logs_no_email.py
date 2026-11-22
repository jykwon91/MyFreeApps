"""Auth log lines name the user by id, never by email address.

INFO lines become Sentry breadcrumbs, so an address in one leaves the server.
"""
import logging
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from app.core.auth import UserManager

_EMAIL = "owner@example.com"


def _manager() -> UserManager:
    manager = UserManager.__new__(UserManager)
    manager.user_db = MagicMock()
    return manager


def _user() -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = _EMAIL
    return user


async def test_verification_email_log_names_the_user_id(caplog: pytest.LogCaptureFixture) -> None:
    user = _user()
    with (
        patch("app.core.auth.send_verification_email", AsyncMock()),
        patch("app.core.auth.log_auth_event", AsyncMock()),
        caplog.at_level(logging.INFO, logger="app.core.auth"),
    ):
        await _manager().on_after_request_verify(user, "verify-token")

    assert _EMAIL not in caplog.text
    assert str(user.id) in caplog.text

