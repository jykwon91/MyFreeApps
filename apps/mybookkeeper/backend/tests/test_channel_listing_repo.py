"""Repository tests for ``channel_listing_repo`` + ``listing_blackout_repo``.

In-memory SQLite via the shared ``db`` fixture. The PostgreSQL-only
features (partial UNIQUE, JSONB constraint) are skipped on SQLite via
``conftest._patch_metadata_for_sqlite``; the dedup behaviour we're
testing here lives at the application layer (the upsert helper) so it
works on either DB.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.channel import Channel
from app.models.listings.channel_listing import ChannelListing
from app.models.listings.listing import Listing
from app.models.listings.listing_blackout import ListingBlackout
from app.models.organization.organization import Organization
from app.models.properties.property import Property
from app.models.user.user import User
from app.repositories import channel_listing_repo, listing_blackout_repo


async def _seed_channel(db: AsyncSession, slug: str = "airbnb") -> Channel:
    channel = Channel(
        id=slug, name=slug.title(),
        supports_ical_export=True, supports_ical_import=True,
    )
    db.add(channel)
    await db.flush()
    return channel


async def _seed_property(db: AsyncSession, org: Organization, user: User) -> Property:
    prop = Property(
        organization_id=org.id, user_id=user.id,
        name="Travel-Nurse House", address="100 Med Center Dr",
    )
    db.add(prop)
    await db.flush()
    return prop


async def _seed_listing(db: AsyncSession, org: Organization, user: User) -> Listing:
    prop = await _seed_property(db, org, user)
    listing = Listing(
        id=uuid.uuid4(),
        organization_id=org.id, user_id=user.id, property_id=prop.id,
        title="Master Bedroom",
        monthly_rate=Decimal("1500.00"),
        room_type="private_room",
        private_bath=False, parking_assigned=False, furnished=True,
        status="active", amenities=[], pets_on_premises=False,
    )
    db.add(listing)
    await db.flush()
    return listing


class TestChannelListingCRUD:
    @pytest.mark.asyncio
    async def test_create_persists_token_and_returns_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_channel(db, "airbnb")
        listing = await _seed_listing(db, test_org, test_user)

        row = await channel_listing_repo.create(
            db,
            listing_id=listing.id,
            channel_id="airbnb",
            external_url="https://airbnb.com/rooms/12345",
            external_id="12345",
            ical_import_url="https://airbnb.com/calendar/ical/12345.ics?s=secret",
            ical_import_secret_token=None,
        )
        await db.commit()

        assert row.id is not None
        assert row.ical_export_token != ""
        # token_urlsafe(24) -> 32 url-safe chars
        assert len(row.ical_export_token) >= 30

        fetched = await channel_listing_repo.get_by_id(db, row.id, listing.id)
        assert fetched is not None
        assert fetched.ical_import_url == "https://airbnb.com/calendar/ical/12345.ics?s=secret"

    @pytest.mark.asyncio
    async def test_get_by_export_token_returns_correct_row(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_channel(db, "airbnb")
        listing = await _seed_listing(db, test_org, test_user)

        row = await channel_listing_repo.create(
            db,
            listing_id=listing.id, channel_id="airbnb",
            external_url="https://airbnb.com/rooms/x",
            external_id=None, ical_import_url=None, ical_import_secret_token=None,
        )
        await db.commit()

        looked_up = await channel_listing_repo.get_by_export_token(db, row.ical_export_token)
        assert looked_up is not None
        assert looked_up.id == row.id

    @pytest.mark.asyncio
    async def test_get_by_export_token_returns_none_for_unknown(
        self, db: AsyncSession,
    ) -> None:
        result = await channel_listing_repo.get_by_export_token(db, "definitely-not-a-real-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_exists_for_channel_pre_check(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_channel(db, "airbnb")
        await _seed_channel(db, "vrbo")
        listing = await _seed_listing(db, test_org, test_user)

        assert await channel_listing_repo.exists_for_channel(db, listing.id, "airbnb") is False

        await channel_listing_repo.create(
            db,
            listing_id=listing.id, channel_id="airbnb",
            external_url="https://x.com", external_id=None,
            ical_import_url=None, ical_import_secret_token=None,
        )
        await db.commit()

        assert await channel_listing_repo.exists_for_channel(db, listing.id, "airbnb") is True
        assert await channel_listing_repo.exists_for_channel(db, listing.id, "vrbo") is False

    @pytest.mark.asyncio
    async def test_update_applies_allowlisted_fields_only(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_channel(db, "airbnb")
        listing = await _seed_listing(db, test_org, test_user)

        row = await channel_listing_repo.create(
            db, listing_id=listing.id, channel_id="airbnb",
            external_url="https://airbnb.com/x", external_id=None,
            ical_import_url=None, ical_import_secret_token=None,
        )
        await db.commit()

        # Allowlisted: external_url updates; ignored: channel_id (immutable).
        updated = await channel_listing_repo.update(
            db, row.id, listing.id,
            {"external_url": "https://airbnb.com/y", "channel_id": "vrbo"},
        )
        await db.commit()

        assert updated is not None
        assert updated.external_url == "https://airbnb.com/y"
        assert updated.channel_id == "airbnb"  # not changed

    @pytest.mark.asyncio
    async def test_delete_returns_false_when_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        result = await channel_listing_repo.delete_by_id(db, uuid.uuid4(), listing.id)
        assert result is False

    @pytest.mark.asyncio
    async def test_list_pollable_excludes_rows_without_url(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        await _seed_channel(db, "airbnb")
        await _seed_channel(db, "vrbo")
        listing = await _seed_listing(db, test_org, test_user)

        await channel_listing_repo.create(
            db, listing_id=listing.id, channel_id="airbnb",
            external_url="https://airbnb.com/x", external_id=None,
            ical_import_url="https://airbnb.com/cal.ics", ical_import_secret_token=None,
        )
        await channel_listing_repo.create(
            db, listing_id=listing.id, channel_id="vrbo",
            external_url="https://vrbo.com/x", external_id=None,
            ical_import_url=None, ical_import_secret_token=None,
        )
        await db.commit()

        rows = await channel_listing_repo.list_pollable(db)
        assert len(rows) == 1
        assert rows[0].channel_id == "airbnb"


class TestListingBlackoutUpsertAndDelete:
    @pytest.mark.asyncio
    async def test_upsert_inserts_when_missing(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        row = await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing.id, source="airbnb", source_event_id="abc-123",
            starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 20),
        )
        await db.commit()

        assert row.starts_on == date(2026, 6, 15)
        assert row.ends_on == date(2026, 6, 20)
        assert row.source == "airbnb"
        assert row.source_event_id == "abc-123"

    @pytest.mark.asyncio
    async def test_upsert_updates_existing_when_uid_matches(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        first = await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing.id, source="airbnb", source_event_id="abc-123",
            starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 20),
        )
        await db.commit()

        second = await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing.id, source="airbnb", source_event_id="abc-123",
            starts_on=date(2026, 6, 18), ends_on=date(2026, 6, 22),
        )
        await db.commit()

        # Same row updated in place.
        assert second.id == first.id
        assert second.starts_on == date(2026, 6, 18)
        assert second.ends_on == date(2026, 6, 22)

    @pytest.mark.asyncio
    async def test_delete_missing_uids_removes_only_unseen_uids(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        # Three uid-bearing rows for source=airbnb.
        for uid in ("a", "b", "c"):
            await listing_blackout_repo.upsert_by_uid(
                db,
                listing_id=listing.id, source="airbnb", source_event_id=uid,
                starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 20),
            )
        # One manual row that must NOT be touched (different source).
        manual = ListingBlackout(
            id=uuid.uuid4(), listing_id=listing.id,
            starts_on=date(2026, 7, 1), ends_on=date(2026, 7, 5),
            source="manual", source_event_id=None,
        )
        db.add(manual)
        await db.commit()

        deleted = await listing_blackout_repo.delete_missing_uids(
            db, listing_id=listing.id, source="airbnb", keep_uids={"a", "b"},
        )
        await db.commit()

        assert deleted == 1
        remaining_uids = await listing_blackout_repo.list_uids_by_source(
            db, listing.id, "airbnb",
        )
        assert remaining_uids == {"a", "b"}

        # Manual row still present.
        all_rows = await listing_blackout_repo.list_by_listing(db, listing.id)
        manual_rows = [r for r in all_rows if r.source == "manual"]
        assert len(manual_rows) == 1

    @pytest.mark.asyncio
    async def test_delete_missing_uids_with_empty_keep_clears_all_uid_rows(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        for uid in ("a", "b"):
            await listing_blackout_repo.upsert_by_uid(
                db,
                listing_id=listing.id, source="airbnb", source_event_id=uid,
                starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 16),
            )
        await db.commit()

        deleted = await listing_blackout_repo.delete_missing_uids(
            db, listing_id=listing.id, source="airbnb", keep_uids=set(),
        )
        await db.commit()
        assert deleted == 2

    @pytest.mark.asyncio
    async def test_delete_by_listing_and_source_drops_only_matching_source(
        self, db: AsyncSession, test_user: User, test_org: Organization,
    ) -> None:
        listing = await _seed_listing(db, test_org, test_user)

        await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing.id, source="airbnb", source_event_id="airbnb-1",
            starts_on=date(2026, 6, 15), ends_on=date(2026, 6, 16),
        )
        await listing_blackout_repo.upsert_by_uid(
            db,
            listing_id=listing.id, source="vrbo", source_event_id="vrbo-1",
            starts_on=date(2026, 6, 17), ends_on=date(2026, 6, 18),
        )
        manual = ListingBlackout(
            id=uuid.uuid4(), listing_id=listing.id,
            starts_on=date(2026, 7, 1), ends_on=date(2026, 7, 5),
            source="manual", source_event_id=None,
        )
        db.add(manual)
        await db.commit()

        await listing_blackout_repo.delete_by_listing_and_source(db, listing.id, "airbnb")
        await db.commit()

        rows = await listing_blackout_repo.list_by_listing(db, listing.id)
        sources = {r.source for r in rows}
        assert "airbnb" not in sources
        assert "vrbo" in sources
        assert "manual" in sources
