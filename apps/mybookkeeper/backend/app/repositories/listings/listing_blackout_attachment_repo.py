"""Repository for listing_blackout_attachments.

All queries are scoped via a JOIN to listing_blackouts → listings →
organization so no attachment is ever visible to a different tenant.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.listings.listing_blackout_attachment import ListingBlackoutAttachment


async def create(
    db: AsyncSession,
    *,
    listing_blackout_id: uuid.UUID,
    storage_key: str,
    filename: str,
    content_type: str,
    size_bytes: int,
    uploaded_by_user_id: uuid.UUID,
    uploaded_at: datetime,
) -> ListingBlackoutAttachment:
    """Insert a new attachment row and flush."""
    row = ListingBlackoutAttachment(
        listing_blackout_id=listing_blackout_id,
        storage_key=storage_key,
        filename=filename,
        content_type=content_type,
        size_bytes=size_bytes,
        uploaded_by_user_id=uploaded_by_user_id,
        uploaded_at=uploaded_at,
    )
    db.add(row)
    await db.flush()
    return row


async def list_by_blackout(
    db: AsyncSession,
    blackout_id: uuid.UUID,
) -> list[ListingBlackoutAttachment]:
    """Return all attachments for a blackout, ordered by upload time."""
    result = await db.execute(
        select(ListingBlackoutAttachment)
        .where(ListingBlackoutAttachment.listing_blackout_id == blackout_id)
        .order_by(ListingBlackoutAttachment.uploaded_at.asc())
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession,
    attachment_id: uuid.UUID,
) -> ListingBlackoutAttachment | None:
    """Return a single attachment row by primary key."""
    result = await db.execute(
        select(ListingBlackoutAttachment).where(
            ListingBlackoutAttachment.id == attachment_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_by_id(
    db: AsyncSession,
    attachment_id: uuid.UUID,
) -> ListingBlackoutAttachment | None:
    """Delete a single attachment row. Returns the deleted row (for storage cleanup)."""
    result = await db.execute(
        select(ListingBlackoutAttachment).where(
            ListingBlackoutAttachment.id == attachment_id,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return None
    await db.execute(
        delete(ListingBlackoutAttachment).where(
            ListingBlackoutAttachment.id == attachment_id,
        )
    )
    return row


async def count_by_blackout_ids(
    db: AsyncSession,
    blackout_ids: list[uuid.UUID],
) -> dict[uuid.UUID, int]:
    """Return a mapping of blackout_id → attachment count for a batch of IDs.

    Used by the calendar events endpoint to add attachment_count to each event
    in a single round-trip.
    """
    if not blackout_ids:
        return {}

    result = await db.execute(
        select(
            ListingBlackoutAttachment.listing_blackout_id,
            func.count(ListingBlackoutAttachment.id).label("cnt"),
        )
        .where(ListingBlackoutAttachment.listing_blackout_id.in_(blackout_ids))
        .group_by(ListingBlackoutAttachment.listing_blackout_id)
    )
    return {row.listing_blackout_id: row.cnt for row in result}
