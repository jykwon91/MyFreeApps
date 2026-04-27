"""Repository tests for `listing_external_id_repo`.

Covers the CRUD surface added in PR 1.3:
- create / update / delete / get_by_id happy paths
- update allowlist (silently drops protected fields like `source` and `listing_id`)
- exists_for_source pre-check
- find_listing_id_by_source_and_external_id with cross-org isolation
  (the same `(source, external_id)` pair in another org returns None — the
  caller MUST never know that a different tenant owns it).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_external_id import ListingExternalId
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import listing_external_id_repo


def _make_listing(
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    property_id: uuid.UUID,
    title: str = "Master Bedroom",
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
        status="active",
        amenities=[],
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


async def _seed_listing(
    db: AsyncSession, org: Organization, user: User, *, title: str = "Master Bedroom",
) -> Listing:
    prop = await _seed_property(db, org, user)
    listing = _make_listing(
        organization_id=org.id, user_id=user.id, property_id=prop.id, title=title,
    )
    db.add(listing)
    await db.flush()
    return listing


class TestCreate:
    @pytest.mark.asyncio
    async def test_persists_row_with_all_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = await listing_external_id_repo.create(
            db,
            listing_id=listing.id,
            source="FF",
            external_id="FF-12345",
            external_url="https://furnishedfinder.com/property/FF-12345",
        )
        await db.commit()

        fetched = await listing_external_id_repo.get_by_id(db, row.id, listing.id)
        assert fetched is not None
        assert fetched.source == "FF"
        assert fetched.external_id == "FF-12345"
        assert fetched.external_url == "https://furnishedfinder.com/property/FF-12345"

    @pytest.mark.asyncio
    async def test_persists_row_with_external_id_only(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = await listing_external_id_repo.create(
            db,
            listing_id=listing.id,
            source="TNH",
            external_id="TN-9",
            external_url=None,
        )
        await db.commit()
        assert row.external_url is None

    @pytest.mark.asyncio
    async def test_persists_row_with_url_only(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = await listing_external_id_repo.create(
            db,
            listing_id=listing.id,
            source="Airbnb",
            external_id=None,
            external_url="https://airbnb.com/rooms/abc",
        )
        await db.commit()
        assert row.external_id is None
        assert row.external_url == "https://airbnb.com/rooms/abc"


class TestExistsForSource:
    @pytest.mark.asyncio
    async def test_returns_true_when_pair_exists(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="FF-1"))
        await db.commit()

        assert await listing_external_id_repo.exists_for_source(db, listing.id, "FF") is True

    @pytest.mark.asyncio
    async def test_returns_false_when_no_match(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()

        assert await listing_external_id_repo.exists_for_source(db, listing.id, "FF") is False

    @pytest.mark.asyncio
    async def test_distinguishes_sources(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="FF-1"))
        await db.commit()

        assert await listing_external_id_repo.exists_for_source(db, listing.id, "FF") is True
        assert await listing_external_id_repo.exists_for_source(db, listing.id, "TNH") is False


class TestFindListingIdBySourceAndExternalIdOrgScope:
    """The most security-critical test in this module.

    `find_listing_id_by_source_and_external_id` MUST scope by organization_id
    so that a `(source, external_id)` collision in a different tenant is
    invisible to the caller. Without this scoping, a 409 conflict response
    would leak the existence of cross-org records.
    """

    @pytest.mark.asyncio
    async def test_finds_match_in_same_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="FF-7"))
        await db.commit()

        match = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
            db, test_org.id, "FF", "FF-7",
        )
        assert match == listing.id

    @pytest.mark.asyncio
    async def test_returns_none_when_match_in_different_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Cross-org leakage check: same `(source, external_id)` exists in
        Org B, but the caller scoped to Org A must see None."""
        # Seed a listing+ext in Org B with the colliding pair.
        user_b = User(
            id=uuid.uuid4(),
            email="userb@example.com",
            hashed_password="hash",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        org_b = Organization(id=uuid.uuid4(), name="Org B", created_by=user_b.id)
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        listing_b = await _seed_listing(db, org_b, user_b, title="B Listing")
        db.add(ListingExternalId(
            listing_id=listing_b.id, source="FF", external_id="SHARED-ID",
        ))
        await db.commit()

        # Caller in Org A (test_org) looking up the same (FF, SHARED-ID)
        # must get None — Org B's data is invisible.
        match = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
            db, test_org.id, "FF", "SHARED-ID",
        )
        assert match is None

        # Sanity: the same lookup scoped to Org B finds the row.
        match_b = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
            db, org_b.id, "FF", "SHARED-ID",
        )
        assert match_b == listing_b.id

    @pytest.mark.asyncio
    async def test_returns_none_when_listing_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Soft-deleted listings should NOT participate in conflict detection
        — otherwise the host can't re-use an external_id from a deleted listing."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(listing)
        await db.flush()
        db.add(ListingExternalId(
            listing_id=listing.id, source="FF", external_id="OLD-FF",
        ))
        await db.commit()

        match = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
            db, test_org.id, "FF", "OLD-FF",
        )
        assert match is None

    @pytest.mark.asyncio
    async def test_returns_none_when_pair_does_not_exist(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        match = await listing_external_id_repo.find_listing_id_by_source_and_external_id(
            db, test_org.id, "FF", "missing",
        )
        assert match is None


class TestUpdate:
    @pytest.mark.asyncio
    async def test_updates_external_id_field(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="old", external_url=None,
        )
        db.add(row)
        await db.commit()

        updated = await listing_external_id_repo.update(
            db, listing.id, row.id, {"external_id": "new"},
        )
        await db.commit()
        assert updated is not None
        assert updated.external_id == "new"
        assert updated.source == "FF"  # unchanged

    @pytest.mark.asyncio
    async def test_updates_external_url_field(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="x",
            external_url="https://old.example.com/x",
        )
        db.add(row)
        await db.commit()

        updated = await listing_external_id_repo.update(
            db, listing.id, row.id,
            {"external_url": "https://new.example.com/x"},
        )
        await db.commit()
        assert updated is not None
        assert updated.external_url == "https://new.example.com/x"

    @pytest.mark.asyncio
    async def test_drops_non_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """`source`, `listing_id`, `id`, `created_at` are NOT in the allowlist
        — attempts to overwrite them must be silently dropped per the
        layered-architecture allowlist rule."""
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="orig",
        )
        db.add(row)
        await db.commit()
        original_source = row.source
        original_id = row.id
        original_listing_id = row.listing_id

        updated = await listing_external_id_repo.update(
            db, listing.id, row.id,
            {
                "source": "TNH",                         # blocked
                "listing_id": uuid.uuid4(),              # blocked
                "id": uuid.uuid4(),                      # blocked
                "created_at": datetime.now(timezone.utc),  # blocked
                "external_id": "legit-update",           # allowed
            },
        )
        await db.commit()
        assert updated is not None
        assert updated.source == original_source
        assert updated.id == original_id
        assert updated.listing_id == original_listing_id
        assert updated.external_id == "legit-update"

    @pytest.mark.asyncio
    async def test_returns_none_when_row_belongs_to_different_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="x",
        )
        db.add(row)
        await db.commit()

        result = await listing_external_id_repo.update(
            db, uuid.uuid4(), row.id, {"external_id": "y"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_row(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()
        result = await listing_external_id_repo.update(
            db, listing.id, uuid.uuid4(), {"external_id": "x"},
        )
        assert result is None


class TestDelete:
    @pytest.mark.asyncio
    async def test_returns_true_and_removes_row(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="x",
        )
        db.add(row)
        await db.commit()

        ok = await listing_external_id_repo.delete_by_id(db, listing.id, row.id)
        await db.commit()
        assert ok is True
        assert await listing_external_id_repo.get_by_id(db, row.id, listing.id) is None

    @pytest.mark.asyncio
    async def test_returns_false_when_row_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        await db.commit()
        ok = await listing_external_id_repo.delete_by_id(db, listing.id, uuid.uuid4())
        assert ok is False

    @pytest.mark.asyncio
    async def test_returns_false_when_row_belongs_to_different_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)
        row = ListingExternalId(
            listing_id=listing.id, source="FF", external_id="x",
        )
        db.add(row)
        await db.commit()

        # Wrong listing scope — must not delete.
        ok = await listing_external_id_repo.delete_by_id(db, uuid.uuid4(), row.id)
        assert ok is False
        # Confirm row still exists.
        assert await listing_external_id_repo.get_by_id(db, row.id, listing.id) is not None
