"""Tests for organization service — create, members, invites, role changes."""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization.organization import Organization
from app.models.organization.organization_invite import OrganizationInvite
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.user.user import Role, User
from app.repositories import organization_repo
from app.services.organization import organization_service


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="owner@example.com",
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
async def member_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="member@example.com",
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
async def org_with_owner(db: AsyncSession, owner: User) -> Organization:
    org = await organization_repo.create(db, "Test Workspace", owner.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.organization.organization_service.AsyncSessionLocal", _fake_session),
        patch("app.services.organization.organization_service.unit_of_work", _fake_session),
        patch("app.services.organization.organization_service.send_invite_email", return_value=True),
    ):
        yield


class TestCreateOrganization:
    @pytest.mark.asyncio
    async def test_creates_org_with_owner_member(
        self, db: AsyncSession, owner: User
    ) -> None:
        org = await organization_service.create_organization("My Workspace", owner.id)
        assert org.name == "My Workspace"
        assert org.created_by == owner.id

        member = await organization_repo.get_member(db, org.id, owner.id)
        assert member is not None
        assert member.org_role == "owner"


class TestListOrganizations:
    @pytest.mark.asyncio
    async def test_lists_user_orgs(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        orgs = await organization_service.list_user_organizations(owner.id)
        assert len(orgs) >= 1
        names = [o["name"] for o in orgs]
        assert "Test Workspace" in names


class TestMemberManagement:
    @pytest.mark.asyncio
    async def test_list_members(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        members = await organization_service.list_members(org_with_owner.id)
        assert len(members) == 1
        assert members[0]["user_id"] == owner.id
        assert members[0]["org_role"] == "owner"

    @pytest.mark.asyncio
    async def test_cannot_change_own_role(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with pytest.raises(ValueError, match="Cannot change your own role"):
            await organization_service.update_member_role(
                org_with_owner.id, owner.id, "admin", owner.id,
            )

    @pytest.mark.asyncio
    async def test_cannot_change_owner_role(
        self, db: AsyncSession, owner: User, member_user: User, org_with_owner: Organization
    ) -> None:
        member = OrganizationMember(
            organization_id=org_with_owner.id,
            user_id=member_user.id,
            org_role="admin",
        )
        db.add(member)
        await db.commit()

        with pytest.raises(ValueError, match="Cannot change the owner"):
            await organization_service.update_member_role(
                org_with_owner.id, owner.id, "admin", member_user.id,
            )

    @pytest.mark.asyncio
    async def test_cannot_assign_owner_role(
        self, db: AsyncSession, owner: User, member_user: User, org_with_owner: Organization
    ) -> None:
        member = OrganizationMember(
            organization_id=org_with_owner.id,
            user_id=member_user.id,
            org_role="editor",
        )
        db.add(member)
        await db.commit()

        with pytest.raises(ValueError, match="Cannot assign owner role"):
            await organization_service.update_member_role(
                org_with_owner.id, member_user.id, "owner", owner.id,
            )

    @pytest.mark.asyncio
    async def test_cannot_remove_self(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with pytest.raises(ValueError, match="Cannot remove yourself"):
            await organization_service.remove_member(
                org_with_owner.id, owner.id, owner.id,
            )

    @pytest.mark.asyncio
    async def test_cannot_remove_owner(
        self, db: AsyncSession, owner: User, member_user: User, org_with_owner: Organization
    ) -> None:
        member = OrganizationMember(
            organization_id=org_with_owner.id,
            user_id=member_user.id,
            org_role="admin",
        )
        db.add(member)
        await db.commit()

        with pytest.raises(ValueError, match="Cannot remove the owner"):
            await organization_service.remove_member(
                org_with_owner.id, owner.id, member_user.id,
            )


class TestInvites:
    @pytest.mark.asyncio
    async def test_create_invite(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        invite = await organization_service.create_invite(
            org_with_owner.id, "new@example.com", "editor", owner.id,
        )
        assert invite.email == "new@example.com"
        assert invite.org_role == "editor"
        assert invite.status == "pending"
        assert invite.token is not None
        assert invite.email_sent is True

    @pytest.mark.asyncio
    async def test_create_invite_sends_email(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with patch(
            "app.services.organization.organization_service.send_invite_email",
            return_value=True,
        ) as mock_send:
            invite = await organization_service.create_invite(
                org_with_owner.id, "recipient@example.com", "admin", owner.id,
            )
            mock_send.assert_called_once_with(
                recipient_email="recipient@example.com",
                org_name=org_with_owner.name,
                org_role="admin",
                inviter_name=owner.email,
                invite_token=invite.token,
            )
            assert invite.email_sent is True

    @pytest.mark.asyncio
    async def test_create_invite_email_failure_sets_flag_false(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with patch(
            "app.services.organization.organization_service.send_invite_email",
            return_value=False,
        ):
            invite = await organization_service.create_invite(
                org_with_owner.id, "recipient@example.com", "user", owner.id,
            )
            assert invite.email_sent is False

    @pytest.mark.asyncio
    async def test_cannot_invite_as_owner(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with pytest.raises(ValueError, match="Cannot invite as owner"):
            await organization_service.create_invite(
                org_with_owner.id, "new@example.com", "owner", owner.id,
            )

    @pytest.mark.asyncio
    async def test_accept_invite(
        self, db: AsyncSession, owner: User, member_user: User, org_with_owner: Organization
    ) -> None:
        invite = await organization_service.create_invite(
            org_with_owner.id, "member@example.com", "viewer", owner.id,
        )
        member = await organization_service.accept_invite(invite.token, member_user.id)
        assert member.organization_id == org_with_owner.id
        assert member.org_role == "viewer"

    @pytest.mark.asyncio
    async def test_accept_expired_invite(
        self, db: AsyncSession, owner: User, member_user: User, org_with_owner: Organization
    ) -> None:
        invite = await organization_repo.create_invite(
            db, org_with_owner.id, "member@example.com", "editor", owner.id,
        )
        invite.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db.commit()

        with pytest.raises(ValueError, match="expired"):
            await organization_service.accept_invite(invite.token, member_user.id)

    @pytest.mark.asyncio
    async def test_invite_already_member_blocked_at_create(
        self, db: AsyncSession, owner: User, org_with_owner: Organization
    ) -> None:
        with pytest.raises(ValueError, match="already a member"):
            await organization_service.create_invite(
                org_with_owner.id, owner.email, "user", owner.id,
            )

    @pytest.mark.asyncio
    async def test_accept_invalid_token(
        self, db: AsyncSession, member_user: User
    ) -> None:
        with pytest.raises(LookupError, match="not found"):
            await organization_service.accept_invite("bogus_token", member_user.id)
