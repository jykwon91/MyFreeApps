"""Service-layer tests for ``listing_service.get_public_listing``.

The public inquiry-form route delegates the slug lookup here; the service owns
the session, the not-found WARNING log, and raises LookupError (route → 404).
"""
from __future__ import annotations

import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.services.listings import listing_service
from app.services.listings.listing_not_found_error import ListingNotFoundError

_LOGGER = "app.services.listings.listing_service"


def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch("app.services.listings.listing_service.AsyncSessionLocal", _fake)


async def _seed_listing(
    db: AsyncSession, org: Organization, user: User, *, slug: str,
    deleted_at: datetime | None = None,
) -> Listing:
    prop = Property(
        organization_id=org.id, user_id=user.id,
        name="Travel-Nurse House", address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org.id,
        user_id=user.id,
        property_id=prop.id,
        title="Master Bedroom",
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False,
        parking_assigned=False,
        furnished=True,
        status="active",
        amenities=[],
        pets_on_premises=False,
        slug=slug,
        deleted_at=deleted_at,
    )
    db.add(listing)
    await db.commit()
    return listing


class TestGetPublicListing:
    @pytest.mark.asyncio
    async def test_returns_public_subset_for_known_slug(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_listing(db, test_org, test_user, slug="master-bedroom-pub001")

        with _patch_session(db):
            result = await listing_service.get_public_listing("master-bedroom-pub001")

        assert result.title == "Master Bedroom"
        assert result.slug == "master-bedroom-pub001"
        assert "organization_id" not in result.model_dump()

    @pytest.mark.asyncio
    async def test_archived_slug_logs_archived_match_and_raises(
        self, db: AsyncSession, test_user: User, test_org: Organization, caplog,
    ) -> None:
        await _seed_listing(
            db, test_org, test_user, slug="archived-pub002",
            deleted_at=datetime.now(timezone.utc),
        )

        with _patch_session(db), caplog.at_level(logging.WARNING, logger=_LOGGER):
            with pytest.raises(ListingNotFoundError):
                await listing_service.get_public_listing("archived-pub002")

        assert any(
            "public_listing.not_found" in rec.message
            and "archived_match=True" in rec.message
            and "archived-pub002" in rec.message
            for rec in caplog.records
        )

    @pytest.mark.asyncio
    async def test_unknown_slug_logs_no_archived_match_and_raises(
        self, db: AsyncSession, caplog,
    ) -> None:
        with _patch_session(db), caplog.at_level(logging.WARNING, logger=_LOGGER):
            with pytest.raises(ListingNotFoundError):
                await listing_service.get_public_listing("never-existed-pub003")

        assert any(
            "public_listing.not_found" in rec.message
            and "archived_match=False" in rec.message
            for rec in caplog.records
        )
