"""Service-layer tests for `services/listings/listing_external_id_service.py`.

Patches `unit_of_work` to point at the in-memory SQLite session — same
pattern as `test_listing_photo_service.py`. Verifies the orchestration:
- listing scope check (raises ListingNotFoundError on cross-org)
- (listing_id, source) pre-check (raises SourceAlreadyLinkedError)
- (source, external_id) cross-listing in-org pre-check
  (raises ExternalIdAlreadyClaimedError)
- cross-tenant collisions DO NOT raise — they're invisible to the caller
"""
from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_external_id import ListingExternalId
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.user.user import User
from app.schemas.listings.listing_external_id_create_request import (
    ListingExternalIdCreateRequest,
)
from app.schemas.listings.listing_external_id_update_request import (
    ListingExternalIdUpdateRequest,
)
from app.services.listings import listing_external_id_service


def _make_listing(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    title: str = "Master Bedroom",
) -> Listing:
    return Listing(
        id=uuid.uuid4(),
        organization_id=organization_id, user_id=user_id, property_id=property_id,
        title=title,
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False, parking_assigned=False, furnished=True,
        status="active", amenities=[], pets_on_premises=False,
    )


async def _seed_listing(
    db: AsyncSession, org: Organization, user: User, *, title: str = "Master Bedroom",
) -> Listing:
    prop = Property(
        organization_id=org.id, user_id=user.id, name="House", address="x",
    )
    db.add(prop)
    await db.flush()
    listing = _make_listing(
        organization_id=org.id, user_id=user.id, property_id=prop.id, title=title,
    )
    db.add(listing)
    await db.flush()
    return listing


def _patch_uow(db: AsyncSession):
    @asynccontextmanager
    async def _fake():
        yield db

    return patch(
        "app.services.listings.listing_external_id_service.unit_of_work",
        lambda: _fake(),
    )


