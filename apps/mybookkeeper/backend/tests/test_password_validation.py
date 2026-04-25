"""Tests for password length validation and HIBP breach check in UserManager."""
import logging
from unittest.mock import AsyncMock, patch

import pytest
from fastapi_users import InvalidPasswordException

from app.core.auth import MIN_PASSWORD_LENGTH, UserManager
from app.services.user.hibp_service import HIBPCheckError


class TestMinLengthConstant:
    def test_min_length_is_12(self) -> None:
        assert MIN_PASSWORD_LENGTH == 12


class TestPasswordLengthValidation:
    @pytest.mark.anyio
    async def test_short_password_rejected(self) -> None:
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("short", user=None)
        assert "at least" in exc_info.value.reason

    @pytest.mark.anyio
    async def test_eleven_char_password_rejected(self) -> None:
        """11 characters is one short of the new minimum — must be rejected."""
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("a" * 11, user=None)
        assert "at least" in exc_info.value.reason
        assert "12" in exc_info.value.reason

    @pytest.mark.anyio
    async def test_empty_password_rejected(self) -> None:
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("", user=None)
        assert "at least" in exc_info.value.reason

    @pytest.mark.anyio
    @patch("app.core.auth.is_password_pwned", new_callable=AsyncMock)
    @patch("app.core.auth.settings")
    async def test_exactly_min_length_accepted_when_not_pwned(
        self, mock_settings, mock_hibp: AsyncMock
    ) -> None:
        mock_settings.hibp_enabled = True
        mock_hibp.return_value = False
        manager = UserManager.__new__(UserManager)
        # Should not raise
        await manager.validate_password("a" * MIN_PASSWORD_LENGTH, user=None)
        mock_hibp.assert_awaited_once()

    @pytest.mark.anyio
    @patch("app.core.auth.is_password_pwned", new_callable=AsyncMock)
    @patch("app.core.auth.settings")
    async def test_long_password_accepted_when_not_pwned(
        self, mock_settings, mock_hibp: AsyncMock
    ) -> None:
        mock_settings.hibp_enabled = True
        mock_hibp.return_value = False
        manager = UserManager.__new__(UserManager)
        await manager.validate_password("a" * 64, user=None)


class TestHIBPCheck:
    @pytest.mark.anyio
    @patch("app.core.auth.is_password_pwned", new_callable=AsyncMock)
    @patch("app.core.auth.settings")
    async def test_pwned_password_rejected(
        self, mock_settings, mock_hibp: AsyncMock
    ) -> None:
        """A 12+ char password that appears in HIBP must be rejected with the breach message."""
        mock_settings.hibp_enabled = True
        mock_hibp.return_value = True
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("P@ssw0rd1234", user=None)
        assert "data breach" in exc_info.value.reason
        assert "anonymously" in exc_info.value.reason
        mock_hibp.assert_awaited_once_with("P@ssw0rd1234")

    @pytest.mark.anyio
    @patch("app.core.auth.is_password_pwned", new_callable=AsyncMock)
    @patch("app.core.auth.settings")
    async def test_hibp_failure_fails_open(
        self, mock_settings, mock_hibp: AsyncMock, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When HIBP API is unreachable, accept the password and log a warning."""
        mock_settings.hibp_enabled = True
        mock_hibp.side_effect = HIBPCheckError("connection timeout")
        manager = UserManager.__new__(UserManager)
        with caplog.at_level(logging.WARNING, logger="app.core.auth"):
            # Should NOT raise — fail-open
            await manager.validate_password("ValidLongPass99", user=None)
        assert any("HIBP check failed" in r.message for r in caplog.records)

    @pytest.mark.anyio
    @patch("app.core.auth.is_password_pwned", new_callable=AsyncMock)
    @patch("app.core.auth.settings")
    async def test_hibp_disabled_skips_check(
        self, mock_settings, mock_hibp: AsyncMock
    ) -> None:
        """When HIBP_ENABLED=false, is_password_pwned must not be called."""
        mock_settings.hibp_enabled = False
        manager = UserManager.__new__(UserManager)
        await manager.validate_password("ValidLongPass99", user=None)
        mock_hibp.assert_not_awaited()


@pytest.mark.integration
class TestHIBPRealAPI:
    """Integration tests that call the real HIBP API. Skipped in offline CI.

    Run with: pytest -m integration
    """

    @pytest.mark.anyio
    async def test_well_known_pwned_password_detected(self) -> None:
        """'P@ssw0rd1234' is heavily pwned — HIBP must return True for it."""
        from app.services.user.hibp_service import is_password_pwned

        result = await is_password_pwned("P@ssw0rd1234")
        assert result is True, "Expected 'P@ssw0rd1234' to be flagged as pwned by HIBP"

    @pytest.mark.anyio
    async def test_unique_random_password_not_pwned(self) -> None:
        """A cryptographically random 32-char password should not appear in HIBP."""
        import secrets

        from app.services.user.hibp_service import is_password_pwned

        unique_pw = secrets.token_urlsafe(32)
        result = await is_password_pwned(unique_pw)
        assert result is False, f"Unexpectedly found random password in HIBP: {unique_pw}"
