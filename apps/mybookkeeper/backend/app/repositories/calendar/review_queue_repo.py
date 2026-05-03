"""Repository for ``calendar_email_review_queue``.

All queries are scoped to (organization_id, id) or (user_id, id) to prevent
IDOR — a queue item can only be read or mutated by a request carrying the
correct org context.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.calendar.calendar_email_review_queue import CalendarEmailReviewQueue


async def list_pending(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
) -> list[CalendarEmailReviewQueue]:
    """Return all non-deleted pending items for an organisation, newest first."""
    result = await db.execute(
        select(CalendarEmailReviewQueue)
        .where(
            CalendarEmailReviewQueue.organization_id == organization_id,
            CalendarEmailReviewQueue.status == "pending",
            CalendarEmailReviewQueue.deleted_at.is_(None),
        )
        .order_by(CalendarEmailReviewQueue.created_at.desc())
    )
    return list(result.scalars().all())


async def get_by_id_scoped(
    db: AsyncSession,
    item_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> CalendarEmailReviewQueue | None:
    """Return one queue item iff it belongs to the given org and is not deleted."""
    result = await db.execute(
        select(CalendarEmailReviewQueue).where(
            CalendarEmailReviewQueue.id == item_id,
            CalendarEmailReviewQueue.organization_id == organization_id,
            CalendarEmailReviewQueue.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


async def count_pending(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
) -> int:
    """Return the count of pending (non-deleted) items for an organisation."""
    from sqlalchemy import func as sa_func
    result = await db.execute(
        select(sa_func.count(CalendarEmailReviewQueue.id)).where(
            CalendarEmailReviewQueue.organization_id == organization_id,
            CalendarEmailReviewQueue.status == "pending",
            CalendarEmailReviewQueue.deleted_at.is_(None),
        )
    )
    return result.scalar_one() or 0


async def insert_if_not_exists(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    email_message_id: str,
    source_channel: str,
    parsed_payload: dict,
) -> CalendarEmailReviewQueue | None:
    """Insert a new queue item, skipping if one already exists for this user + message.

    Returns the inserted row, or None if it was a no-op conflict.
    Idempotent: re-scanning the same email never creates duplicate entries.
    """
    new_id = uuid.uuid4()
    stmt = (
        pg_insert(CalendarEmailReviewQueue)
        .values(
            id=new_id,
            user_id=user_id,
            organization_id=organization_id,
            email_message_id=email_message_id,
            source_channel=source_channel,
            parsed_payload=parsed_payload,
            status="pending",
        )
        .on_conflict_do_nothing(
            index_elements=None,
            constraint="uq_review_queue_user_message_id",
        )
        .returning(CalendarEmailReviewQueue)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def mark_resolved(
    db: AsyncSession,
    item: CalendarEmailReviewQueue,
    *,
    resolved_at: datetime,
) -> None:
    """Transition a queue item to ``resolved``."""
    item.status = "resolved"
    item.resolved_at = resolved_at
    await db.flush()


async def mark_ignored(
    db: AsyncSession,
    item: CalendarEmailReviewQueue,
    *,
    resolved_at: datetime,
) -> None:
    """Transition a queue item to ``ignored``."""
    item.status = "ignored"
    item.resolved_at = resolved_at
    await db.flush()


async def soft_delete(
    db: AsyncSession,
    item: CalendarEmailReviewQueue,
    *,
    deleted_at: datetime,
) -> None:
    """Soft-delete a queue item (user dismissed without acting)."""
    item.deleted_at = deleted_at
    await db.flush()
