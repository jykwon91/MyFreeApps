"""Tests for password length validation in UserManager."""
import pytest
from fastapi_users import InvalidPasswordException

from app.core.auth import UserManager, MIN_PASSWORD_LENGTH


class TestPasswordValidation:
    @pytest.mark.anyio
    async def test_short_password_rejected(self) -> None:
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("short", user=None)
        assert "at least" in exc_info.value.reason

    @pytest.mark.anyio
    async def test_exactly_min_length_accepted(self) -> None:
        manager = UserManager.__new__(UserManager)
        await manager.validate_password("a" * MIN_PASSWORD_LENGTH, user=None)

    @pytest.mark.anyio
    async def test_long_password_accepted(self) -> None:
        manager = UserManager.__new__(UserManager)
        await manager.validate_password("a" * 64, user=None)

    @pytest.mark.anyio
    async def test_empty_password_rejected(self) -> None:
        manager = UserManager.__new__(UserManager)
        with pytest.raises(InvalidPasswordException) as exc_info:
            await manager.validate_password("", user=None)
        assert "at least" in exc_info.value.reason

    def test_min_length_constant(self) -> None:
        assert MIN_PASSWORD_LENGTH == 8
