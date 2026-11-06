"""Tests for organization role-based access control.

Validates that each OrgRole (USER, ADMIN, OWNER) can only perform
the operations allowed by the permission layer. Tests at two levels:

1. Permission dependency unit tests (require_org_role).
2. Service-level enforcement of business rules (who can invite, delete org, etc.).
"""
import uuid
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import require_org_role
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember, OrgRole
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
        email="role-owner@example.com",
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
async def admin_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="role-admin@example.com",
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
        email="role-user@example.com",
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
    org = await organization_repo.create(db, "Role Test Org", owner_user.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest_asyncio.fixture()
async def org_with_all_roles(
    db: AsyncSession,
    org: Organization,
    owner_user: User,
    admin_user: User,
    regular_user: User,
) -> Organization:
    """Add admin and user members to the org (owner already added by org fixture)."""
    for user, role in [
        (admin_user, "admin"),
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


@pytest_asyncio.fixture()
async def second_admin(db: AsyncSession, org_with_all_roles: Organization) -> User:
    user = User(
        id=uuid.uuid4(),
        email="role-admin-2@example.com",
        hashed_password="fakehash",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    db.add(OrganizationMember(organization_id=org_with_all_roles.id, user_id=user.id, org_role="admin"))
    await db.commit()
    await db.refresh(user)
    return user


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
# require_org_role Dependency Tests
# ---------------------------------------------------------------------------


class TestRequireOrgRole:
    """Unit tests for the require_org_role dependency factory."""

    @pytest.mark.asyncio
    async def test_owner_allowed_for_owner_only(self) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.OWNER)
        result = await checker(ctx)
        assert result.org_role == OrgRole.OWNER

    @pytest.mark.asyncio
    async def test_admin_rejected_for_owner_only(self) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.ADMIN)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_user_rejected_for_owner_only(self) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_allowed_for_owner_or_admin(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.ADMIN)
        result = await checker(ctx)
        assert result.org_role == OrgRole.ADMIN

    @pytest.mark.asyncio
    async def test_user_rejected_for_owner_or_admin(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(uuid.uuid4(), uuid.uuid4(), OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_all_roles_allowed_when_all_specified(self) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.USER, OrgRole.VIEWER)
        for role in OrgRole:
            ctx = _ctx(uuid.uuid4(), uuid.uuid4(), role)
            result = await checker(ctx)
            assert result.org_role == role


# ---------------------------------------------------------------------------
# User (regular) Restrictions
# ---------------------------------------------------------------------------


class TestUserRestrictions:
    """Regular user can read but cannot mutate organization state."""

    @pytest.mark.asyncio
    async def test_user_can_list_members(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
    ) -> None:
        members = await organization_service.list_members(org_with_all_roles.id)
        assert len(members) == 3  # owner + admin + user

    @pytest.mark.asyncio
    async def test_user_cannot_update_member_role(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        regular_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(org_with_all_roles.id, regular_user.id, OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_user_cannot_create_invite(
        self,
        org_with_all_roles: Organization,
        regular_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(org_with_all_roles.id, regular_user.id, OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_user_cannot_delete_org(
        self,
        org_with_all_roles: Organization,
        regular_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(org_with_all_roles.id, regular_user.id, OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_user_cannot_update_org_name(
        self,
        org_with_all_roles: Organization,
        regular_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(org_with_all_roles.id, regular_user.id, OrgRole.USER)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Admin Permissions
# ---------------------------------------------------------------------------


class TestAdminPermissions:
    """Admin can invite members and manage roles, but cannot delete the org."""

    @pytest.mark.asyncio
    async def test_admin_can_invite(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
    ) -> None:
        invite = await organization_service.create_invite(
            org_with_all_roles.id, "new-via-admin@example.com", "user", admin_user.id,
        )
        assert invite.email == "new-via-admin@example.com"
        assert invite.invited_by == admin_user.id

    @pytest.mark.asyncio
    async def test_admin_can_change_user_role(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        regular_user: User,
    ) -> None:
        updated = await organization_service.update_member_role(
            org_with_all_roles.id, regular_user.id, "admin", admin_user.id,
        )
        assert updated.org_role == "admin"

    @pytest.mark.asyncio
    async def test_admin_can_remove_user(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        regular_user: User,
    ) -> None:
        await organization_service.remove_member(
            org_with_all_roles.id, regular_user.id, admin_user.id,
        )
        member = await organization_repo.get_member(db, org_with_all_roles.id, regular_user.id)
        assert member is None

    @pytest.mark.asyncio
    async def test_admin_cannot_delete_org(
        self,
        org_with_all_roles: Organization,
        admin_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(org_with_all_roles.id, admin_user.id, OrgRole.ADMIN)
        with pytest.raises(HTTPException) as exc_info:
            await checker(ctx)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_passes_owner_or_admin_check(
        self,
        org_with_all_roles: Organization,
        admin_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER, OrgRole.ADMIN)
        ctx = _ctx(org_with_all_roles.id, admin_user.id, OrgRole.ADMIN)
        result = await checker(ctx)
        assert result.org_role == OrgRole.ADMIN

    @pytest.mark.asyncio
    async def test_admin_cannot_change_owner_role(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        owner_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot change the owner"):
            await organization_service.update_member_role(
                org_with_all_roles.id, owner_user.id, "admin", admin_user.id,
            )

    @pytest.mark.asyncio
    async def test_admin_cannot_remove_owner(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        owner_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot remove the owner"):
            await organization_service.remove_member(
                org_with_all_roles.id, owner_user.id, admin_user.id,
            )

    @pytest.mark.asyncio
    async def test_admin_cannot_assign_owner_role(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        regular_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot assign owner role"):
            await organization_service.update_member_role(
                org_with_all_roles.id, regular_user.id, "owner", admin_user.id,
            )

    @pytest.mark.asyncio
    @pytest.mark.parametrize("new_role", ["user", "viewer"])
    async def test_admin_cannot_demote_another_admin(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        second_admin: User,
        new_role: str,
    ) -> None:
        with pytest.raises(PermissionError, match="Only the owner can change an admin's role"):
            await organization_service.update_member_role(
                org_with_all_roles.id, second_admin.id, new_role, admin_user.id,
            )
        member = await organization_repo.get_member(db, org_with_all_roles.id, second_admin.id)
        assert member is not None
        await db.refresh(member)
        assert member.org_role == "admin"

    @pytest.mark.asyncio
    async def test_admin_cannot_remove_another_admin(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        admin_user: User,
        second_admin: User,
    ) -> None:
        with pytest.raises(PermissionError, match="Only the owner can remove an admin"):
            await organization_service.remove_member(
                org_with_all_roles.id, second_admin.id, admin_user.id,
            )
        assert await organization_repo.get_member(db, org_with_all_roles.id, second_admin.id) is not None

    @pytest.mark.asyncio
    async def test_owner_can_demote_and_remove_any_admin(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
        admin_user: User,
        second_admin: User,
    ) -> None:
        updated = await organization_service.update_member_role(
            org_with_all_roles.id, second_admin.id, "viewer", owner_user.id,
        )
        assert updated.org_role == "viewer"
        await organization_service.remove_member(org_with_all_roles.id, admin_user.id, owner_user.id)
        assert await organization_repo.get_member(db, org_with_all_roles.id, admin_user.id) is None


# ---------------------------------------------------------------------------
# Owner Permissions
# ---------------------------------------------------------------------------


class TestOwnerPermissions:
    """Owner can do everything."""

    @pytest.mark.asyncio
    async def test_owner_can_update_org_name(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        updated = await organization_service.update_organization(
            org_with_all_roles.id, "Owner Renamed", owner_user.id,
        )
        assert updated.name == "Owner Renamed"

    @pytest.mark.asyncio
    async def test_owner_can_invite(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        invite = await organization_service.create_invite(
            org_with_all_roles.id, "owner-invite@example.com", "admin", owner_user.id,
        )
        assert invite.org_role == "admin"

    @pytest.mark.asyncio
    async def test_owner_can_change_admin_to_user(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
        admin_user: User,
    ) -> None:
        updated = await organization_service.update_member_role(
            org_with_all_roles.id, admin_user.id, "user", owner_user.id,
        )
        assert updated.org_role == "user"

    @pytest.mark.asyncio
    async def test_owner_can_remove_admin(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
        admin_user: User,
    ) -> None:
        await organization_service.remove_member(
            org_with_all_roles.id, admin_user.id, owner_user.id,
        )
        member = await organization_repo.get_member(db, org_with_all_roles.id, admin_user.id)
        assert member is None

    @pytest.mark.asyncio
    async def test_owner_passes_owner_only_check(
        self,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        checker = require_org_role(OrgRole.OWNER)
        ctx = _ctx(org_with_all_roles.id, owner_user.id, OrgRole.OWNER)
        result = await checker(ctx)
        assert result.org_role == OrgRole.OWNER

    @pytest.mark.asyncio
    async def test_owner_can_delete_org(
        self,
        db: AsyncSession,
        owner_user: User,
    ) -> None:
        # Create a separate org to delete (don't destroy the shared fixture)
        org = await organization_repo.create(db, "Delete Me", owner_user.id)
        await db.commit()
        await db.refresh(org)

        await organization_service.delete_organization(org.id, owner_user.id)
        deleted = await organization_repo.get_by_id(db, org.id)
        assert deleted is None

    @pytest.mark.asyncio
    async def test_owner_cannot_change_own_role(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot change your own role"):
            await organization_service.update_member_role(
                org_with_all_roles.id, owner_user.id, "admin", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_owner_cannot_remove_self(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot remove yourself"):
            await organization_service.remove_member(
                org_with_all_roles.id, owner_user.id, owner_user.id,
            )


# ---------------------------------------------------------------------------
# Edge Cases
# ---------------------------------------------------------------------------


class TestRoleEdgeCases:
    @pytest.mark.asyncio
    async def test_cannot_invite_as_owner(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        with pytest.raises(ValueError, match="Cannot invite as owner"):
            await organization_service.create_invite(
                org_with_all_roles.id, "bad@example.com", "owner", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_role_change_for_nonexistent_member(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        with pytest.raises(LookupError, match="Member not found"):
            await organization_service.update_member_role(
                org_with_all_roles.id, uuid.uuid4(), "user", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_remove_nonexistent_member(
        self,
        db: AsyncSession,
        org_with_all_roles: Organization,
        owner_user: User,
    ) -> None:
        with pytest.raises(LookupError, match="Member not found"):
            await organization_service.remove_member(
                org_with_all_roles.id, uuid.uuid4(), owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_update_nonexistent_org(
        self,
        db: AsyncSession,
        owner_user: User,
    ) -> None:
        with pytest.raises(LookupError, match="Organization not found"):
            await organization_service.update_organization(
                uuid.uuid4(), "Ghost", owner_user.id,
            )

    @pytest.mark.asyncio
    async def test_delete_nonexistent_org(
        self,
        db: AsyncSession,
        owner_user: User,
    ) -> None:
        with pytest.raises(LookupError, match="Organization not found"):
            await organization_service.delete_organization(uuid.uuid4(), owner_user.id)


class TestTargetRowLock:
    """The admin check reads the target's role under a row lock, so a promotion can't slip in between."""

    @pytest.mark.asyncio
    async def test_get_member_for_update_locks_the_row_exclusively(
        self, db: AsyncSession, org_with_all_roles: Organization, regular_user: User,
    ) -> None:
        statements = []
        real_execute = db.execute

        async def _capture(statement, *args, **kwargs):
            statements.append(statement)
            return await real_execute(statement, *args, **kwargs)

        with patch.object(db, "execute", _capture):
            member = await organization_repo.get_member_for_update(db, org_with_all_roles.id, regular_user.id)

        assert member is not None and member.user_id == regular_user.id
        sql = str(statements[0].compile(dialect=postgresql.dialect()))
        assert sql.rstrip().endswith("FOR UPDATE")

    @pytest.mark.asyncio
    async def test_role_change_and_removal_read_the_target_locked(
        self, db: AsyncSession, org_with_all_roles: Organization, owner_user: User, regular_user: User,
    ) -> None:
        with patch.object(
            organization_repo, "get_member_for_update", wraps=organization_repo.get_member_for_update,
        ) as locked:
            await organization_service.update_member_role(
                org_with_all_roles.id, regular_user.id, "viewer", owner_user.id,
            )
            await organization_service.remove_member(org_with_all_roles.id, regular_user.id, owner_user.id)
        assert [c.args[1:] for c in locked.call_args_list] == [
            (org_with_all_roles.id, regular_user.id),
            (org_with_all_roles.id, regular_user.id),
        ]
