"""Tests for the test-only inquiry hard-delete route."""
import datetime as dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.user.user import User
from app.repositories import inquiry_repo
from app.schemas.inquiries.inquiry_create_request import InquiryCreateRequest
from app.test_helpers.seed import delete_inquiry, seed_inquiry


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with (
        patch("app.test_helpers.seed.unit_of_work", _fake_uow),
        patch("app.services.inquiries.inquiry_service.unit_of_work", _fake_uow),
    ):
        yield


@pytest.fixture(autouse=True)
def _test_mode() -> Iterator[None]:
    original = settings.allow_test_admin_promotion
    settings.allow_test_admin_promotion = True
    try:
        yield
    finally:
        settings.allow_test_admin_promotion = original


def _ctx(org_id: uuid.UUID, user: User) -> RequestContext:
    return RequestContext(user_id=user.id, organization_id=org_id, org_role=OrgRole.OWNER)


async def _seeded_inquiry(org: Organization, user: User) -> uuid.UUID:
    payload = InquiryCreateRequest(
        source="direct",
        inquirer_name="To Be Deleted",
        received_at=dt.datetime.now(dt.timezone.utc),
    )
    created = await seed_inquiry(payload=payload, ctx=_ctx(org.id, user))
    return created.id


class TestDeleteInquiry:
    @pytest.mark.asyncio
    async def test_hard_deletes_my_inquiry(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry_id = await _seeded_inquiry(test_org, test_user)

        await delete_inquiry(inquiry_id=inquiry_id, ctx=_ctx(test_org.id, test_user))

        assert await inquiry_repo.get_by_id(db, inquiry_id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_an_inquiry_that_does_not_exist_is_404(
        self, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await delete_inquiry(inquiry_id=uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_an_inquiry_already_deleted_is_404(
        self, test_user: User, test_org: Organization,
    ) -> None:
        inquiry_id = await _seeded_inquiry(test_org, test_user)
        await delete_inquiry(inquiry_id=inquiry_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await delete_inquiry(inquiry_id=inquiry_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_inquiry_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry_id = await _seeded_inquiry(test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await delete_inquiry(inquiry_id=inquiry_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await inquiry_repo.get_by_id(db, inquiry_id, test_org.id) is not None

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        inquiry_id = await _seeded_inquiry(test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await delete_inquiry(inquiry_id=inquiry_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await inquiry_repo.get_by_id(db, inquiry_id, test_org.id) is not None
