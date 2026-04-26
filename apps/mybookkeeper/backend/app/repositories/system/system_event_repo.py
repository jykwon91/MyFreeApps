import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.system_event import SystemEvent


async def record(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    event_type: str,
    severity: str,
    message: str,
    data: dict | None = None,
) -> SystemEvent:
    event = SystemEvent(
        organization_id=organization_id,
        event_type=event_type,
        severity=severity,
        message=message,
        event_data=data,
    )
    db.add(event)
    await db.flush()
    return event


async def list_unresolved(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    severity: str | None = None,
) -> Sequence[SystemEvent]:
    stmt = select(SystemEvent).where(
        SystemEvent.organization_id == organization_id,
        SystemEvent.resolved.is_(False),
    )
    if severity:
        stmt = stmt.where(SystemEvent.severity == severity)
    stmt = stmt.order_by(SystemEvent.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_recent(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    limit: int = 10,
) -> Sequence[SystemEvent]:
    stmt = (
        select(SystemEvent)
        .where(SystemEvent.organization_id == organization_id)
        .order_by(SystemEvent.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_filtered(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    *,
    event_type: str | None = None,
    severity: str | None = None,
    resolved: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> Sequence[SystemEvent]:
    stmt = select(SystemEvent).where(SystemEvent.organization_id == organization_id)
    if event_type:
        stmt = stmt.where(SystemEvent.event_type == event_type)
    if severity:
        stmt = stmt.where(SystemEvent.severity == severity)
    if resolved is not None:
        stmt = stmt.where(SystemEvent.resolved == resolved)
    stmt = stmt.order_by(SystemEvent.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def resolve(db: AsyncSession, event_id: uuid.UUID, organization_id: uuid.UUID | None = None) -> bool:
    stmt = select(SystemEvent).where(SystemEvent.id == event_id)
    if organization_id is not None:
        stmt = stmt.where(SystemEvent.organization_id == organization_id)
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if not event:
        return False
    event.resolved = True
    event.resolved_at = datetime.now(timezone.utc)
    return True


async def resolve_by_type(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    event_type: str,
) -> int:
    stmt = (
        select(SystemEvent)
        .where(
            SystemEvent.organization_id == organization_id,
            SystemEvent.event_type == event_type,
            SystemEvent.resolved.is_(False),
        )
    )
    result = await db.execute(stmt)
    events = result.scalars().all()
    now = datetime.now(timezone.utc)
    for event in events:
        event.resolved = True
        event.resolved_at = now
    return len(events)


async def count_by_type(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    event_type: str,
    since: datetime,
) -> int:
    stmt = (
        select(func.count())
        .select_from(SystemEvent)
        .where(
            SystemEvent.organization_id == organization_id,
            SystemEvent.event_type == event_type,
            SystemEvent.created_at >= since,
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def get_health_summary(
    db: AsyncSession,
    organization_id: uuid.UUID | None,
    since: datetime,
) -> list[dict]:
    """Aggregated counts by type+severity for unresolved events in the given time window."""
    stmt = (
        select(
            SystemEvent.event_type,
            SystemEvent.severity,
            func.count().label("count"),
        )
        .where(
            SystemEvent.organization_id == organization_id,
            SystemEvent.created_at >= since,
            SystemEvent.resolved.is_(False),
        )
        .group_by(SystemEvent.event_type, SystemEvent.severity)
    )
    result = await db.execute(stmt)
    return [
        {"event_type": row.event_type, "severity": row.severity, "count": row.count}
        for row in result.all()
    ]
