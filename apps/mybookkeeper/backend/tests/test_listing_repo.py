"""Repository tests for the listings domain.

Covers:
- happy-path get + list
- soft-delete: deleted listings are not returned
- cross-org isolation: another org cannot read your listings
- pagination via limit + offset
- status filter
- the full uniqueness matrix on listing_external_ids (per project rule:
  enumerate every composite-key combination before implementation)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing import Listing
from app.models.listings.listing_external_id import ListingExternalId
from app.models.listings.listing_photo import ListingPhoto
from app.models.organization.organization import Organization
from app.models.organization.organization_member import OrganizationMember
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import (
    listing_external_id_repo,
    listing_photo_repo,
    listing_repo,
)


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
        amenities=[],
        pets_on_premises=False,
        deleted_at=deleted_at,
    )


async def _seed_property(db: AsyncSession, org: Organization, user: User) -> Property:
    prop = Property(
        organization_id=org.id,
        user_id=user.id,
        name="Travel-Nurse House",
        address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    return prop


class TestListingRepoGetById:
    @pytest.mark.asyncio
    async def test_returns_listing_when_exists(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.get_by_id(db, listing.id, test_org.id)
        assert result is not None
        assert result.id == listing.id
        assert result.title == "Master Bedroom"

    @pytest.mark.asyncio
    async def test_returns_none_when_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.get_by_id(db, listing.id, test_org.id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        other_org_id = uuid.uuid4()
        result = await listing_repo.get_by_id(db, listing.id, other_org_id)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        result = await listing_repo.get_by_id(db, uuid.uuid4(), test_org.id)
        assert result is None


class TestListingRepoListByOrganization:
    @pytest.mark.asyncio
    async def test_returns_only_non_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        active = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Active",
        )
        deleted = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Deleted",
            deleted_at=datetime.now(timezone.utc),
        )
        db.add_all([active, deleted])
        await db.commit()

        result = await listing_repo.list_by_organization(db, test_org.id)
        titles = [r.title for r in result]
        assert "Active" in titles
        assert "Deleted" not in titles

    @pytest.mark.asyncio
    async def test_filters_by_status(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        active1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="A1", status="active",
        )
        active2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="A2", status="active",
        )
        archived1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="X1", status="archived",
        )
        archived2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="X2", status="archived",
        )
        db.add_all([active1, active2, archived1, archived2])
        await db.commit()

        actives = await listing_repo.list_by_organization(db, test_org.id, status="active")
        archived = await listing_repo.list_by_organization(db, test_org.id, status="archived")
        assert len(actives) == 2
        assert len(archived) == 2
        assert {r.status for r in actives} == {"active"}
        assert {r.status for r in archived} == {"archived"}

    @pytest.mark.asyncio
    async def test_paginates_with_limit_and_offset(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        for i in range(3):
            listing = _make_listing(
                organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
                title=f"L{i}",
            )
            db.add(listing)
        await db.commit()

        # 3 rows total, limit=2 offset=1 → rows 2 and 3 (i.e. 2 rows back).
        page = await listing_repo.list_by_organization(db, test_org.id, limit=2, offset=1)
        assert len(page) == 2

        # 3 rows total, limit=2 offset=2 → only the last row.
        last = await listing_repo.list_by_organization(db, test_org.id, limit=2, offset=2)
        assert len(last) == 1

    @pytest.mark.asyncio
    async def test_isolates_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.list_by_organization(db, uuid.uuid4())
        assert result == []


class TestListingRepoCreateAndDelete:
    @pytest.mark.asyncio
    async def test_create_listing_persists(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        created = await listing_repo.create_listing(
            db,
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            title="Studio",
            monthly_rate=Decimal("999.00"),
            room_type="whole_unit",
            status="draft",
        )
        await db.commit()

        fetched = await listing_repo.get_by_id(db, created.id, test_org.id)
        assert fetched is not None
        assert fetched.title == "Studio"
        assert fetched.room_type == "whole_unit"
        assert fetched.amenities == []

    @pytest.mark.asyncio
    async def test_hard_delete_removes_row(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        await listing_repo.hard_delete_by_id(db, listing.id, test_org.id)
        await db.commit()

        fetched = await listing_repo.get_by_id(db, listing.id, test_org.id)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_hard_delete_scoped_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        # Different org should not be able to delete this row.
        await listing_repo.hard_delete_by_id(db, listing.id, uuid.uuid4())
        await db.commit()

        fetched = await listing_repo.get_by_id(db, listing.id, test_org.id)
        assert fetched is not None


class TestListingPhotoRepo:
    @pytest.mark.asyncio
    async def test_orders_by_display_order(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()

        p2 = ListingPhoto(listing_id=listing.id, storage_key="b.jpg", display_order=2)
        p1 = ListingPhoto(listing_id=listing.id, storage_key="a.jpg", display_order=1)
        p0 = ListingPhoto(listing_id=listing.id, storage_key="cover.jpg", display_order=0)
        db.add_all([p2, p1, p0])
        await db.commit()

        photos = await listing_photo_repo.list_by_listing(db, listing.id)
        assert [p.storage_key for p in photos] == ["cover.jpg", "a.jpg", "b.jpg"]

    @pytest.mark.asyncio
    async def test_next_display_order_returns_zero_when_empty(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()
        assert await listing_photo_repo.next_display_order(db, listing.id) == 0

    @pytest.mark.asyncio
    async def test_next_display_order_returns_max_plus_one(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        db.add_all([
            ListingPhoto(listing_id=listing.id, storage_key="a.jpg", display_order=0),
            ListingPhoto(listing_id=listing.id, storage_key="b.jpg", display_order=2),
            ListingPhoto(listing_id=listing.id, storage_key="c.jpg", display_order=5),
        ])
        await db.commit()
        assert await listing_photo_repo.next_display_order(db, listing.id) == 6

    @pytest.mark.asyncio
    async def test_create_persists_photo(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()

        photo = await listing_photo_repo.create(
            db,
            listing_id=listing.id,
            storage_key="org/abc/key.jpg",
            caption="Master bedroom",
            display_order=0,
        )
        await db.commit()

        fetched = await listing_photo_repo.get_by_id(db, photo.id, listing.id)
        assert fetched is not None
        assert fetched.storage_key == "org/abc/key.jpg"
        assert fetched.caption == "Master bedroom"
        assert fetched.display_order == 0

    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        photo = ListingPhoto(
            listing_id=listing.id, storage_key="a.jpg", caption="old", display_order=0,
        )
        db.add(photo)
        await db.commit()

        updated = await listing_photo_repo.update(
            db, photo.id, listing.id,
            {"caption": "new caption", "display_order": 3},
        )
        await db.commit()
        assert updated is not None
        assert updated.caption == "new caption"
        assert updated.display_order == 3

    @pytest.mark.asyncio
    async def test_update_drops_non_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """`storage_key` and `listing_id` are not in the photo allowlist —
        attempts to overwrite them via update should be silently dropped."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        photo = ListingPhoto(
            listing_id=listing.id, storage_key="original.jpg", display_order=0,
        )
        db.add(photo)
        await db.commit()
        original_storage_key = photo.storage_key

        updated = await listing_photo_repo.update(
            db, photo.id, listing.id,
            {"storage_key": "MALICIOUS.jpg", "caption": "ok"},
        )
        await db.commit()
        assert updated is not None
        assert updated.storage_key == original_storage_key
        assert updated.caption == "ok"

    @pytest.mark.asyncio
    async def test_update_returns_none_for_wrong_listing(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        photo = ListingPhoto(listing_id=listing.id, storage_key="a.jpg", display_order=0)
        db.add(photo)
        await db.commit()

        result = await listing_photo_repo.update(
            db, photo.id, uuid.uuid4(), {"caption": "x"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_returns_row_for_storage_cleanup(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()
        photo = ListingPhoto(
            listing_id=listing.id, storage_key="bucket/key.jpg", display_order=0,
        )
        db.add(photo)
        await db.commit()

        deleted = await listing_photo_repo.delete_by_id(db, photo.id, listing.id)
        await db.commit()
        assert deleted is not None
        assert deleted.storage_key == "bucket/key.jpg"
        assert await listing_photo_repo.get_by_id(db, photo.id, listing.id) is None

    @pytest.mark.asyncio
    async def test_delete_returns_none_when_not_found(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        result = await listing_photo_repo.delete_by_id(db, uuid.uuid4(), listing.id)
        assert result is None


class TestListingRepoUpdate:
    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        updated = await listing_repo.update_listing(
            db, listing.id, test_org.id,
            {"title": "Updated title", "monthly_rate": Decimal("1899.00"),
             "amenities": ["wifi", "parking"]},
        )
        await db.commit()
        assert updated is not None
        assert updated.title == "Updated title"
        assert updated.monthly_rate == Decimal("1899.00")
        assert updated.amenities == ["wifi", "parking"]

    @pytest.mark.asyncio
    async def test_update_drops_protected_fields(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """organization_id, user_id, id, deleted_at are NOT in the allowlist.
        A malicious payload trying to escalate org membership must be ignored."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()
        original_org = listing.organization_id

        attacker_org = uuid.uuid4()
        updated = await listing_repo.update_listing(
            db, listing.id, test_org.id,
            {
                "organization_id": attacker_org,
                "user_id": uuid.uuid4(),
                "id": uuid.uuid4(),
                "deleted_at": datetime.now(timezone.utc),
                "title": "Legit update",
            },
        )
        await db.commit()
        assert updated is not None
        assert updated.organization_id == original_org
        assert updated.deleted_at is None
        assert updated.title == "Legit update"

    @pytest.mark.asyncio
    async def test_update_returns_none_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.update_listing(
            db, listing.id, uuid.uuid4(), {"title": "x"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_update_returns_none_for_soft_deleted_row(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.update_listing(
            db, listing.id, test_org.id, {"title": "x"},
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_update_with_no_allowlisted_fields_returns_listing_unchanged(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        result = await listing_repo.update_listing(
            db, listing.id, test_org.id,
            {"organization_id": uuid.uuid4()},  # only protected field
        )
        await db.commit()
        assert result is not None
        assert result.title == listing.title


class TestListingRepoSoftDelete:
    @pytest.mark.asyncio
    async def test_soft_delete_sets_deleted_at(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        ok = await listing_repo.soft_delete_by_id(db, listing.id, test_org.id)
        await db.commit()
        assert ok is True

        # get_by_id filters out soft-deleted rows
        assert await listing_repo.get_by_id(db, listing.id, test_org.id) is None

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_already_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        db.add(listing)
        await db.commit()

        ok = await listing_repo.soft_delete_by_id(db, listing.id, test_org.id)
        assert ok is False

    @pytest.mark.asyncio
    async def test_soft_delete_returns_false_for_other_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.commit()

        ok = await listing_repo.soft_delete_by_id(db, listing.id, uuid.uuid4())
        assert ok is False
        # And the row in the original org is still readable.
        assert await listing_repo.get_by_id(db, listing.id, test_org.id) is not None


class TestListingRepoGetBySlug:
    """Cover the public-form lookup path. The slug itself is the capability —
    no organization scope on this lookup."""

    @pytest.mark.asyncio
    async def test_returns_listing_for_active_slug(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        listing.slug = "master-bedroom-abc123"
        db.add(listing)
        await db.commit()

        result = await listing_repo.get_by_slug(db, "master-bedroom-abc123")
        assert result is not None
        assert result.id == listing.id

    @pytest.mark.asyncio
    async def test_returns_none_for_unknown_slug(
        self, db: AsyncSession,
    ) -> None:
        result = await listing_repo.get_by_slug(db, "never-existed-zzz999")
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_for_soft_deleted_slug(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        listing.slug = "archived-listing-xyz789"
        db.add(listing)
        await db.commit()

        result = await listing_repo.get_by_slug(db, "archived-listing-xyz789")
        assert result is None


class TestListingRepoSlugExistsIncludingArchived:
    """The operator-diagnostic helper that lets the public route distinguish
    'slug never existed' from 'slug archived' for log triage."""

    @pytest.mark.asyncio
    async def test_active_slug_returns_true(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        listing.slug = "active-listing-aaa111"
        db.add(listing)
        await db.commit()

        assert await listing_repo.slug_exists_including_archived(
            db, "active-listing-aaa111",
        ) is True

    @pytest.mark.asyncio
    async def test_archived_slug_returns_true(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id,
            user_id=test_user.id,
            property_id=prop.id,
            deleted_at=datetime.now(timezone.utc),
        )
        listing.slug = "archived-listing-bbb222"
        db.add(listing)
        await db.commit()

        assert await listing_repo.slug_exists_including_archived(
            db, "archived-listing-bbb222",
        ) is True

    @pytest.mark.asyncio
    async def test_unknown_slug_returns_false(
        self, db: AsyncSession,
    ) -> None:
        assert await listing_repo.slug_exists_including_archived(
            db, "never-existed-ccc333",
        ) is False


class TestListingRepoCount:
    @pytest.mark.asyncio
    async def test_count_excludes_soft_deleted(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        live = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Live",
        )
        gone = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
            title="Gone",
            deleted_at=datetime.now(timezone.utc),
        )
        db.add_all([live, gone])
        await db.commit()

        assert await listing_repo.count_by_organization(db, test_org.id) == 1

    @pytest.mark.asyncio
    async def test_count_respects_status_filter(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        for status_value in ("active", "active", "draft"):
            db.add(_make_listing(
                organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
                title=f"L-{status_value}", status=status_value,
            ))
        await db.commit()

        assert await listing_repo.count_by_organization(db, test_org.id, status="active") == 2
        assert await listing_repo.count_by_organization(db, test_org.id, status="draft") == 1

    @pytest.mark.asyncio
    async def test_count_isolates_by_org(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        db.add(_make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        ))
        await db.commit()
        assert await listing_repo.count_by_organization(db, uuid.uuid4()) == 0


class TestListingExternalIdUniquenessMatrix:
    """Enumerate every composite-key combination for listing_external_ids dedup.

    Per CLAUDE.md: 'For any uniqueness constraint, deduplication logic, or
    entity-matching rule: enumerate and test all composite key combinations
    before implementation.'
    """

    @pytest.mark.asyncio
    async def test_same_listing_same_source_rejected(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Same listing + same source: blocked by UNIQUE(listing_id, source)."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()

        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="I-1"))
        await db.commit()

        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="I-2"))
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()

    @pytest.mark.asyncio
    async def test_same_listing_different_sources_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """Same listing on FF and TNH: allowed, common case."""
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()

        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="I-1"))
        db.add(ListingExternalId(listing_id=listing.id, source="TNH", external_id="T-1"))
        await db.commit()

        rows = await listing_external_id_repo.list_by_listing(db, listing.id)
        assert {r.source for r in rows} == {"FF", "TNH"}

    @pytest.mark.asyncio
    async def test_same_external_id_across_different_sources_allowed(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        """external_id 'X-99' on FF and on TNH on different listings: allowed
        — the partial unique is scoped by source."""
        prop = await _seed_property(db, test_org, test_user)
        l1 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id, title="L1",
        )
        l2 = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id, title="L2",
        )
        db.add_all([l1, l2])
        await db.flush()

        db.add(ListingExternalId(listing_id=l1.id, source="FF", external_id="X-99"))
        db.add(ListingExternalId(listing_id=l2.id, source="TNH", external_id="X-99"))
        await db.commit()

    @pytest.mark.asyncio
    async def test_get_by_source_and_external_id_finds_match(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        prop = await _seed_property(db, test_org, test_user)
        listing = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop.id,
        )
        db.add(listing)
        await db.flush()

        db.add(ListingExternalId(listing_id=listing.id, source="FF", external_id="FF-7"))
        await db.commit()

        match = await listing_external_id_repo.get_by_source_and_external_id(db, "FF", "FF-7")
        assert match is not None
        assert match.listing_id == listing.id

        miss = await listing_external_id_repo.get_by_source_and_external_id(db, "FF", "missing")
        assert miss is None


class TestListingTenantIsolation:
    """The most important test in the file (per RENTALS_PLAN.md §13).

    Two organizations, two users, two listings — each user sees only their own.
    """

    @pytest.mark.asyncio
    async def test_two_orgs_see_only_their_listings(
        self, db: AsyncSession, test_user: User, test_org: Organization
    ) -> None:
        # Org A is test_org / test_user — already created by fixtures.
        prop_a = await _seed_property(db, test_org, test_user)
        listing_a = _make_listing(
            organization_id=test_org.id, user_id=test_user.id, property_id=prop_a.id,
            title="Org A Listing",
        )
        db.add(listing_a)

        # Org B with its own user.
        user_b = User(
            id=uuid.uuid4(),
            email="userb@example.com",
            hashed_password="hash",
            is_active=True,
            is_superuser=False,
            is_verified=True,
        )
        org_b = Organization(
            id=uuid.uuid4(),
            name="Org B",
            created_by=user_b.id,
        )
        db.add_all([user_b, org_b])
        await db.flush()
        db.add(OrganizationMember(
            organization_id=org_b.id, user_id=user_b.id, org_role="owner",
        ))
        prop_b = Property(
            organization_id=org_b.id, user_id=user_b.id,
            name="B House", address="200 Other St",
        )
        db.add(prop_b)
        await db.flush()
        listing_b = _make_listing(
            organization_id=org_b.id, user_id=user_b.id, property_id=prop_b.id,
            title="Org B Listing",
        )
        db.add(listing_b)
        await db.commit()

        # Org A side
        a_results = await listing_repo.list_by_organization(db, test_org.id)
        assert {r.title for r in a_results} == {"Org A Listing"}
        # Lookup of Org B's listing scoped to Org A returns None.
        assert await listing_repo.get_by_id(db, listing_b.id, test_org.id) is None

        # Org B side
        b_results = await listing_repo.list_by_organization(db, org_b.id)
        assert {r.title for r in b_results} == {"Org B Listing"}
        assert await listing_repo.get_by_id(db, listing_a.id, org_b.id) is None
