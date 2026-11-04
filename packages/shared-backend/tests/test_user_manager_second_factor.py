"""Wrong 2FA codes count toward lockout, and a password alone can't clear the count."""
from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from platform_shared.auth.user_manager import PlatformBaseUserManager
from platform_shared.core.auth_events import AuthEventType

CREDENTIALS = SimpleNamespace(username="a@example.com", password="right-password")


class _Manager(PlatformBaseUserManager):
    reset_password_token_secret = "x" * 32
    verification_token_secret = "x" * 32
    hibp_enabled = False


def _user(*, totp_enabled: bool, failed_login_count: int = 0) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid.uuid4(),
        email=CREDENTIALS.username,
        hashed_password="hash",
        is_active=True,
        is_verified=True,
        totp_enabled=totp_enabled,
        failed_login_count=failed_login_count,
        last_failed_login_at=None,
        locked_until=None,
    )


def _manager(user: SimpleNamespace, *, password_is_right: bool = True) -> _Manager:
    async def persist(target: SimpleNamespace, values: dict[str, Any]) -> SimpleNamespace:
        for field, value in values.items():
            setattr(target, field, value)
        return target

    user_db = AsyncMock()
    user_db.update.side_effect = persist
    user_db.session = MagicMock()
    user_db.session.refresh = AsyncMock()
    manager = _Manager(user_db)
    manager.get_by_email = AsyncMock(return_value=user)  # type: ignore[method-assign]
    manager.password_helper = MagicMock()
    manager.password_helper.verify_and_update.return_value = (password_is_right, None)
    return manager


def _both_login_paths(manager: _Manager) -> list[Callable[[Any], Awaitable[Any]]]:
    return [manager.authenticate, manager.authenticate_password]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [0, 1], ids=["jwt_login", "totp_login_password_step"])
async def test_right_password_does_not_clear_the_count_of_a_2fa_user(path: int) -> None:
    user = _user(totp_enabled=True, failed_login_count=3)
    manager = _manager(user)

    await _both_login_paths(manager)[path](CREDENTIALS)

    assert user.failed_login_count == 3


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [0, 1], ids=["jwt_login", "totp_login_password_step"])
async def test_right_password_clears_the_count_of_a_user_without_2fa(path: int) -> None:
    user = _user(totp_enabled=False, failed_login_count=3)
    manager = _manager(user)

    await _both_login_paths(manager)[path](CREDENTIALS)

    assert user.failed_login_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [0, 1], ids=["jwt_login", "totp_login_password_step"])
async def test_wrong_password_still_counts_for_a_2fa_user(path: int) -> None:
    user = _user(totp_enabled=True, failed_login_count=3)
    manager = _manager(user, password_is_right=False)

    assert await _both_login_paths(manager)[path](CREDENTIALS) is None

    assert user.failed_login_count == 4


@pytest.mark.asyncio
async def test_wrong_codes_lock_the_account_even_with_the_right_password() -> None:
    user = _user(totp_enabled=True)
    manager = _manager(user)

    for _ in range(manager.lockout_threshold):
        assert await manager.authenticate_password(CREDENTIALS) is user
        await manager.count_failed_second_factor(user)

    assert user.failed_login_count == manager.lockout_threshold
    assert user.locked_until is not None
    assert await manager.authenticate_password(CREDENTIALS) is None


@pytest.mark.asyncio
async def test_wrong_code_is_recorded_as_a_failed_login() -> None:
    user = _user(totp_enabled=True)
    manager = _manager(user)

    await manager.count_failed_second_factor(user)

    row = manager.user_db.session.add.call_args.args[0]
    assert row.event_type == AuthEventType.LOGIN_FAILURE
    assert row.user_id == user.id
    assert row.event_metadata == {"reason": "bad_totp"}


@pytest.mark.asyncio
async def test_finishing_the_login_clears_the_count_and_the_lock_state() -> None:
    user = _user(totp_enabled=True, failed_login_count=3)
    manager = _manager(user)

    await manager.clear_failed_logins(user)

    assert user.failed_login_count == 0
    assert user.last_failed_login_at is None
    assert user.locked_until is None


@pytest.mark.asyncio
async def test_a_failure_counts_from_the_locked_fresh_value() -> None:
    """Another request's failure, committed since this one loaded the user, still counts."""
    user = _user(totp_enabled=True, failed_login_count=1)
    manager = _manager(user)

    async def committed_elsewhere(target: SimpleNamespace, *_: Any, **__: Any) -> None:
        target.failed_login_count = manager.lockout_threshold - 1

    manager.user_db.session.refresh.side_effect = committed_elsewhere

    await manager.count_failed_second_factor(user)

    assert manager.user_db.session.refresh.await_args.kwargs == {"with_for_update": True}
    assert user.failed_login_count == manager.lockout_threshold
    assert user.locked_until is not None
