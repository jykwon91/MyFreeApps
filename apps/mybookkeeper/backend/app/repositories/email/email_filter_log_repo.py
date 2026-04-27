import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email.email_filter_log import EmailFilterLog


async def insert_ignore_conflict(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    message_id: str,
    from_address: str | None,
    subject: str | None,
    reason: str,
) -> None:
    """Insert a filter log row, silently ignoring duplicates.

    Duplicates can happen if a future re-sync sees the same already-filtered
    bounce — we keep the original row rather than spamming the audit trail.
    """
    stmt = pg_insert(EmailFilterLog).values(
        organization_id=organization_id,
        user_id=user_id,
        message_id=message_id,
        from_address=from_address,
        subject=subject,
        reason=reason,
    ).on_conflict_do_nothing()
    await db.execute(stmt)


async def list_recent(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[EmailFilterLog]:
    result = await db.execute(
        select(EmailFilterLog)
        .where(EmailFilterLog.organization_id == organization_id)
        .order_by(EmailFilterLog.filtered_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


async def get_message_ids(
    db: AsyncSession, organization_id: uuid.UUID
) -> set[str]:
    result = await db.execute(
        select(EmailFilterLog.message_id).where(
            EmailFilterLog.organization_id == organization_id
        )
    )
    return {row[0] for row in result.all()}
