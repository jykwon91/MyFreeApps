"""Service-layer tests for the listings domain.

Patches `AsyncSessionLocal` to point at the in-memory SQLite session — same
pattern used in test_property_duplicate.py. Verifies that:
- get_listing returns the full response with photos + external_ids loaded
- get_listing on a cross-org listing raises LookupError (mapped to 404 by API)
- list_listings paginates correctly
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_external_id import ListingExternalId
from app.models.listings.listing_photo import ListingPhoto
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.services.listings import listing_service


def _make_listing(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    title: str = "Master Bedroom",
    status: str = "active",
    deleted_at: datetime | None = None,
) -> Listing:
    return Listing(
        id=uuid.uuid4(),
        organization_id=organization_id,
        user_id=user_id,
        property_id=property_id,
        title=title,
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False,
        parking_assigned=False,
        furnished=True,
        status=status,
        amenities=["wifi", "parking"],
        pets_on_premises=False,
        deleted_at=deleted_at,
    )


async def _seed_property(db: AsyncSession, org: Organization, user: User) -> Property:
    prop = Property(
        organization_id=org.id, user_id=user.id,
        name="Travel-Nurse House", address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    return prop


def _patch_session(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch("app.services.listings.listing_service.AsyncSessionLocal", _fake)


class TestGetListing:
    @pytest.mark.asyncio
    async def test_returns_full_response_with_relations(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add(ListingPhoto(listing_id=listing.id, storage_key="cover.jpg", display_order=0))
        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="FF-1"))
        await db.commit()

        with _patch_session(db):
            response = await listing_service.get_listing(test_org.id, test_user.id, listing.id)

        assert response.id == listing.id
        assert response.title == "Master Bedroom"
        assert response.amenities == ["wifi", "parking"]
        assert len(response.photos) == 1
        assert response.photos[0].storage_key == "cover.jpg"
        assert len(response.external_ids) == 1
        assert response.external_ids[0].source == "FF"

    @pytest.mark.asyncio
    async def test_raises_lookup_error_on_cross_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        other_org_id = uuid.uuid4()
        with _patch_session(db):
            with pytest.raises(LookupError):
                await listing_service.get_listing(other_org_id, test_user.id, listing.id)

    @pytest.mark.asyncio
    async def test_raises_lookup_error_on_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(listing)
        await db.commit()

        with _patch_session(db):
            with pytest.raises(LookupError):
                await listing_service.get_listing(test_org.id, test_user.id, listing.id)


class TestListListings:
    @pytest.mark.asyncio
    async def test_paginates_with_envelope(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        for i in range(5):
            db.add(_make_listing(
                organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
                title=f"L{i}",
            ))
        await db.commit()

        with _patch_session(db):
            page1 = await listing_service.list_listings(
                test_org.id, test_user.id, limit=2, offset=0,
            )
            page2 = await listing_service.list_listings(
                test_org.id, test_user.id, limit=2, offset=2,
            )
            page3 = await listing_service.list_listings(
                test_org.id, test_user.id, limit=2, offset=4,
            )

        assert page1.total == 5
        assert len(page1.items) == 2
        assert page1.has_more is True

        assert page2.total == 5
        assert len(page2.items) == 2
        assert page2.has_more is True

        # Last page — only one row remains, has_more must be False so the
        # frontend hides "Load more". Closes the PR 1.1b pagination terminator.
        assert page3.total == 5
        assert len(page3.items) == 1
        assert page3.has_more is False

        # Different rows on each page.
        assert {p.id for p in page1.items}.isdisjoint({p.id for p in page2.items})

    @pytest.mark.asyncio
    async def test_has_more_false_when_offset_plus_items_equals_total(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Edge case from TECH_DEBT.md: when total rows is an exact multiple
        of page size, the last page must still report has_more=False."""
        prop = await _seed_property(db, test_org, test_user)
        for i in range(4):  # exact multiple of limit=2
            db.add(_make_listing(
                organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
                title=f"L{i}",
            ))
        await db.commit()

        with _patch_session(db):
            page2 = await listing_service.list_listings(
                test_org.id, test_user.id, limit=2, offset=2,
            )

        assert page2.total == 4
        assert len(page2.items) == 2
        assert page2.has_more is False


