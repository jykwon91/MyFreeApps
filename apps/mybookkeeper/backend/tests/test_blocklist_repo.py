"""Tests for the calendar_listing_blocklist repository.

Covers:
- insert_if_not_exists — idempotency on UNIQUE constraint
- is_blocked — returns True for blocklisted, False otherwise
- Cross-user isolation — same channel/listing but different user not blocked
"""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.calendar import blocklist_repo


class TestBlocklistRepo:
    @pytest.mark.asyncio
    async def test_is_blocked_returns_false_for_new_entry(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=test_user.id,
            source_channel="airbnb",
            source_listing_id="12345",
        )
        assert blocked is False

    @pytest.mark.asyncio
    async def test_insert_then_is_blocked(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        await blocklist_repo.insert_if_not_exists(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            source_channel="airbnb",
            source_listing_id="12345",
            reason=None,
        )
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=test_user.id,
            source_channel="airbnb",
            source_listing_id="12345",
        )
        assert blocked is True

    @pytest.mark.asyncio
    async def test_insert_twice_is_idempotent(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        """Inserting the same (user, channel, listing) twice must not raise."""
        for _ in range(2):
            await blocklist_repo.insert_if_not_exists(
                db,
                user_id=test_user.id,
                organization_id=test_org.id,
                source_channel="furnished_finder",
                source_listing_id="FF-999",
                reason="Ignore this one",
            )
        # No exception raised. Check the entry exists.
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=test_user.id,
            source_channel="furnished_finder",
            source_listing_id="FF-999",
        )
        assert blocked is True

    @pytest.mark.asyncio
    async def test_different_user_not_blocked(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        """A blocklist entry for user A does not block user B."""
        other_user_id = uuid.uuid4()
        await blocklist_repo.insert_if_not_exists(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            source_channel="vrbo",
            source_listing_id="VB-001",
            reason=None,
        )
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=other_user_id,
            source_channel="vrbo",
            source_listing_id="VB-001",
        )
        assert blocked is False

    @pytest.mark.asyncio
    async def test_different_channel_not_blocked(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        """Blocklisting listing X on Airbnb does not block listing X on Vrbo."""
        await blocklist_repo.insert_if_not_exists(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            source_channel="airbnb",
            source_listing_id="SAME-ID",
            reason=None,
        )
        blocked = await blocklist_repo.is_blocked(
            db,
            user_id=test_user.id,
            source_channel="vrbo",
            source_listing_id="SAME-ID",
        )
        assert blocked is False

    @pytest.mark.asyncio
    async def test_reason_stored(
        self, db: AsyncSession, test_user, test_org,
    ) -> None:
        from sqlalchemy import select
        from app.models.calendar.calendar_listing_blocklist import CalendarListingBlocklist

        await blocklist_repo.insert_if_not_exists(
            db,
            user_id=test_user.id,
            organization_id=test_org.id,
            source_channel="booking_com",
            source_listing_id="BDC-777",
            reason="Friend's listing",
        )
        result = await db.execute(
            select(CalendarListingBlocklist).where(
                CalendarListingBlocklist.user_id == test_user.id,
                CalendarListingBlocklist.source_listing_id == "BDC-777",
            )
        )
        row = result.scalar_one()
        assert row.reason == "Friend's listing"
