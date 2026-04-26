"""Tests for the VIEWER org role — read-only access enforcement.

Validates that:
1. require_write_access blocks OrgRole.VIEWER with 403.
2. require_write_access passes OWNER, ADMIN, USER.
3. update_member_role accepts viewer as a valid assignable role.
4. update_member_role rejects invalid role strings.
5. OrgRole enum includes VIEWER.
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import require_write_access
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole, OrganizationMember
from app.models.user.user import User
from app.repositories import organization_repo
from app.services.organization import organization_service


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def owner_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"viewer-owner-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def viewer_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"viewer-user-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def regular_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"viewer-regular-{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture()
async def org(db: AsyncSession, owner_user: User) -> Organization:
    org = await organization_repo.create(db, "Viewer Test Org", owner_user.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def org_with_viewer(
    db: AsyncSession,
    org: Organization,
    viewer_user: User,
    regular_user: User,
) -> Organization:
    for user, role in [
        (viewer_user, "viewer"),
        (regular_user, "user"),
    ]:
        member = OrganizationMember(
            organization_id=org.id,
            user_id=user.id,
            org_role=role,
        )
        db.add(member)
    await db.commit()
    return org


@pytest.fixture(autouse=True)
def _patch_service_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.organization.organization_service.AsyncSessionLocal", _fake_session),
        patch("app.services.organization.organization_service.unit_of_work", _fake_session),
    ):
        yield


def _ctx(org_id: uuid.UUID, user_id: uuid.UUID, role: OrgRole) -> RequestContext:
    return RequestContext(organization_id=org_id, user_id=user_id, org_role=role)


# ---------------------------------------------------------------------------
# OrgRole enum
# ---------------------------------------------------------------------------


class TestOrgRoleEnum:
    def test_viewer_is_valid_org_role(self) -> None:
        assert OrgRole.VIEWER == OrgRole("viewer")

    def test_viewer_value_is_string(self) -> None:
        assert OrgRole.VIEWER.value == "viewer"

    def test_all_four_roles_present(self) -> None:
        role_values = {r.value for r in OrgRole}
        assert role_values == {"owner", "admin", "user", "viewer"}


# ---------------------------------------------------------------------------
# require_write_access dependency
# ---------------------------------------------------------------------------


class TestRequireWriteAccess:
    @pytest.mark.asyncio
    async def test_viewer_is_blocked(self) -> None:
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.VIEWER)
        with pytest.raises(HTTPException) as exc_info:
            await require_write_access(ctx)
        assert exc_info.value.status_code == 403
        assert "read-only" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_owner_is_allowed(self) -> None:
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.OWNER)
        result = await require_write_access(ctx)
        assert result.org_role == OrgRole.OWNER

    @pytest.mark.asyncio
    async def test_admin_is_allowed(self) -> None:
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.ADMIN)
        result = await require_write_access(ctx)
        assert result.org_role == OrgRole.ADMIN

    @pytest.mark.asyncio
    async def test_user_is_allowed(self) -> None:
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.USER)
        result = await require_write_access(ctx)
        assert result.org_role == OrgRole.USER


# ---------------------------------------------------------------------------
# Service-level: assign viewer role
# ---------------------------------------------------------------------------


class TestViewerRoleAssignment:
    @pytest.mark.asyncio
    async def test_owner_can_change_user_to_viewer(
        self,
        db: AsyncSession,
        org_with_viewer: Organization,
        owner_user: User,
        regular_user: User,
    ) -> None:
        updated = await organization_service.update_member_role(
            org_with_viewer.id, regular_user.id, "viewer", owner_user.id,
        )
        assert updated.org_role == "viewer"

    @pytest.mark.asyncio
    async def test_owner_can_change_viewer_to_user(
        self,
        db: AsyncSession,
        org_with_viewer: Organization,
        owner_user: User,
        viewer_user: User,
    ) -> None:
        updated = await organization_service.update_member_role(
            org_with_viewer.id, viewer_user.id, "user", owner_user.id,
        )
        assert updated.org_role == "user"

    @pytest.mark.asyncio
    async def test_invalid_role_string_is_rejected(
        self,
        db: AsyncSession,
        org_with_viewer: Organization,
        owner_user: User,
        regular_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Invalid role"):
            await organization_service.update_member_role(
                org_with_viewer.id, regular_user.id, "superadmin", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_owner_role_still_rejected(
        self,
        db: AsyncSession,
        org_with_viewer: Organization,
        owner_user: User,
        regular_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot assign owner role"):
            await organization_service.update_member_role(
                org_with_viewer.id, regular_user.id, "owner", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_viewer_stored_in_db(
        self,
        db: AsyncSession,
        org_with_viewer: Organization,
        viewer_user: User,
    ) -> None:
        member = await organization_repo.get_member(db, org_with_viewer.id, viewer_user.id)
        assert member is not None
        assert member.org_role == "viewer"
