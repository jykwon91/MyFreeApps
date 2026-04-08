"""Tests for organization CRUD and member management routes end-to-end.

Uses FastAPI TestClient with dependency overrides for auth and org context.
Tests the HTTP layer — status codes, response shapes, and error handling.
"""
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.context import RequestContext
from app.core.permissions import current_active_user, current_org_member, reject_demo_user, require_org_role
from app.main import app
from app.models.organization.organization import Organization
from app.models.organization.organization_invite import OrganizationInvite
from app.models.organization.organization_member import OrganizationMember, OrgRole
from app.models.user.user import User
from app.repositories import organization_repo


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture()
async def owner(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="route-owner@example.com",
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
async def second_user(db: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email="route-second@example.com",
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
async def org(db: AsyncSession, owner: User) -> Organization:
    org = await organization_repo.create(db, "Route Test Org", owner.id)
    await db.commit()
    await db.refresh(org)
    return org


@pytest.fixture(autouse=True)
def _patch_service_session(db: AsyncSession):
    """Route the service layer's AsyncSessionLocal to the test DB session."""
    @asynccontextmanager
    async def _fake_session():
        yield db

    with (
        patch("app.services.organization.organization_service.AsyncSessionLocal", _fake_session),
        patch("app.services.organization.organization_service.unit_of_work", _fake_session),
        patch("app.services.organization.organization_service.send_invite_email", return_value=True),
    ):
        yield


def _override_auth(user: User):
    """Return a dependency override that always resolves to the given user."""
    async def _dep():
        return user
    return _dep


def _override_org_member(user: User, org: Organization, role: OrgRole):
    """Return a dependency override for current_org_member."""
    async def _dep():
        return RequestContext(
            organization_id=org.id,
            user_id=user.id,
            org_role=role,
        )
    return _dep


def _override_require_role(user: User, org: Organization, role: OrgRole):
    """Return a factory override for require_org_role (any required roles)."""
    async def _dep():
        return RequestContext(
            organization_id=org.id,
            user_id=user.id,
            org_role=role,
        )
    return _dep


@pytest_asyncio.fixture()
async def client_as_owner(owner: User, org: Organization):
    """AsyncClient authenticated as the org owner."""
    from app.core.auth import current_active_user as cau

    app.dependency_overrides[cau] = _override_auth(owner)
    app.dependency_overrides[reject_demo_user] = _override_auth(owner)
    app.dependency_overrides[current_org_member] = _override_org_member(owner, org, OrgRole.OWNER)
    # Override require_org_role results: all require_org_role variants resolve to owner context
    _ctx = _override_require_role(owner, org, OrgRole.OWNER)
    app.dependency_overrides[require_org_role(OrgRole.OWNER)] = _ctx
    app.dependency_overrides[require_org_role(OrgRole.OWNER, OrgRole.ADMIN)] = _ctx

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


@pytest_asyncio.fixture()
async def client_as_admin(second_user: User, org: Organization, db: AsyncSession):
    """AsyncClient authenticated as an admin member."""
    member = OrganizationMember(
        organization_id=org.id,
        user_id=second_user.id,
        org_role="admin",
    )
    db.add(member)
    await db.commit()

    from app.core.auth import current_active_user as cau

    app.dependency_overrides[cau] = _override_auth(second_user)
    app.dependency_overrides[reject_demo_user] = _override_auth(second_user)
    app.dependency_overrides[current_org_member] = _override_org_member(
        second_user, org, OrgRole.ADMIN,
    )
    _ctx = _override_require_role(second_user, org, OrgRole.ADMIN)
    app.dependency_overrides[require_org_role(OrgRole.OWNER, OrgRole.ADMIN)] = _ctx
    app.dependency_overrides[require_org_role(OrgRole.OWNER)] = _override_require_role(
        second_user, org, OrgRole.ADMIN,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Create Organization
# ---------------------------------------------------------------------------


class TestCreateOrganization:
    @pytest.mark.asyncio
    async def test_create_returns_201(self, client_as_owner: AsyncClient) -> None:
        resp = await client_as_owner.post(
            "/organizations", json={"name": "New Workspace"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "New Workspace"
        assert "id" in data
        assert "created_at" in data

    @pytest.mark.asyncio
    async def test_create_returns_org_fields(self, client_as_owner: AsyncClient, owner: User) -> None:
        resp = await client_as_owner.post(
            "/organizations", json={"name": "Fields Check"},
        )
        data = resp.json()
        assert data["created_by"] == str(owner.id)


# ---------------------------------------------------------------------------
# List Organizations
# ---------------------------------------------------------------------------


class TestListOrganizations:
    @pytest.mark.asyncio
    async def test_list_returns_at_least_one(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.get("/organizations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        names = [o["name"] for o in data]
        assert "Route Test Org" in names

    @pytest.mark.asyncio
    async def test_list_includes_role(self, client_as_owner: AsyncClient) -> None:
        resp = await client_as_owner.get("/organizations")
        for org_data in resp.json():
            assert "org_role" in org_data


# ---------------------------------------------------------------------------
# Update Organization
# ---------------------------------------------------------------------------


class TestUpdateOrganization:
    @pytest.mark.asyncio
    async def test_update_name(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.patch(
            f"/organizations/{org.id}", json={"name": "Updated Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    @pytest.mark.asyncio
    async def test_update_wrong_org_returns_403(
        self, client_as_owner: AsyncClient,
    ) -> None:
        fake_id = uuid.uuid4()
        resp = await client_as_owner.patch(
            f"/organizations/{fake_id}", json={"name": "Nope"},
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Delete Organization
# ---------------------------------------------------------------------------


class TestDeleteOrganization:
    @pytest.mark.asyncio
    async def test_delete_own_org_returns_204(
        self,
        client_as_owner: AsyncClient,
        org: Organization,
    ) -> None:
        resp = await client_as_owner.delete(f"/organizations/{org.id}")
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_wrong_org_returns_403(
        self, client_as_owner: AsyncClient,
    ) -> None:
        resp = await client_as_owner.delete(f"/organizations/{uuid.uuid4()}")
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# List Members
# ---------------------------------------------------------------------------


class TestListMembers:
    @pytest.mark.asyncio
    async def test_list_returns_owner(
        self, client_as_owner: AsyncClient, org: Organization, owner: User,
    ) -> None:
        resp = await client_as_owner.get(f"/organizations/{org.id}/members")
        assert resp.status_code == 200
        members = resp.json()
        assert len(members) >= 1
        user_ids = [m["user_id"] for m in members]
        assert str(owner.id) in user_ids


# ---------------------------------------------------------------------------
# Invite Flow
# ---------------------------------------------------------------------------


class TestInviteFlow:
    @pytest.mark.asyncio
    async def test_create_invite_returns_201(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.post(
            f"/organizations/{org.id}/invites",
            json={"email": "invitee@example.com", "org_role": "user"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "invitee@example.com"
        assert data["org_role"] == "user"
        assert data["status"] == "pending"
        assert "email_sent" in data

    @pytest.mark.asyncio
    async def test_cannot_invite_as_owner_role(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.post(
            f"/organizations/{org.id}/invites",
            json={"email": "bad@example.com", "org_role": "owner"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_list_invites(
        self,
        db: AsyncSession,
        client_as_owner: AsyncClient,
        org: Organization,
        owner: User,
    ) -> None:
        await organization_repo.create_invite(
            db, org.id, "listed@example.com", "viewer", owner.id,
        )
        await db.commit()

        resp = await client_as_owner.get(f"/organizations/{org.id}/invites")
        assert resp.status_code == 200
        emails = [i["email"] for i in resp.json()]
        assert "listed@example.com" in emails


# ---------------------------------------------------------------------------
# Accept Invite
# ---------------------------------------------------------------------------


class TestAcceptInvite:
    @pytest.mark.asyncio
    async def test_accept_invite_success(
        self,
        db: AsyncSession,
        client_as_owner: AsyncClient,
        org: Organization,
        owner: User,
        second_user: User,
    ) -> None:
        invite = await organization_repo.create_invite(
            db, org.id, second_user.email, "viewer", owner.id,
        )
        await db.commit()

        # Override auth to be the second_user accepting
        from app.core.auth import current_active_user as cau
        app.dependency_overrides[cau] = _override_auth(second_user)
        app.dependency_overrides[reject_demo_user] = _override_auth(second_user)

        resp = await client_as_owner.post(
            f"/organizations/invites/{invite.token}/accept",
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["organization_id"] == str(org.id)
        assert data["org_role"] == "viewer"

    @pytest.mark.asyncio
    async def test_accept_invalid_token_returns_404(
        self, client_as_owner: AsyncClient,
    ) -> None:
        resp = await client_as_owner.post(
            "/organizations/invites/totally_bogus_token/accept",
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Change Member Role
# ---------------------------------------------------------------------------


class TestChangeMemberRole:
    @pytest.mark.asyncio
    async def test_change_role_success(
        self,
        db: AsyncSession,
        client_as_owner: AsyncClient,
        org: Organization,
        second_user: User,
    ) -> None:
        member = OrganizationMember(
            organization_id=org.id,
            user_id=second_user.id,
            org_role="user",
        )
        db.add(member)
        await db.commit()

        resp = await client_as_owner.patch(
            f"/organizations/{org.id}/members/{second_user.id}/role",
            json={"org_role": "admin"},
        )
        assert resp.status_code == 200
        assert resp.json()["org_role"] == "admin"

    @pytest.mark.asyncio
    async def test_change_own_role_returns_400(
        self,
        client_as_owner: AsyncClient,
        org: Organization,
        owner: User,
    ) -> None:
        resp = await client_as_owner.patch(
            f"/organizations/{org.id}/members/{owner.id}/role",
            json={"org_role": "admin"},
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_change_nonexistent_member_returns_404(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.patch(
            f"/organizations/{org.id}/members/{uuid.uuid4()}/role",
            json={"org_role": "admin"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Remove Member
# ---------------------------------------------------------------------------


class TestRemoveMember:
    @pytest.mark.asyncio
    async def test_remove_member_success(
        self,
        db: AsyncSession,
        client_as_owner: AsyncClient,
        org: Organization,
        second_user: User,
    ) -> None:
        member = OrganizationMember(
            organization_id=org.id,
            user_id=second_user.id,
            org_role="editor",
        )
        db.add(member)
        await db.commit()

        resp = await client_as_owner.delete(
            f"/organizations/{org.id}/members/{second_user.id}",
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_remove_self_returns_400(
        self, client_as_owner: AsyncClient, org: Organization, owner: User,
    ) -> None:
        resp = await client_as_owner.delete(
            f"/organizations/{org.id}/members/{owner.id}",
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_remove_owner_returns_400(
        self,
        db: AsyncSession,
        client_as_owner: AsyncClient,
        org: Organization,
        owner: User,
        second_user: User,
    ) -> None:
        # Add second_user as admin so the route override looks right
        member = OrganizationMember(
            organization_id=org.id,
            user_id=second_user.id,
            org_role="admin",
        )
        db.add(member)
        await db.commit()

        # Override auth to second_user (admin) trying to remove owner
        from app.core.auth import current_active_user as cau
        _ctx_fn = _override_org_member(second_user, org, OrgRole.ADMIN)
        app.dependency_overrides[cau] = _override_auth(second_user)
        app.dependency_overrides[current_org_member] = _ctx_fn
        _admin_ctx = _override_require_role(second_user, org, OrgRole.ADMIN)
        app.dependency_overrides[require_org_role(OrgRole.OWNER, OrgRole.ADMIN)] = _admin_ctx

        resp = await client_as_owner.delete(
            f"/organizations/{org.id}/members/{owner.id}",
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_remove_nonexistent_returns_404(
        self, client_as_owner: AsyncClient, org: Organization,
    ) -> None:
        resp = await client_as_owner.delete(
            f"/organizations/{org.id}/members/{uuid.uuid4()}",
        )
        assert resp.status_code == 404
