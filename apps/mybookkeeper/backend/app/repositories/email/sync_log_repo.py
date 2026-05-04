import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.integrations.sync_log import SyncLog


async def get_by_id(db: AsyncSession, sync_log_id: int) -> SyncLog | None:
    result = await db.execute(
        select(SyncLog).where(SyncLog.id == sync_log_id)
    )
    return result.scalar_one_or_none()


async def count_running(
    db: AsyncSession, organization_id: uuid.UUID, provider: str
) -> int:
    result = await db.execute(
        select(func.count())
        .select_from(SyncLog)
        .where(
            SyncLog.organization_id == organization_id,
            SyncLog.provider == provider,
            SyncLog.status == "running",
        )
    )
    return result.scalar_one()


async def timeout_stuck(
    db: AsyncSession, organization_id: uuid.UUID, provider: str, cutoff: datetime
) -> None:
    await db.execute(
        update(SyncLog)
        .where(
            SyncLog.organization_id == organization_id,
            SyncLog.provider == provider,
            SyncLog.status == "running",
            SyncLog.started_at < cutoff,
        )
        .values(
            status="failed",
            error="Timed out",
            completed_at=datetime.now(timezone.utc),
        )
    )


async def create(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    provider: str,
    status: str,
    *,
    records_added: int = 0,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
    gmail_matches_total: int = 0,
) -> SyncLog:
    log = SyncLog(
        organization_id=organization_id,
        user_id=user_id,
        provider=provider,
        status=status,
        records_added=records_added,
        started_at=started_at or datetime.now(timezone.utc),
        completed_at=completed_at,
        gmail_matches_total=gmail_matches_total,
    )
    db.add(log)
    await db.flush()
    return log


async def cancel_running(
    db: AsyncSession, organization_id: uuid.UUID, provider: str
) -> None:
    await db.execute(
        update(SyncLog)
        .where(
            SyncLog.organization_id == organization_id,
            SyncLog.provider == provider,
            SyncLog.status == "running",
        )
        .values(
            status="failed",
            error="Cancelled by user",
            completed_at=datetime.now(timezone.utc),
        )
    )


async def list_recent(
    db: AsyncSession,
    organization_id: uuid.UUID,
    provider: str,
    limit: int = 10,
) -> Sequence[SyncLog]:
    result = await db.execute(
        select(SyncLog)
        .where(
            SyncLog.organization_id == organization_id,
            SyncLog.provider == provider,
        )
        .order_by(SyncLog.started_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def mark_completed(
    db: AsyncSession,
    log: SyncLog,
    status: str,
    *,
    error: str | None = None,
) -> None:
    log.status = status
    log.completed_at = datetime.now(timezone.utc)
    if error is not None:
        log.error = error


async def increment_records(
    db: AsyncSession, log: SyncLog, count: int
) -> None:
    log.records_added = log.records_added + count


async def is_cancelled(db: AsyncSession, sync_log_id: int) -> bool:
    """Check if a sync session has been cancelled (cancelled_at IS NOT NULL)."""
    result = await db.execute(
        select(SyncLog.cancelled_at).where(SyncLog.id == sync_log_id)
    )
    row = result.scalar_one_or_none()
    return row is not None


async def cancel(db: AsyncSession, sync_log_id: int) -> bool:
    """Set cancelled_at on a running sync log. Returns True if updated."""
    result = await db.execute(
        update(SyncLog)
        .where(
            SyncLog.id == sync_log_id,
            SyncLog.status == "running",
            SyncLog.cancelled_at.is_(None),
        )
        .values(cancelled_at=datetime.now(timezone.utc))
    )
    return result.rowcount > 0
