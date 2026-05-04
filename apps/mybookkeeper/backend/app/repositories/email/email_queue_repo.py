import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select, func, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import undefer

from app.models.email.email_queue import EmailQueue


async def get_by_id(db: AsyncSession, item_id: uuid.UUID) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue).where(EmailQueue.id == item_id)
    )
    return result.scalar_one_or_none()


async def get_with_content(
    db: AsyncSession, item_id: uuid.UUID, organization_id: uuid.UUID
) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue)
        .options(undefer(EmailQueue.raw_content))
        .where(
            EmailQueue.id == item_id,
            EmailQueue.organization_id == organization_id,
        )
    )
    return result.scalar_one_or_none()


async def get_message_ids(db: AsyncSession, organization_id: uuid.UUID) -> set[str]:
    """Return message_ids that should be EXCLUDED from re-fetch.

    Excludes:
      - Rows currently in flight (``fetched``, ``extracting``)
      - Rows that successfully produced a Document (``done``)

    Does NOT exclude:
      - ``failed`` rows — let them be retried
      - ``skipped`` rows — re-fetch so the current prompt gets another chance
        (these are emails the extractor classified as duplicates/no-op; if the
        prompt has improved since, we want a re-run. Token cost is bounded
        because legit duplicates re-skip quickly.)

    The status filter here is the systemic fix for the
    'fetched-once-locked-forever' lockout: if an email was previously fetched
    but no Document survived (silent skip / extraction error), the message is
    eligible for re-fetch on the next sync.
    """
    result = await db.execute(
        select(EmailQueue.message_id).where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status.in_(("fetched", "extracting", "done")),
        )
    )
    return {row[0] for row in result.all()}


async def insert_ignore_conflict(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: str,
    sync_log_id: int,
    attachment_id: str,
    attachment_filename: str | None,
    attachment_content_type: str | None,
    email_subject: str | None,
) -> None:
    stmt = pg_insert(EmailQueue).values(
        organization_id=organization_id,
        user_id=user_id,
        message_id=message_id,
        sync_log_id=sync_log_id,
        attachment_id=attachment_id,
        attachment_filename=attachment_filename,
        attachment_content_type=attachment_content_type,
        email_subject=email_subject,
    ).on_conflict_do_nothing()
    await db.execute(stmt)


async def reset_stuck(
    db: AsyncSession,
    organization_id: uuid.UUID,
    from_statuses: list[str],
    to_status: str,
    *,
    error: str | None = None,
) -> None:
    await db.execute(
        update(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status.in_(from_statuses),
        )
        .values(status=to_status, error=error)
    )


async def claim_next_pending(
    db: AsyncSession, organization_id: uuid.UUID
) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "pending",
        )
        .order_by(EmailQueue.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return result.scalar_one_or_none()


async def claim_next_fetched(
    db: AsyncSession, organization_id: uuid.UUID
) -> EmailQueue | None:
    result = await db.execute(
        select(EmailQueue)
        .options(undefer(EmailQueue.raw_content))
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "fetched",
        )
        .order_by(EmailQueue.created_at.asc())
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    return result.scalar_one_or_none()


async def delete_item(db: AsyncSession, item: EmailQueue) -> None:
    await db.delete(item)


async def mark_status(
    db: AsyncSession,
    item: EmailQueue,
    status: str,
    *,
    error: str | None = None,
) -> None:
    item.status = status
    item.error = error


async def store_fetched_content(
    db: AsyncSession, item: EmailQueue, raw_content: bytes
) -> None:
    item.raw_content = raw_content
    item.status = "fetched"
    item.error = None


async def mark_done(db: AsyncSession, item: EmailQueue) -> None:
    item.status = "done"
    item.raw_content = None
    item.error = None


async def mark_skipped(db: AsyncSession, item: EmailQueue, *, reason: str | None = None) -> None:
    """Mark a queue row as skipped — extraction succeeded but produced no
    Document (e.g. classified as a payment-confirmation duplicate).

    Distinct from ``done`` so a future sync (with a possibly-improved prompt)
    can re-fetch and re-extract — see ``get_message_ids`` for the dedup rule.
    """
    item.status = "skipped"
    item.raw_content = None
    item.error = reason[:1000] if reason else None


async def count_by_status(
    db: AsyncSession, organization_id: uuid.UUID, status: str
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == status,
        )
    )
    return result.scalar_one()


async def count_pending_for_sync(
    db: AsyncSession, sync_log_id: int
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(EmailQueue)
        .where(
            EmailQueue.sync_log_id == sync_log_id,
            EmailQueue.status.in_(["pending", "fetching", "fetched", "extracting"]),
        )
    )
    return result.scalar_one()


async def list_recent(
    db: AsyncSession, organization_id: uuid.UUID, limit: int = 100
) -> Sequence[EmailQueue]:
    result = await db.execute(
        select(EmailQueue)
        .where(EmailQueue.organization_id == organization_id)
        .order_by(EmailQueue.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def cancel_active(db: AsyncSession, organization_id: uuid.UUID) -> None:
    await db.execute(
        update(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status.in_(["pending", "extracting"]),
        )
        .values(status="failed", error="Cancelled by user")
    )


async def retry_item(db: AsyncSession, item: EmailQueue) -> str:
    if item.raw_content is not None:
        new_status = "fetched"
    else:
        new_status = "pending"
    item.status = new_status
    item.error = None
    return new_status


async def retry_all_failed(db: AsyncSession, organization_id: uuid.UUID) -> None:
    # Items with raw_content -> fetched
    await db.execute(
        update(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "failed",
            EmailQueue.raw_content.isnot(None),
        )
        .values(status="fetched", error=None)
    )
    # Items without raw_content -> pending
    await db.execute(
        update(EmailQueue)
        .where(
            EmailQueue.organization_id == organization_id,
            EmailQueue.status == "failed",
            EmailQueue.raw_content.is_(None),
        )
        .values(status="pending", error=None)
    )


async def get_status_counts_for_sync(
    db: AsyncSession, sync_log_id: int
) -> dict[str, int]:
    result = await db.execute(
        select(EmailQueue.status, func.count())
        .where(EmailQueue.sync_log_id == sync_log_id)
        .group_by(EmailQueue.status)
    )
    return {row[0]: row[1] for row in result.all()}


async def get_status_counts_batch(
    db: AsyncSession, sync_log_ids: list[int],
) -> dict[int, dict[str, int]]:
    if not sync_log_ids:
        return {}
    result = await db.execute(
        select(EmailQueue.sync_log_id, EmailQueue.status, func.count())
        .where(EmailQueue.sync_log_id.in_(sync_log_ids))
        .group_by(EmailQueue.sync_log_id, EmailQueue.status)
    )
    counts: dict[int, dict[str, int]] = {sid: {} for sid in sync_log_ids}
    for row in result.all():
        counts[row[0]][row[1]] = row[2]
    return counts
