"""Tests for the MJH password-reset email flow.

Locks the contract:
- Calling send_password_reset_email triggers the shared template renderer
  with MJH branding and the right reset URL.
- Failures (EmailSendError, EmailNotConfiguredError, ValueError) propagate
  rather than being swallowed (mirrors verification_email's fail-loud
  contract per the 2026-05-09 H6/H7 parity audit).
- The UserManager.on_after_forgot_password hook is wired to the sender so
  fastapi-users' forgot-password endpoint actually delivers the email.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.auth import UserManager
from app.services.email.email_sender import EmailSendError
from app.services.email.password_reset_email import (
    _build_reset_html,
    send_password_reset_email,
)


class TestPasswordResetEmailTemplate:
    def test_reset_url_included_in_html(self) -> None:
        html = _build_reset_html("https://example.com/reset-password?token=abc123")
        assert "https://example.com/reset-password?token=abc123" in html

    def test_html_escapes_url(self) -> None:
        html = _build_reset_html("https://example.com/r?token=a<b>c")
        assert "<b>" not in html
        assert "&lt;b&gt;" in html

    def test_html_has_branded_header(self) -> None:
        html = _build_reset_html("https://example.com")
        assert "MyJobHunter" in html


class TestSendPasswordResetEmail:
    @patch("app.services.email.password_reset_email.send_email_or_raise")
    @patch("app.services.email.password_reset_email.settings")
    def test_sends_email_with_correct_params(self, mock_settings, mock_send) -> None:
        mock_settings.frontend_url = "https://app.example.com"

        result = send_password_reset_email("user@example.com", "token123")

        assert result is None  # fail-loud contract: returns None on success
        mock_send.assert_called_once()
        args = mock_send.call_args
        assert args[0][0] == ["user@example.com"]
        assert "Reset" in args[0][1]
        assert "MyJobHunter" in args[0][1]
        assert "token123" in args[0][2]

    @patch("app.services.email.password_reset_email.send_email_or_raise")
    @patch("app.services.email.password_reset_email.settings")
    def test_raises_on_send_failure(self, mock_settings, mock_send) -> None:
        """Critical-path email — failures must propagate, never be swallowed.

        Without this contract, MJH's POST /auth/forgot-password would
        return 202 to the user even though the reset email never went out
        — the user can never recover their account.
        """
        mock_settings.frontend_url = "https://app.example.com"
        mock_send.side_effect = EmailSendError("smtp connect failed")

        with pytest.raises(EmailSendError, match="smtp connect failed"):
            send_password_reset_email("user@example.com", "token123")

    @patch("app.services.email.password_reset_email.send_email_or_raise")
    @patch("app.services.email.password_reset_email.settings")
    def test_reset_url_uses_frontend_url(self, mock_settings, mock_send) -> None:
        mock_settings.frontend_url = "https://myjobhunter.app/"

        send_password_reset_email("user@example.com", "abc")

        html = mock_send.call_args[0][2]
        assert "https://myjobhunter.app/reset-password?token=abc" in html


class TestOnAfterForgotPassword:
    @pytest.mark.anyio
    @patch("app.core.auth.send_password_reset_email")
    async def test_sends_reset_email_with_token(self, mock_send) -> None:
        manager = UserManager.__new__(UserManager)
        manager.user_db = MagicMock()

        user = MagicMock()
        user.id = "u1"
        user.email = "test@example.com"

        await manager.on_after_forgot_password(user, "resettoken123")

        mock_send.assert_called_once_with("test@example.com", "resettoken123")

    @pytest.mark.anyio
    @patch("app.core.auth.send_password_reset_email")
    async def test_raises_on_send_failure(self, mock_send) -> None:
        """Send failure must propagate so the forgot-password HTTP request
        fails 5xx and the user retries — never returns a 2xx with the
        reset email lost.
        """
        mock_send.side_effect = EmailSendError("smtp down")
        manager = UserManager.__new__(UserManager)
        manager.user_db = MagicMock()

        user = MagicMock()
        user.id = "u1"
        user.email = "fail@example.com"

        with pytest.raises(EmailSendError, match="smtp down"):
            await manager.on_after_forgot_password(user, "token")
