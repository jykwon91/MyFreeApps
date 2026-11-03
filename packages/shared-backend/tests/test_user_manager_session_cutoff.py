"""A password change ends existing sessions, however it reaches the manager."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi_users import InvalidPasswordException

from platform_shared.auth.user_manager import PlatformBaseUserManager


class _Manager(PlatformBaseUserManager):
    reset_password_token_secret = "x" * 32
    verification_token_secret = "x" * 32
    hibp_enabled = False


def _manager() -> tuple[_Manager, AsyncMock]:
    user_db = AsyncMock()
    user_db.update.side_effect = lambda _user, values: values
    return _Manager(user_db), user_db


@pytest.mark.asyncio
async def test_changing_the_password_sets_the_cutoff() -> None:
    manager, _ = _manager()
    before = datetime.now(timezone.utc)

    written: dict[str, Any] = await manager._update(
        SimpleNamespace(email="a@example.com"), {"password": "a-long-enough-password"},
    )

    assert "hashed_password" in written
    assert before <= written["auth_valid_after"] <= datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_cutoff_is_taken_after_the_slow_password_checks() -> None:
    """A login with the old password during the breach check mustn't outlive the change."""
    manager, _ = _manager()
    finished_validating: list[datetime] = []

    async def slow_validate(_password: str, _user: object) -> None:
        finished_validating.append(datetime.now(timezone.utc))

    manager.validate_password = slow_validate  # type: ignore[method-assign]

    written: dict[str, Any] = await manager._update(
        SimpleNamespace(email="a@example.com"), {"password": "a-long-enough-password"},
    )

    assert written["auth_valid_after"] >= finished_validating[0]


@pytest.mark.asyncio
async def test_a_rejected_password_changes_nothing() -> None:
    manager, user_db = _manager()

    async def reject(_password: str, _user: object) -> None:
        raise InvalidPasswordException(reason="too short")

    manager.validate_password = reject  # type: ignore[method-assign]

    with pytest.raises(InvalidPasswordException):
        await manager._update(SimpleNamespace(email="a@example.com"), {"password": "short"})

    user_db.update.assert_not_called()


@pytest.mark.parametrize(
    "update", [{"display_name": "Ada"}, {"password": None}], ids=["other field", "no password"],
)
@pytest.mark.asyncio
async def test_other_updates_leave_the_cutoff_alone(update: dict[str, Any]) -> None:
    manager, _ = _manager()

    written: dict[str, Any] = await manager._update(SimpleNamespace(email="a@example.com"), update)

    assert "auth_valid_after" not in written
