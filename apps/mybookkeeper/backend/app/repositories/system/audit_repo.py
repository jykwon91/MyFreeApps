from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.audit_log import AuditLog


async def list_filtered(
    db: AsyncSession,
    *,
    table_name: str | None = None,
    record_id: str | None = None,
    operation: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[AuditLog]:
    filters: list = []
    if table_name:
        filters.append(AuditLog.table_name == table_name)
    if record_id:
        filters.append(AuditLog.record_id == record_id)
    if operation:
        filters.append(AuditLog.operation == operation)
    if start_date:
        filters.append(AuditLog.changed_at >= start_date)
    if end_date:
        filters.append(AuditLog.changed_at <= end_date)

    query = select(AuditLog).order_by(AuditLog.changed_at.desc()).limit(limit).offset(offset)
    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    return result.scalars().all()
