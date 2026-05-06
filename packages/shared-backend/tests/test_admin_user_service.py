"""Unit tests for ``platform_shared.services.admin_user_service``.

Mocks the unit-of-work + session factory so the service-layer business
rules (self-target guards, superuser permission checks, missing-user
LookupError) are exercised without a real DB.
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from platform_shared.core.permissions import Role
from platform_shared.services.admin_user_service import AdminUserService


# ---------------------------------------------------------------------------
# Fixtures + fakes
# ---------------------------------------------------------------------------


class _FakeUser:
    """Stand-in for an app's User row."""

    def __init__(
        self,
        *,
        id: uuid.UUID | None = None,
        role: Role = Role.USER,
        is_active: bool = True,
        is_superuser: bool = False,
    ) -> None:
        self.id = id or uuid.uuid4()
        self.role = role
        self.is_active = is_active
        self.is_superuser = is_superuser


def _build_service(
    *,
    target: _FakeUser | None,
) -> tuple[AdminUserService, MagicMock]:
    """Build a service whose db helpers return mocks.

    The mocks expose `target` via ``admin_user_repo.get_by_id`` and
    record assignments to the target row so tests can assert.
    """
    fake_db = MagicMock(name="db")

    @asynccontextmanager
    async def fake_uow():
        yield fake_db

    @asynccontextmanager
    async def fake_factory():
        yield fake_db

    service = AdminUserService(
        user_model=_FakeUser,
        unit_of_work=fake_uow,
        async_session_factory=fake_factory,
    )

    return service, fake_db


# ---------------------------------------------------------------------------
# update_user_role
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_user_role_blocks_self_target():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN)

    with pytest.raises(ValueError, match="own role"):
        await service.update_user_role(admin.id, Role.USER, admin)


@pytest.mark.asyncio
async def test_update_user_role_raises_lookup_when_user_missing():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(LookupError):
            await service.update_user_role(uuid.uuid4(), Role.ADMIN, admin)


@pytest.mark.asyncio
async def test_update_user_role_assigns_new_role_on_success():
    target = _FakeUser(role=Role.USER)
    service, _ = _build_service(target=target)
    admin = _FakeUser(role=Role.ADMIN)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        result = await service.update_user_role(target.id, Role.ADMIN, admin)
    assert result is target
    assert target.role == Role.ADMIN


# ---------------------------------------------------------------------------
# deactivate_user / activate_user
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deactivate_blocks_self():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN)
    with pytest.raises(ValueError, match="deactivate yourself"):
        await service.deactivate_user(admin.id, admin)


@pytest.mark.asyncio
async def test_deactivate_sets_is_active_false():
    target = _FakeUser(is_active=True)
    service, _ = _build_service(target=target)
    admin = _FakeUser(role=Role.ADMIN)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        result = await service.deactivate_user(target.id, admin)
    assert result is target
    assert target.is_active is False


@pytest.mark.asyncio
async def test_deactivate_raises_lookup_when_user_missing():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN)
    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=None),
    ):
        with pytest.raises(LookupError):
            await service.deactivate_user(uuid.uuid4(), admin)


@pytest.mark.asyncio
async def test_activate_blocks_self():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN)
    with pytest.raises(ValueError, match="activate yourself"):
        await service.activate_user(admin.id, admin)


@pytest.mark.asyncio
async def test_activate_sets_is_active_true():
    target = _FakeUser(is_active=False)
    service, _ = _build_service(target=target)
    admin = _FakeUser(role=Role.ADMIN)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        await service.activate_user(target.id, admin)
    assert target.is_active is True


# ---------------------------------------------------------------------------
# toggle_superuser
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_toggle_superuser_requires_caller_is_superuser():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN, is_superuser=False)

    with pytest.raises(PermissionError, match="superusers"):
        await service.toggle_superuser(uuid.uuid4(), admin)


@pytest.mark.asyncio
async def test_toggle_superuser_blocks_self_target():
    service, _ = _build_service(target=None)
    admin = _FakeUser(role=Role.ADMIN, is_superuser=True)

    with pytest.raises(ValueError, match="own superuser"):
        await service.toggle_superuser(admin.id, admin)


@pytest.mark.asyncio
async def test_toggle_superuser_flips_flag_to_true():
    target = _FakeUser(is_superuser=False)
    service, _ = _build_service(target=target)
    admin = _FakeUser(role=Role.ADMIN, is_superuser=True)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        await service.toggle_superuser(target.id, admin)
    assert target.is_superuser is True


@pytest.mark.asyncio
async def test_toggle_superuser_flips_flag_to_false():
    target = _FakeUser(is_superuser=True)
    service, _ = _build_service(target=target)
    admin = _FakeUser(role=Role.ADMIN, is_superuser=True)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.get_by_id",
        new=AsyncMock(return_value=target),
    ):
        await service.toggle_superuser(target.id, admin)
    assert target.is_superuser is False


# ---------------------------------------------------------------------------
# get_user_stats / list_users
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_stats_returns_repo_counts():
    service, _ = _build_service(target=None)
    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.count_users",
        new=AsyncMock(return_value=(10, 7, 3)),
    ):
        stats = await service.get_user_stats()
    assert stats.total_users == 10
    assert stats.active_users == 7
    assert stats.inactive_users == 3


@pytest.mark.asyncio
async def test_list_users_delegates_to_repo():
    target_a = _FakeUser()
    target_b = _FakeUser()
    service, _ = _build_service(target=None)

    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.list_all",
        new=AsyncMock(return_value=[target_a, target_b]),
    ):
        users = list(await service.list_users())
    assert users == [target_a, target_b]


@pytest.mark.asyncio
async def test_list_users_passes_pagination_kwargs():
    """The service must forward limit/offset to the repo verbatim.

    Default values matter: ``limit=50, offset=0`` is the security
    backstop against a single compromised admin token exfiltrating
    the entire user table.
    """
    service, _ = _build_service(target=None)
    mock = AsyncMock(return_value=[])
    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.list_all",
        new=mock,
    ):
        await service.list_users(limit=10, offset=20)
    _, kwargs = mock.call_args
    assert kwargs == {"limit": 10, "offset": 20}


@pytest.mark.asyncio
async def test_list_users_default_limit_is_50():
    service, _ = _build_service(target=None)
    mock = AsyncMock(return_value=[])
    with patch(
        "platform_shared.services.admin_user_service.admin_user_repo.list_all",
        new=mock,
    ):
        await service.list_users()
    _, kwargs = mock.call_args
    assert kwargs["limit"] == 50
    assert kwargs["offset"] == 0
