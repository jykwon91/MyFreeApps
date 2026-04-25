import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system.usage_log import UsageLog


async def count_today(db: AsyncSession, organization_id: uuid.UUID) -> int:
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    result = await db.execute(
        select(func.count())
        .select_from(UsageLog)
        .where(
            UsageLog.organization_id == organization_id,
            UsageLog.created_at >= today_start,
            UsageLog.file_type != "email",
        )
    )
    return result.scalar_one()


async def create(
    db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID, file_type: str, tokens: int,
    *, input_tokens: int = 0, output_tokens: int = 0, model_name: str | None = None,
) -> UsageLog:
    log = UsageLog(
        organization_id=organization_id, user_id=user_id, file_type=file_type,
        tokens=tokens, input_tokens=input_tokens, output_tokens=output_tokens,
        model_name=model_name,
    )
    db.add(log)
    await db.flush()
    return log


async def count_for_file_type_today(
    db: AsyncSession,
    organization_id: uuid.UUID,
    file_type: str,
) -> int:
    """Count usage log entries for a specific file_type tag since midnight today."""
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0,
    )
    result = await db.execute(
        select(func.count())
        .select_from(UsageLog)
        .where(
            UsageLog.organization_id == organization_id,
            UsageLog.file_type == file_type,
            UsageLog.created_at >= today_start,
        )
    )
    return result.scalar_one()


async def add_entry(
    db: AsyncSession,
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    file_type: str,
    tokens: int = 0,
) -> UsageLog:
    """Add a usage log entry and flush."""
    log = UsageLog(
        organization_id=organization_id,
        user_id=user_id,
        file_type=file_type,
        tokens=tokens,
    )
    db.add(log)
    await db.flush()
    return log


async def count_since(
    db: AsyncSession,
    organization_id: uuid.UUID,
    since: datetime,
) -> int:
    """Count all usage log entries for the org on or after `since`."""
    result = await db.execute(
        select(func.count())
        .select_from(UsageLog)
        .where(
            UsageLog.organization_id == organization_id,
            UsageLog.created_at >= since,
        )
    )
    return result.scalar_one()


async def sum_tokens_since(
    db: AsyncSession,
    organization_id: uuid.UUID,
    since: datetime,
) -> int:
    """Sum all token usage for the org on or after `since`. Returns 0 when no rows match."""
    result = await db.execute(
        select(func.coalesce(func.sum(UsageLog.tokens), 0))
        .where(
            UsageLog.organization_id == organization_id,
            UsageLog.created_at >= since,
        )
    )
    return result.scalar_one()
