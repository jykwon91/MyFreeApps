"""Tests for the test-only vendor seed and hard-delete routes."""
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
from app.repositories.vendors import vendor_repo
from app.test_helpers.seed import _SeedVendorRequest, delete_vendor, seed_vendor


@pytest.fixture(autouse=True)
def _patch_session(db: AsyncSession) -> Iterator[None]:
    @asynccontextmanager
    async def _fake_uow():
        yield db

    with patch("app.test_helpers.seed.unit_of_work", _fake_uow):
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


async def _seeded_vendor(org: Organization, user: User) -> uuid.UUID:
    created = await seed_vendor(_SeedVendorRequest(), ctx=_ctx(org.id, user))
    return created.id


async def _exists(db: AsyncSession, vendor_id: uuid.UUID, org: Organization, user: User) -> bool:
    found = await vendor_repo.get_by_id(
        db, vendor_id=vendor_id, organization_id=org.id, user_id=user.id, include_deleted=True,
    )
    return found is not None


class TestDeleteVendor:
    @pytest.mark.asyncio
    async def test_deletes_my_vendor(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        vendor_id = await _seeded_vendor(test_org, test_user)

        await delete_vendor(vendor_id, ctx=_ctx(test_org.id, test_user))

        assert not await _exists(db, vendor_id, test_org, test_user)

    @pytest.mark.asyncio
    async def test_a_vendor_that_does_not_exist_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await delete_vendor(uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_a_vendor_already_deleted_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        vendor_id = await _seeded_vendor(test_org, test_user)
        await delete_vendor(vendor_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await delete_vendor(vendor_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_vendor_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        vendor_id = await _seeded_vendor(test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await delete_vendor(vendor_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, vendor_id, test_org, test_user)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        vendor_id = await _seeded_vendor(test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await delete_vendor(vendor_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, vendor_id, test_org, test_user)
