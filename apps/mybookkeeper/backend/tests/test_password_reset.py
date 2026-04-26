"""Tests for password reset flow — email template, rate limiting, and router registration."""

import importlib
from unittest.mock import patch

import pytest

from app.services.system.password_reset_email import (
    _build_reset_html,
    send_password_reset_email,
)


class TestPasswordResetEmailTemplate:
    """Password reset email template tests."""

    def test_reset_url_included_in_html(self):
        html = _build_reset_html("https://example.com/reset-password?token=abc123")
        assert "https://example.com/reset-password?token=abc123" in html

    def test_html_escapes_url(self):
        html = _build_reset_html("https://example.com/reset?token=a<b>c")
        assert "<b>" not in html
        assert "&lt;b&gt;" in html

    def test_html_has_branded_header(self):
        html = _build_reset_html("https://example.com")
        assert "MyBookkeeper" in html

    def test_html_has_reset_button(self):
        html = _build_reset_html("https://example.com")
        assert "Reset Password" in html

    def test_html_has_expiry_notice(self):
        html = _build_reset_html("https://example.com")
        assert "expires" in html.lower()


class TestSendPasswordResetEmail:
    """send_password_reset_email function tests."""

    @patch("app.services.system.password_reset_email.email_service")
    @patch("app.services.system.password_reset_email.settings")
    def test_sends_email_with_correct_params(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://app.example.com"
        mock_email_svc.send_email.return_value = True

        result = send_password_reset_email("user@example.com", "token123")

        assert result is True
        mock_email_svc.send_email.assert_called_once()
        args = mock_email_svc.send_email.call_args
        assert args[0][0] == ["user@example.com"]
        assert "Reset" in args[0][1] or "reset" in args[0][1]
        assert "token123" in args[0][2]

    @patch("app.services.system.password_reset_email.email_service")
    @patch("app.services.system.password_reset_email.settings")
    def test_returns_false_on_failure(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://app.example.com"
        mock_email_svc.send_email.return_value = False

        result = send_password_reset_email("user@example.com", "token123")

        assert result is False

    @patch("app.services.system.password_reset_email.email_service")
    @patch("app.services.system.password_reset_email.settings")
    def test_reset_url_uses_frontend_url(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://mybookkeeper.app/"
        mock_email_svc.send_email.return_value = True

        send_password_reset_email("user@example.com", "abc")

        html = mock_email_svc.send_email.call_args[0][2]
        assert "https://mybookkeeper.app/reset-password?token=abc" in html


class TestPasswordResetRouterRegistered:
    """Verify the reset password router is registered in the FastAPI app."""

    def test_forgot_password_route_exists(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/auth/forgot-password" in paths

    def test_reset_password_route_exists(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/auth/reset-password" in paths


class TestPasswordResetRateLimiter:
    """Rate limiter configuration tests."""

    def test_password_reset_limiter_exists(self):
        from app.core.rate_limit import password_reset_limiter

        assert password_reset_limiter._config.max_attempts == 5
        assert password_reset_limiter._config.window_seconds == 3600
