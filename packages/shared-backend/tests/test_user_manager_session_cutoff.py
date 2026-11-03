"""A password change ends existing sessions, however it reaches the manager."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

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


@pytest.mark.parametrize(
    "update", [{"display_name": "Ada"}, {"password": None}], ids=["other field", "no password"],
)
@pytest.mark.asyncio
async def test_other_updates_leave_the_cutoff_alone(update: dict[str, Any]) -> None:
    manager, _ = _manager()

    written: dict[str, Any] = await manager._update(SimpleNamespace(email="a@example.com"), update)

    assert "auth_valid_after" not in written
