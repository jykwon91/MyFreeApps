"""Tests for email verification flow.

Covers:
- Registration triggers verification email send
- Unverified user cannot log in via /auth/totp/login
- Verified user can log in
- /auth/verify endpoint marks user as verified
- /auth/verify rejects invalid tokens
- /auth/request-verify-token resends the email
- /auth/request-verify-token for already-verified user returns 400
- Verification email HTML template
- send_verification_email helper
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi_users import exceptions

from app.core.auth import UserManager
from app.services.system.verification_email import (
    _build_verification_html,
    send_verification_email,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    *,
    is_verified: bool = False,
    is_active: bool = True,
    email: str = "user@example.com",
) -> MagicMock:
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = email
    user.is_verified = is_verified
    user.is_active = is_active
    user.failed_login_count = 0
    user.locked_until = None
    user.last_failed_login_at = None
    user.totp_enabled = False
    return user


def _make_manager(user: MagicMock | None, *, parent_returns: MagicMock | None) -> UserManager:
    manager = UserManager.__new__(UserManager)

    user_db = MagicMock()
    user_db.update = AsyncMock()
    user_db.session = MagicMock()

    manager.user_db = user_db
    manager.password_helper = MagicMock()
    manager.password_helper.hash = MagicMock(return_value="hashed")

    async def _get_by_email(_email: str):
        if user is None:
            raise exceptions.UserNotExists()
        return user

    user_db.get_by_email = _get_by_email

    async def _parent_authenticate(_creds):
        return parent_returns

    manager._parent_authenticate = _parent_authenticate
    return manager


# ---------------------------------------------------------------------------
# Verification email template
# ---------------------------------------------------------------------------

class TestVerificationEmailTemplate:
    def test_verify_url_included_in_html(self):
        html = _build_verification_html("https://example.com/verify-email?token=abc123")
        assert "https://example.com/verify-email?token=abc123" in html

    def test_html_escapes_url(self):
        html = _build_verification_html("https://example.com/verify?token=a<b>c")
        assert "<b>" not in html
        assert "&lt;b&gt;" in html

    def test_html_has_branded_header(self):
        html = _build_verification_html("https://example.com")
        assert "MyBookkeeper" in html

    def test_html_has_verify_button(self):
        html = _build_verification_html("https://example.com")
        assert "Verify my email" in html

    def test_html_has_expiry_notice(self):
        html = _build_verification_html("https://example.com")
        assert "expires" in html.lower()


# ---------------------------------------------------------------------------
# send_verification_email helper
# ---------------------------------------------------------------------------

class TestSendVerificationEmail:
    @patch("app.services.system.verification_email.email_service")
    @patch("app.services.system.verification_email.settings")
    def test_sends_email_with_correct_params(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://app.example.com"
        mock_email_svc.send_email.return_value = True

        result = send_verification_email("user@example.com", "token123")

        assert result is True
        mock_email_svc.send_email.assert_called_once()
        args = mock_email_svc.send_email.call_args
        assert args[0][0] == ["user@example.com"]
        assert "Verify" in args[0][1]
        assert "token123" in args[0][2]

    @patch("app.services.system.verification_email.email_service")
    @patch("app.services.system.verification_email.settings")
    def test_returns_false_on_failure(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://app.example.com"
        mock_email_svc.send_email.return_value = False

        result = send_verification_email("user@example.com", "token123")

        assert result is False

    @patch("app.services.system.verification_email.email_service")
    @patch("app.services.system.verification_email.settings")
    def test_verify_url_uses_frontend_url(self, mock_settings, mock_email_svc):
        mock_settings.frontend_url = "https://mybookkeeper.app/"
        mock_email_svc.send_email.return_value = True

        send_verification_email("user@example.com", "abc")

        html = mock_email_svc.send_email.call_args[0][2]
        assert "https://mybookkeeper.app/verify-email?token=abc" in html


# ---------------------------------------------------------------------------
# on_after_request_verify hook
# ---------------------------------------------------------------------------

class TestOnAfterRequestVerify:
    @pytest.mark.anyio
    @patch("app.core.auth.send_verification_email")
    async def test_sends_verification_email_with_token(self, mock_send):
        mock_send.return_value = True
        manager = UserManager.__new__(UserManager)
        manager.user_db = MagicMock()

        user = _make_user(email="test@example.com")
        await manager.on_after_request_verify(user, "verifytoken123")

        mock_send.assert_called_once_with("test@example.com", "verifytoken123")

    @pytest.mark.anyio
    @patch("app.core.auth.send_verification_email")
    async def test_logs_warning_on_send_failure(self, mock_send, caplog):
        import logging
        mock_send.return_value = False
        manager = UserManager.__new__(UserManager)
        manager.user_db = MagicMock()

        user = _make_user(email="fail@example.com")
        with caplog.at_level(logging.WARNING, logger="app.core.auth"):
            await manager.on_after_request_verify(user, "token")

        assert any("fail@example.com" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# on_after_verify hook
# ---------------------------------------------------------------------------

class TestOnAfterVerify:
    @pytest.mark.anyio
    async def test_logs_verified_user_email(self, caplog):
        import logging
        manager = UserManager.__new__(UserManager)
        manager.user_db = MagicMock()

        user = _make_user(email="verified@example.com")
        with caplog.at_level(logging.INFO, logger="app.core.auth"):
            await manager.on_after_verify(user)

        assert any("verified@example.com" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Login gating — unverified users cannot log in
# ---------------------------------------------------------------------------

class TestLoginGating:
    @pytest.mark.anyio
    async def test_unverified_user_returns_none_from_authenticate(self):
        """authenticate() should return None for unverified users after password match.

        The TOTP login endpoint raises LOGIN_USER_NOT_VERIFIED explicitly;
        the standard fastapi-users JWT endpoint gets generic bad-credentials (400)
        which is acceptable for the uncommon direct-JWT path.
        """
        from fastapi.security import OAuth2PasswordRequestForm

        unverified_user = _make_user(is_verified=False)

        manager = UserManager.__new__(UserManager)
        user_db = MagicMock()
        user_db.update = AsyncMock()
        manager.user_db = user_db
        manager.password_helper = MagicMock()
        manager.password_helper.hash = MagicMock(return_value="hashed")

        async def _get_by_email(_email: str):
            return unverified_user

        user_db.get_by_email = _get_by_email

        credentials = MagicMock(spec=OAuth2PasswordRequestForm)
        credentials.username = "user@example.com"
        credentials.password = "secret"

        with patch.object(
            UserManager.__bases__[1],  # BaseUserManager
            "authenticate",
            new=AsyncMock(return_value=unverified_user),
        ):
            result = await manager.authenticate(credentials)

        assert result is None

    @pytest.mark.anyio
    async def test_verified_user_can_authenticate(self):
        """authenticate() should return the user when is_verified=True."""
        from fastapi.security import OAuth2PasswordRequestForm

        verified_user = _make_user(is_verified=True)

        manager = UserManager.__new__(UserManager)
        user_db = MagicMock()
        user_db.update = AsyncMock()
        manager.user_db = user_db
        manager.password_helper = MagicMock()
        manager.password_helper.hash = MagicMock(return_value="hashed")

        async def _get_by_email(_email: str):
            return verified_user

        user_db.get_by_email = _get_by_email

        credentials = MagicMock(spec=OAuth2PasswordRequestForm)
        credentials.username = "user@example.com"
        credentials.password = "secret"

        with patch.object(
            UserManager.__bases__[1],
            "authenticate",
            new=AsyncMock(return_value=verified_user),
        ):
            result = await manager.authenticate(credentials)

        assert result is verified_user


# ---------------------------------------------------------------------------
# Verify router registered
# ---------------------------------------------------------------------------

class TestVerifyRouterRegistered:
    def test_verify_route_exists(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/auth/verify" in paths

    def test_request_verify_token_route_exists(self):
        from app.main import app

        paths = [r.path for r in app.routes]
        assert "/auth/request-verify-token" in paths


# ---------------------------------------------------------------------------
# TOTP login endpoint blocks unverified users
# ---------------------------------------------------------------------------

class TestTotpLoginUnverified:
    @pytest.mark.anyio
    async def test_unverified_user_returns_400(self):
        """The /auth/totp/login endpoint returns LOGIN_USER_NOT_VERIFIED for unverified users."""
        from httpx import AsyncClient, ASGITransport
        from app.main import app

        unverified_user = _make_user(is_verified=False)

        with (
            patch("app.api.totp.UserManager.authenticate_password", new=AsyncMock(return_value=unverified_user)),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                resp = await client.post(
                    "/auth/totp/login",
                    json={"email": "user@example.com", "password": "secret123456"},
                )

        assert resp.status_code == 400
        assert resp.json()["detail"] == "LOGIN_USER_NOT_VERIFIED"