class TestCreateListing:
    @pytest.mark.asyncio
    async def test_creates_with_minimal_payload(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        from app.schemas.listings.listing_create_request import ListingCreateRequest

        prop = await _seed_property(db, test_org, test_user)
        await db.commit()

        payload = ListingCreateRequest(
            property_id=prop.id,
            title="My listing",
            monthly_rate=Decimal("1799.00"),
            room_type="private_room",
        )

        @asynccontextmanager
        async def _fake_uow():
            yield db

        with _patch_session(db), patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            response = await listing_service.create_listing(test_org.id, test_user.id, payload)

        assert response.title == "My listing"
        assert response.monthly_rate == Decimal("1799.00")
        assert response.organization_id == test_org.id

    @pytest.mark.asyncio
    async def test_rejects_property_in_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        from app.schemas.listings.listing_create_request import ListingCreateRequest

        # Property exists but belongs to OTHER org. The service must NOT
        # let the caller create a listing pointing at it.
        from app.models.organization.organization import Organization
        from app.models.user.user import User
        other_user = User(
            id=uuid.uuid4(), email="x@example.com", hashed_password="h",
            is_active=True, is_superuser=False, is_verified=True,
        )
        other_org = Organization(id=uuid.uuid4(), name="Other Org", created_by=other_user.id)
        db.add_all([other_user, other_org])
        await db.flush()
        other_prop = Property(
            organization_id=other_org.id, user_id=other_user.id,
            name="Their House", address="x",
        )
        db.add(other_prop)
        await db.commit()

        payload = ListingCreateRequest(
            property_id=other_prop.id,
            title="Should not work",
            monthly_rate=Decimal("1799.00"),
            room_type="private_room",
        )

        @asynccontextmanager
        async def _fake_uow():
            yield db

        with _patch_session(db), patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            with pytest.raises(LookupError):
                await listing_service.create_listing(test_org.id, test_user.id, payload)


class TestUpdateListing:
    @pytest.mark.asyncio
    async def test_updates_title_and_status(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        from app.schemas.listings.listing_update_request import ListingUpdateRequest

        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        payload = ListingUpdateRequest(title="New", status="paused")

        @asynccontextmanager
        async def _fake_uow():
            yield db

        with _patch_session(db), patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            response = await listing_service.update_listing(
                test_org.id, test_user.id, listing.id, payload,
            )

        assert response.title == "New"
        assert response.status == "paused"

    @pytest.mark.asyncio
    async def test_raises_lookup_error_when_listing_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        from app.schemas.listings.listing_update_request import ListingUpdateRequest

        @asynccontextmanager
        async def _fake_uow():
            yield db

        with _patch_session(db), patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            with pytest.raises(LookupError):
                await listing_service.update_listing(
                    test_org.id, test_user.id, uuid.uuid4(),
                    ListingUpdateRequest(title="x"),
                )


class TestSoftDeleteListing:
    @pytest.mark.asyncio
    async def test_soft_deletes_existing_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        from app.repositories import listing_repo

        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        @asynccontextmanager
        async def _fake_uow():
            yield db

        with patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            await listing_service.soft_delete_listing(test_org.id, test_user.id, listing.id)
        await db.commit()

        # The listing is filtered out of subsequent reads.
        assert await listing_repo.get_by_id(db, listing.id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_raises_lookup_error_for_missing_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        @asynccontextmanager
        async def _fake_uow():
            yield db

        with patch(
            "app.services.listings.listing_service.unit_of_work", _fake_uow,
        ):
            with pytest.raises(LookupError):
                await listing_service.soft_delete_listing(
                    test_org.id, test_user.id, uuid.uuid4(),
                )
