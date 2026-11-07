"""Tests for the test-only listing seed and hard-delete routes."""
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
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories.listings import listing_repo
from app.test_helpers.seed import _SeedListingRequest, delete_listing, seed_listing


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


async def _seeded_listing(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    prop = Property(organization_id=org.id, user_id=user.id, name="E2E House", address="1 Test St")
    db.add(prop)
    await db.flush()
    created = await seed_listing(_SeedListingRequest(property_id=prop.id), ctx=_ctx(org.id, user))
    return created.id


class TestDeleteListing:
    @pytest.mark.asyncio
    async def test_deletes_my_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing_id = await _seeded_listing(db, test_org, test_user)

        await delete_listing(listing_id, ctx=_ctx(test_org.id, test_user))

        assert await listing_repo.get_by_id(db, listing_id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_a_listing_that_does_not_exist_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await delete_listing(uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_a_listing_already_deleted_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing_id = await _seeded_listing(db, test_org, test_user)
        await delete_listing(listing_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await delete_listing(listing_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_listing_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing_id = await _seeded_listing(db, test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await delete_listing(listing_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await listing_repo.get_by_id(db, listing_id, test_org.id) is not None

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing_id = await _seeded_listing(db, test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await delete_listing(listing_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await listing_repo.get_by_id(db, listing_id, test_org.id) is not None
