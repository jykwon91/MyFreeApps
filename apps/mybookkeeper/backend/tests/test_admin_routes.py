"""MBK admin tests after the platform_shared admin extraction.

The generic admin user-management code lives in
``platform_shared.services.admin_user_service`` /
``platform_shared.repositories.admin_user_repo``. MBK still owns
``get_platform_stats``, ``clean_re_extract``, and ``list_all_orgs``.
This file covers both surfaces.
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from platform_shared.repositories import admin_user_repo as shared_admin_user_repo

from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.user.user import Role, User
from app.repositories import admin_repo, user_repo
from app.services.system import admin_service
from app.services.system.admin_user_service_factory import shared_admin_user_service


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


@pytest_asyncio.fixture()
async def regular_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="user@example.com",
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


class TestUserRepo:
    @pytest.mark.asyncio
    async def test_list_all_returns_users(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        users = await user_repo.list_all(db)
        emails = {u.email for u in users}
        assert "admin@example.com" in emails
        assert "user@example.com" in emails

    @pytest.mark.asyncio
    async def test_get_by_id_found(self, db: AsyncSession, admin_user: User) -> None:
        found = await user_repo.get_by_id(db, admin_user.id)
        assert found is not None
        assert found.id == admin_user.id

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self, db: AsyncSession) -> None:
        found = await user_repo.get_by_id(db, uuid.uuid4())
        assert found is None

    @pytest.mark.asyncio
    async def test_update_role(
        self, db: AsyncSession, regular_user: User
    ) -> None:
        updated = await user_repo.update_role(db, regular_user, Role.ADMIN)
        assert updated.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_set_active_false(
        self, db: AsyncSession, regular_user: User
    ) -> None:
        updated = await user_repo.set_active(db, regular_user, is_active=False)
        assert updated.is_active is False

    @pytest.mark.asyncio
    async def test_set_active_true(
        self, db: AsyncSession, regular_user: User
    ) -> None:
        await user_repo.set_active(db, regular_user, is_active=False)
        updated = await user_repo.set_active(db, regular_user, is_active=True)
        assert updated.is_active is True


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    """Route every admin code path's session helpers to the test DB session.

    Two layers to patch:
      1. MBK's local ``admin_service`` (still owns get_platform_stats /
         clean_re_extract / list_all_orgs).
      2. The platform_shared ``AdminUserService`` instance MBK owns —
         its ``_unit_of_work`` and ``_async_session_factory`` are
         instance attributes set at construction time.
    """
    @asynccontextmanager
    async def _fake_session():
        yield db

    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.services.system.admin_service.AsyncSessionLocal", _fake_session),
        patch("app.services.system.admin_service.unit_of_work", _fake_uow),
        patch.object(shared_admin_user_service, "_unit_of_work", _fake_uow),
        patch.object(shared_admin_user_service, "_async_session_factory", _fake_session),
    ):
        yield


class TestAdminServiceUpdateRole:
    @pytest.mark.asyncio
    async def test_update_role_success(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        result = await shared_admin_user_service.update_user_role(
            regular_user.id, Role.ADMIN, admin_user
        )
        assert result.role == Role.ADMIN

    @pytest.mark.asyncio
    async def test_update_own_role_rejected(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(ValueError, match="Cannot change your own role"):
            await shared_admin_user_service.update_user_role(
                admin_user.id, Role.USER, admin_user
            )

    @pytest.mark.asyncio
    async def test_update_nonexistent_user(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(LookupError, match="User not found"):
            await shared_admin_user_service.update_user_role(
                uuid.uuid4(), Role.ADMIN, admin_user
            )


class TestAdminServiceDeactivate:
    @pytest.mark.asyncio
    async def test_deactivate_success(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        result = await shared_admin_user_service.deactivate_user(regular_user.id, admin_user)
        assert result.is_active is False

    @pytest.mark.asyncio
    async def test_deactivate_self_rejected(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(ValueError, match="Cannot deactivate yourself"):
            await shared_admin_user_service.deactivate_user(admin_user.id, admin_user)

    @pytest.mark.asyncio
    async def test_deactivate_nonexistent_user(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(LookupError, match="User not found"):
            await shared_admin_user_service.deactivate_user(uuid.uuid4(), admin_user)


class TestAdminServiceActivate:
    @pytest.mark.asyncio
    async def test_activate_success(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        await user_repo.set_active(db, regular_user, is_active=False)
        result = await shared_admin_user_service.activate_user(regular_user.id, admin_user)
        assert result.is_active is True

    @pytest.mark.asyncio
    async def test_activate_self_rejected(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(ValueError, match="Cannot activate yourself"):
            await shared_admin_user_service.activate_user(admin_user.id, admin_user)

    @pytest.mark.asyncio
    async def test_activate_nonexistent_user(
        self, db: AsyncSession, admin_user: User
    ) -> None:
        with pytest.raises(LookupError, match="User not found"):
            await shared_admin_user_service.activate_user(uuid.uuid4(), admin_user)


@pytest_asyncio.fixture()
async def superuser(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="super@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=True,
        is_verified=True,
        role=Role.ADMIN,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def test_org(db: AsyncSession, admin_user: User) -> Organization:
    org = Organization(
        id=uuid.uuid4(),
        name="Test Org",
        created_by=admin_user.id,
    )
    db.add(org)
    await db.flush()
    member = OrganizationMember(
        organization_id=org.id,
        user_id=admin_user.id,
        org_role="owner",
    )
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org


class TestAdminRepo:
    """MBK-domain admin queries (orgs/transactions/documents).

    The user-count + set_superuser queries moved to platform_shared
    and are exercised in TestSharedAdminUserRepo below.
    """

    @pytest.mark.asyncio
    async def test_count_organizations(
        self, db: AsyncSession, test_org: Organization
    ) -> None:
        count = await admin_repo.count_organizations(db)
        assert count >= 1

    @pytest.mark.asyncio
    async def test_count_transactions_empty(self, db: AsyncSession) -> None:
        count = await admin_repo.count_transactions(db)
        assert count == 0

    @pytest.mark.asyncio
    async def test_count_documents_empty(self, db: AsyncSession) -> None:
        count = await admin_repo.count_documents(db)
        assert count == 0

    @pytest.mark.asyncio
    async def test_list_orgs_with_counts(
        self, db: AsyncSession, test_org: Organization, admin_user: User
    ) -> None:
        rows = await admin_repo.list_orgs_with_counts(db)
        assert len(rows) >= 1
        org_row = next(r for r in rows if r["id"] == test_org.id)
        assert org_row["name"] == "Test Org"
        assert org_row["member_count"] == 1
        assert org_row["transaction_count"] == 0
        assert org_row["owner_email"] == admin_user.email


class TestSharedAdminUserRepo:
    """Tests for the shared user-counting + superuser-toggling repo."""

    @pytest.mark.asyncio
    async def test_count_users(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        total, active, inactive = await shared_admin_user_repo.count_users(db, User)
        assert total >= 2
        assert active >= 2
        assert inactive == 0

    @pytest.mark.asyncio
    async def test_count_users_with_inactive(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        await user_repo.set_active(db, regular_user, is_active=False)
        await db.commit()
        total, active, inactive = await shared_admin_user_repo.count_users(db, User)
        assert total >= 2
        assert inactive >= 1

    @pytest.mark.asyncio
    async def test_set_superuser(
        self, db: AsyncSession, regular_user: User
    ) -> None:
        result = await shared_admin_user_repo.set_superuser(db, regular_user, is_superuser=True)
        assert result.is_superuser is True
        result = await shared_admin_user_repo.set_superuser(db, regular_user, is_superuser=False)
        assert result.is_superuser is False


class TestAdminServiceToggleSuperuser:
    @pytest.mark.asyncio
    async def test_toggle_superuser_success(
        self, db: AsyncSession, superuser: User, regular_user: User
    ) -> None:
        result = await shared_admin_user_service.toggle_superuser(regular_user.id, superuser)
        assert result.is_superuser is True

    @pytest.mark.asyncio
    async def test_toggle_superuser_revoke(
        self, db: AsyncSession, superuser: User, regular_user: User
    ) -> None:
        await shared_admin_user_repo.set_superuser(db, regular_user, is_superuser=True)
        await db.commit()
        result = await shared_admin_user_service.toggle_superuser(regular_user.id, superuser)
        assert result.is_superuser is False

    @pytest.mark.asyncio
    async def test_toggle_superuser_non_superuser_rejected(
        self, db: AsyncSession, admin_user: User, regular_user: User
    ) -> None:
        with pytest.raises(PermissionError, match="superusers"):
            await shared_admin_user_service.toggle_superuser(regular_user.id, admin_user)

    @pytest.mark.asyncio
    async def test_toggle_superuser_self_rejected(
        self, db: AsyncSession, superuser: User
    ) -> None:
        with pytest.raises(ValueError, match="Cannot change your own superuser"):
            await shared_admin_user_service.toggle_superuser(superuser.id, superuser)

    @pytest.mark.asyncio
    async def test_toggle_superuser_nonexistent_user(
        self, db: AsyncSession, superuser: User
    ) -> None:
        with pytest.raises(LookupError, match="User not found"):
            await shared_admin_user_service.toggle_superuser(uuid.uuid4(), superuser)


class TestAdminServicePlatformStats:
    @pytest.mark.asyncio
    async def test_get_platform_stats(
        self, db: AsyncSession, admin_user: User, regular_user: User, test_org: Organization
    ) -> None:
        stats = await admin_service.get_platform_stats()
        assert stats.total_users >= 2
