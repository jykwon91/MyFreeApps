import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user.user import Role, User
from app.repositories.user import user_repo


@pytest_asyncio.fixture()
async def regular_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="regular@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.USER,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def admin_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="admin@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        role=Role.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.api.test_utils.unit_of_work", _fake_uow):
        yield


class TestPromoteToAdmin:
    @pytest.mark.asyncio
    async def test_promote_regular_user_to_admin(
        self, db: AsyncSession, regular_user: User,
    ) -> None:
        assert regular_user.role == Role.USER

        await user_repo.update_role(db, regular_user, Role.ADMIN)
        await db.commit()
        await db.refresh(regular_user)

        assert regular_user.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_already_admin_is_noop(
        self, db: AsyncSession, admin_user: User,
    ) -> None:
        assert admin_user.role == Role.ADMIN
        await user_repo.update_role(db, admin_user, Role.ADMIN)
        assert admin_user.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_endpoint_gated_by_env_var(self) -> None:
        """The endpoint returns 404 when allow_test_admin_promotion is False."""
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings
        from fastapi import HTTPException

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = False
            fake_user = User(
                id=uuid.uuid4(),
                email="test@example.com",
                hashed_password="fakehash",
                is_active=True,
                is_superuser=False,
                is_verified=True,
                role=Role.USER,
            )
            with pytest.raises(HTTPException) as exc_info:
                await promote_to_admin(user=fake_user)
            assert exc_info.value.status_code == 404
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_endpoint_promotes_when_enabled(
        self, db: AsyncSession, regular_user: User,
    ) -> None:
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            result = await promote_to_admin(user=regular_user)
            assert result.role == Role.ADMIN
        finally:
            settings.allow_test_admin_promotion = original

    @pytest.mark.asyncio
    async def test_endpoint_returns_admin_user_unchanged(
        self, db: AsyncSession, admin_user: User,
    ) -> None:
        from app.api.test_utils import promote_to_admin
        from app.core.config import settings

        original = settings.allow_test_admin_promotion
        try:
            settings.allow_test_admin_promotion = True
            result = await promote_to_admin(user=admin_user)
            assert result.role == Role.ADMIN
        finally:
            settings.allow_test_admin_promotion = original
