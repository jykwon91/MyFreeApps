"""Tests for the test-only second-member routes."""
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi_users.jwt import decode_jwt
from fastapi_users.password import PasswordHelper
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import organization_repo, user_repo
from app.test_helpers.member_seed import _CreateUserRequest, create_user, get_invite_token


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.member_seed.unit_of_work", _fake_uow):
        yield


@pytest.fixture
def test_mode() -> Iterator[None]:
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    try:
        yield
    finally:
        settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _invite(db: AsyncSession, org_id: uuid.UUID, user: User):
    return await organization_repo.create_invite(db, org_id, "e2e-viewer@example.com", "viewer", user.id)


class TestGetInviteToken:
    @pytest.mark.asyncio
    async def test_returns_the_token_of_a_pending_invite_to_my_organization(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        invite = await _invite(db, test_org.id, test_user)

        result = await get_invite_token(invite.id, ctx=_ctx(test_org.id, test_user))

        assert result.token == invite.token

    @pytest.mark.asyncio
    async def test_not_found_for_another_organizations_invite(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        other = Organization(name="Other org", created_by=test_user.id)
        db.add(other)
        await db.flush()
        invite = await _invite(db, other.id, test_user)

        with pytest.raises(HTTPException) as exc_info:
            await get_invite_token(invite.id, ctx=_ctx(test_org.id, test_user))
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_not_found_once_the_invite_is_accepted(
        self, db: AsyncSession, test_user: User, test_org: Organization, test_mode: None,
    ) -> None:
        invite = await _invite(db, test_org.id, test_user)
        invite.status = "accepted"
        await db.flush()

        with pytest.raises(HTTPException) as exc_info:
            await get_invite_token(invite.id, ctx=_ctx(test_org.id, test_user))
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        invite = await _invite(db, test_org.id, test_user)
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await get_invite_token(invite.id, ctx=_ctx(test_org.id, test_user))
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404


def _new_user() -> _CreateUserRequest:
    return _CreateUserRequest(email="e2e-viewer-new@example.com", password="E2eViewerMemb3r!Secure", name="E2E Viewer")


class TestCreateUser:
    @pytest.mark.asyncio
    async def test_creates_a_verified_user_and_a_token_signed_in_as_it(
        self, db: AsyncSession, test_mode: None,
    ) -> None:
        created = await create_user(_new_user())

        user = await user_repo.get_by_id(db, created.id)
        assert user is not None
        assert user.email == "e2e-viewer-new@example.com"
        assert user.is_verified and user.is_active and not user.is_superuser
        verified, _ = PasswordHelper().verify_and_update("E2eViewerMemb3r!Secure", user.hashed_password)
        assert verified
        claims = decode_jwt(created.access_token, settings.secret_key, ["fastapi-users:auth"])
        assert claims["sub"] == str(created.id)

    @pytest.mark.asyncio
    async def test_conflict_when_the_email_is_taken(self, test_user: User, test_mode: None) -> None:
        with pytest.raises(HTTPException) as exc_info:
            await create_user(_CreateUserRequest(email=test_user.email.upper(), password="E2eViewerMemb3r!Secure", name="Dup"))
        assert exc_info.value.status_code == 409

    @pytest.mark.asyncio
    async def test_not_found_outside_test_mode(self, db: AsyncSession) -> None:
        original = settings.allow_test_admin_promotion
        settings.allow_test_admin_promotion = False
        try:
            with pytest.raises(HTTPException) as exc_info:
                await create_user(_new_user())
        finally:
            settings.allow_test_admin_promotion = original
        assert exc_info.value.status_code == 404
        assert await user_repo.get_by_email(db, "e2e-viewer-new@example.com") is None
