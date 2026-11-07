"""Tests for the test-only blackout hard-delete route."""
import datetime as dt
import uuid
from collections.abc import Iterator
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.context import RequestContext
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrgRole
from app.models.properties.property import Property
from app.models.user.user import User
from app.test_helpers.seed import _SeedBlackoutRequest, delete_blackout, seed_blackout


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


async def _seeded_blackout(db: AsyncSession, org: Organization, user: User) -> uuid.UUID:
    prop = Property(organization_id=org.id, user_id=user.id, name="Blackout House", address="1 Test St")
    db.add(prop)
    await db.flush()
    listing = Listing(
        organization_id=org.id, user_id=user.id, property_id=prop.id, title="Blackout Room",
        monthly_rate=Decimal("1500.00"), room_type="private_room", private_bath=False,
        parking_assigned=False, furnished=True, status="active", amenities=[],
        pets_on_premises=False,
    )
    db.add(listing)
    await db.flush()
    created = await seed_blackout(
        payload=_SeedBlackoutRequest(
            listing_id=listing.id, starts_on=dt.date(2026, 6, 5), ends_on=dt.date(2026, 6, 10),
        ),
        ctx=_ctx(org.id, user),
    )
    return created.id


async def _exists(db: AsyncSession, blackout_id: uuid.UUID) -> bool:
    row = await db.execute(select(ListingBlackout.id).where(ListingBlackout.id == blackout_id))
    return row.scalar_one_or_none() is not None


class TestDeleteBlackout:
    @pytest.mark.asyncio
    async def test_hard_deletes_my_blackout(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        blackout_id = await _seeded_blackout(db, test_org, test_user)

        await delete_blackout(blackout_id=blackout_id, ctx=_ctx(test_org.id, test_user))

        assert not await _exists(db, blackout_id)

    @pytest.mark.asyncio
    async def test_a_blackout_that_does_not_exist_is_404(
        self, test_user: User, test_org: Organization,
    ) -> None:
        with pytest.raises(HTTPException) as exc:
            await delete_blackout(blackout_id=uuid.uuid4(), ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_a_blackout_already_deleted_is_404(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        blackout_id = await _seeded_blackout(db, test_org, test_user)
        await delete_blackout(blackout_id=blackout_id, ctx=_ctx(test_org.id, test_user))

        with pytest.raises(HTTPException) as exc:
            await delete_blackout(blackout_id=blackout_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    async def test_another_organizations_blackout_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        blackout_id = await _seeded_blackout(db, test_org, test_user)

        with pytest.raises(HTTPException) as exc:
            await delete_blackout(blackout_id=blackout_id, ctx=_ctx(uuid.uuid4(), test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, blackout_id)

    @pytest.mark.asyncio
    async def test_outside_test_mode_is_404_and_kept(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        blackout_id = await _seeded_blackout(db, test_org, test_user)
        settings.allow_test_admin_promotion = False

        with pytest.raises(HTTPException) as exc:
            await delete_blackout(blackout_id=blackout_id, ctx=_ctx(test_org.id, test_user))

        assert exc.value.status_code == 404
        assert await _exists(db, blackout_id)
