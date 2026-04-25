import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_role
from app.models.user.user import Role, User


@pytest.fixture()
def admin_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="admin@test.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.ADMIN,
    )


@pytest.fixture()
def regular_user() -> User:
    return User(
        id=uuid.uuid4(),
        email="user@test.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.USER,
    )


class TestRequireRole:
    @pytest.mark.asyncio
    async def test_allows_matching_role(self, admin_user: User) -> None:
        checker = require_role(Role.ADMIN)
        result = await checker(admin_user)
        assert result.id == admin_user.id

    @pytest.mark.asyncio
    async def test_allows_any_of_multiple_roles(self, regular_user: User) -> None:
        checker = require_role(Role.ADMIN, Role.USER)
        result = await checker(regular_user)
        assert result.id == regular_user.id

    @pytest.mark.asyncio
    async def test_rejects_non_matching_role(self, regular_user: User) -> None:
        checker = require_role(Role.ADMIN)
        with pytest.raises(HTTPException) as exc_info:
            await checker(regular_user)
        assert exc_info.value.status_code == 403