class TestCreateExternalId:
    @pytest.mark.asyncio
    async def test_creates_with_id_and_url(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()

        payload = ListingExternalIdCreateRequest(
            source="FF",
            external_id="FF-12345",
            external_url="https://furnishedfinder.com/property/FF-12345",
        )
        with _patch_uow(db):
            result = await listing_external_id_service.create_external_id(
                test_org.id, test_user.id, listing.id, payload,
            )
        await db.commit()

        assert result.source == "FF"
        assert result.external_id == "FF-12345"
        assert result.external_url == "https://furnishedfinder.com/property/FF-12345"

    @pytest.mark.asyncio
    async def test_raises_listing_not_found_when_listing_in_different_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()

        other_org_id = uuid.uuid4()
        payload = ListingExternalIdCreateRequest(source="FF", external_id="x")
        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.ListingNotFoundError):
                await listing_external_id_service.create_external_id(
                    other_org_id, test_user.id, listing.id, payload,
                )

    @pytest.mark.asyncio
    async def test_raises_source_already_linked_on_duplicate(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        db.add(ListingExternalId(
            listing_id=listing.id, source="FF", external_id="FF-A",
        ))
        await db.commit()

        payload = ListingExternalIdCreateRequest(
            source="FF", external_id="FF-B",  # different external_id, same source
        )
        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.SourceAlreadyLinkedError):
                await listing_external_id_service.create_external_id(
                    test_org.id, test_user.id, listing.id, payload,
                )

    @pytest.mark.asyncio
    async def test_raises_external_id_claimed_when_other_listing_in_same_org_has_pair(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing_a = await _seed_listing(db, test_org, test_user, title="A")
        listing_b = await _seed_listing(db, test_org, test_user, title="B")
        db.add(ListingExternalId(
            listing_id=listing_a.id, source="FF", external_id="FF-7",
        ))
        await db.commit()

        payload = ListingExternalIdCreateRequest(source="FF", external_id="FF-7")
        with _patch_uow(db):
            with pytest.raises(
                listing_external_id_service.ExternalIdAlreadyClaimedError,
            ):
                await listing_external_id_service.create_external_id(
                    test_org.id, test_user.id, listing_b.id, payload,
                )

    @pytest.mark.asyncio
    async def test_cross_tenant_db_integrity_error_maps_to_generic_409(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Anti-leak guard: a cross-tenant `(source, external_id)` collision
        passes our org-scoped pre-flight check but trips the global DB
        partial UNIQUE. The service MUST catch IntegrityError and surface
        the same generic 409 as same-org collisions — never a 500, which
        would leak existence via status-code differential.
        """
        # Org B with the same FF id Org A is about to try to claim.
        user_b = User(
            id=uuid.uuid4(), email="leak-test@example.com", hashed_password="h",
            is_active=True, is_superuser=False, is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        listing_b = await _seed_listing(db, org_b, user_b, title="B")
        db.add(ListingExternalId(
            listing_id=listing_b.id, source="FF", external_id="LEAKY-FF",
        ))
        listing_a = await _seed_listing(db, test_org, test_user, title="A")
        await db.commit()

        # Org A tries to claim the same FF id. Pre-flight returns None
        # (org-scoped), then DB rejects via global partial UNIQUE.
        payload = ListingExternalIdCreateRequest(source="FF", external_id="LEAKY-FF")
        with _patch_uow(db):
            with pytest.raises(
                listing_external_id_service.ExternalIdAlreadyClaimedError,
            ):
                await listing_external_id_service.create_external_id(
                    test_org.id, test_user.id, listing_a.id, payload,
                )

    @pytest.mark.asyncio
    async def test_does_not_raise_when_collision_is_in_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Cross-tenant `(source, external_id)` collision must NOT raise.

        The DB-level partial UNIQUE is global (a single failure surface),
        but the service-layer pre-check filters by organization_id so
        cross-tenant collisions are invisible to the caller. The DB
        partial UNIQUE remains the authoritative backstop — tested
        separately in `test_listing_repo.py::TestListingExternalIdUniquenessMatrix`.

        For this test we use distinct external_id values across orgs to
        exercise the service's same-org-only filter without triggering
        the global DB UNIQUE. The cross-tenant scenario where they share
        the same external_id is exercised against the repo directly.
        """
        # Org B with its own user + listing + ext.
        user_b = User(
            id=uuid.uuid4(), email="userb@example.com", hashed_password="h",
            is_active=True, is_superuser=False, is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        listing_b = await _seed_listing(db, org_b, user_b, title="B")
        db.add(ListingExternalId(
            listing_id=listing_b.id, source="FF", external_id="ORG-B-FF",
        ))

        # Org A creates its own row for the same source — no collision in
        # Org A's namespace, so the service must allow it.
        listing_a = await _seed_listing(db, test_org, test_user, title="A")
        await db.commit()

        payload = ListingExternalIdCreateRequest(
            source="FF", external_id="ORG-A-FF",
        )
        with _patch_uow(db):
            result = await listing_external_id_service.create_external_id(
                test_org.id, test_user.id, listing_a.id, payload,
            )
        await db.commit()
        assert result.external_id == "ORG-A-FF"

    @pytest.mark.asyncio
    async def test_skips_external_id_check_when_external_id_is_null(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()

        payload = ListingExternalIdCreateRequest(
            source="Airbnb",
            external_url="https://airbnb.com/rooms/abc",
        )
        with _patch_uow(db):
            result = await listing_external_id_service.create_external_id(
                test_org.id, test_user.id, listing.id, payload,
            )
        await db.commit()
        assert result.external_id is None
        assert result.external_url == "https://airbnb.com/rooms/abc"


class TestUpdateExternalId:
    @pytest.mark.asyncio
    async def test_updates_url(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="FF-1",
            external_url="https://old.example.com/x",
        )
        db.add(row)
        await db.commit()

        payload = ListingExternalIdUpdateRequest(
            external_url="https://new.example.com/x",
        )
        with _patch_uow(db):
            result = await listing_external_id_service.update_external_id(
                test_org.id, test_user.id, listing.id, row.id, payload,
            )
        await db.commit()
        assert result.external_url == "https://new.example.com/x"

    @pytest.mark.asyncio
    async def test_raises_when_listing_in_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(listing_id=listing.id, source="FF", external_id="x")
        db.add(row)
        await db.commit()

        payload = ListingExternalIdUpdateRequest(external_id="y")
        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.ListingNotFoundError):
                await listing_external_id_service.update_external_id(
                    uuid.uuid4(), test_user.id, listing.id, row.id, payload,
                )

    @pytest.mark.asyncio
    async def test_raises_when_external_id_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()
        payload = ListingExternalIdUpdateRequest(external_id="x")
        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.ExternalIdNotFoundError):
                await listing_external_id_service.update_external_id(
                    test_org.id, test_user.id, listing.id, uuid.uuid4(), payload,
                )

    @pytest.mark.asyncio
    async def test_raises_when_changing_external_id_collides_in_same_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing_a = await _seed_listing(db, test_org, test_user, title="A")
        listing_b = await _seed_listing(db, test_org, test_user, title="B")
        # listing_a uses FF-7, listing_b uses FF-8. Try to update B → FF-7.
        db.add_all([
            ListingExternalId(listing_id=listing_a.id, source="FF", external_id="FF-7"),
        ])
        row_b = ListingExternalId(
            listing_id=listing_b.id, source="FF", external_id="FF-8",
        )
        db.add(row_b)
        await db.commit()

        payload = ListingExternalIdUpdateRequest(external_id="FF-7")
        with _patch_uow(db):
            with pytest.raises(
                listing_external_id_service.ExternalIdAlreadyClaimedError,
            ):
                await listing_external_id_service.update_external_id(
                    test_org.id, test_user.id, listing_b.id, row_b.id, payload,
                )

    @pytest.mark.asyncio
    async def test_no_self_collision_when_external_id_unchanged(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Setting external_id to the same value it already has must not
        409 against itself."""
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="FF-7",
        )
        db.add(row)
        await db.commit()

        # Patch only the URL; external_id is not in the payload.
        payload = ListingExternalIdUpdateRequest(
            external_url="https://example.com/ff/FF-7",
        )
        with _patch_uow(db):
            result = await listing_external_id_service.update_external_id(
                test_org.id, test_user.id, listing.id, row.id, payload,
            )
        await db.commit()
        assert result.external_id == "FF-7"
        assert result.external_url == "https://example.com/ff/FF-7"


class TestDeleteExternalId:
    @pytest.mark.asyncio
    async def test_deletes_row(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(listing_id=listing.id, source="FF", external_id="x")
        db.add(row)
        await db.commit()

        with _patch_uow(db):
            await listing_external_id_service.delete_external_id(
                test_org.id, test_user.id, listing.id, row.id,
            )
        await db.commit()

        from app.repositories import listing_external_id_repo

        rows = await listing_external_id_repo.list_by_listing(db, listing.id)
        assert rows == []

    @pytest.mark.asyncio
    async def test_raises_when_listing_in_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(listing_id=listing.id, source="FF", external_id="x")
        db.add(row)
        await db.commit()

        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.ListingNotFoundError):
                await listing_external_id_service.delete_external_id(
                    uuid.uuid4(), test_user.id, listing.id, row.id,
                )

    @pytest.mark.asyncio
    async def test_raises_when_row_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()
        with _patch_uow(db):
            with pytest.raises(listing_external_id_service.ExternalIdNotFoundError):
                await listing_external_id_service.delete_external_id(
                    test_org.id, test_user.id, listing.id, uuid.uuid4(),
                )
