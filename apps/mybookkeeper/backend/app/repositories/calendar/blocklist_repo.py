"""Repository for ``calendar_listing_blocklist``.

INSERT … ON CONFLICT DO NOTHING makes every write idempotent — ignoring the
same external listing twice is a no-op, so the service doesn't need to
pre-check for existence.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar.calendar_listing_blocklist import CalendarListingBlocklist


async def is_blocked(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    source_channel: str,
    source_listing_id: str,
) -> bool:
    """Return True iff this (user, channel, listing) is on the blocklist."""
    result = await db.execute(
        select(CalendarListingBlocklist.id).where(
            CalendarListingBlocklist.user_id == user_id,
            CalendarListingBlocklist.source_channel == source_channel,
            CalendarListingBlocklist.source_listing_id == source_listing_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def insert_if_not_exists(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    source_channel: str,
    source_listing_id: str,
    reason: str | None,
) -> None:
    """Insert a blocklist entry, silently skipping duplicates."""
    stmt = (
        pg_insert(CalendarListingBlocklist)
        .values(
            id=uuid.uuid4(),
            user_id=user_id,
            organization_id=organization_id,
            source_channel=source_channel,
            source_listing_id=source_listing_id,
            reason=reason,
        )
        .on_conflict_do_nothing(
            constraint="uq_blocklist_user_channel_listing",
        )
    )
    await db.execute(stmt)
